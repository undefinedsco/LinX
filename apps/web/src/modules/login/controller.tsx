import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import { useNavigate } from '@tanstack/react-router'
import { useLoginStore, getAllProviders, type StoredAccount, type ProviderOption } from '@linx/stores/login'
import { hasStoredSolidSession, clearStoredSolidSession } from './login-utils'
import type { LocalServiceStatus } from './types'

// ============================================================================
// Constants
// ============================================================================

const SESSION_RESTORE_TIMEOUT = 3000
const PROVIDER_CHECK_TIMEOUT = 5000
const XPOD_CHECK_INTERVAL = 5000
const XPOD_LAUNCH_TIMEOUT = 30000

// XPod 检测配置 - 支持多个可能端口
const XPOD_PORTS = [3000, 5737, 8080]
const XPOD_HEALTH_PATH = '/.well-known/openid-configuration'

// ============================================================================
// Hook: useLoginController
// ============================================================================

export function useLoginController() {
  const { session, login, logout, sessionRequestInProgress } = useSession()
  const navigate = useNavigate()

  const {
    state,
    error,
    failedProvider,
    selectedProvider,
    storedAccount,
    customProviders,
    setState,
    setError,
    setSelectedProvider,
    loginFailed,
    loginSuccess,
    addCustomProvider,
    removeCustomProvider,
    reset,
  } = useLoginStore()

  const initRef = useRef(false)
  const restoreAttemptedRef = useRef(false)
  const localServiceCheckRef = useRef<NodeJS.Timeout | null>(null)

  // 本地服务状态
  const [localService, setLocalService] = useState<LocalServiceStatus | null>(null)
  const [isLaunching, setIsLaunching] = useState(false)

  // 合并 providers 列表
  const providers = getAllProviders(customProviders)

  // ==========================================================================
  // 状态机：初始化
  // ==========================================================================

  useEffect(() => {
    if (initRef.current) return
    if (typeof window === 'undefined') return
    initRef.current = true

    // 已登录，直接完成
    if (session.info.isLoggedIn) {
      setState('logged_in')
      return
    }

    // 检查是否有缓存会话
    const hasSession = hasStoredSolidSession()
    if (hasSession) {
      setState('restoring')
    } else {
      setState('selecting')
    }
  }, [session.info.isLoggedIn, setState])

  // ==========================================================================
  // 状态机：恢复会话
  // ==========================================================================

  useEffect(() => {
    if (state !== 'restoring') return
    if (restoreAttemptedRef.current) return
    restoreAttemptedRef.current = true

    const restore = async () => {
      try {
        await Promise.race([
          session.handleIncomingRedirect({
            url: window.location.href,
            restorePreviousSession: true,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), SESSION_RESTORE_TIMEOUT)
          ),
        ])

        // 恢复后检查是否真的登录了
        if (!session.info.isLoggedIn) {
          clearStoredSolidSession()
          setState('selecting')
        }
      } catch (err) {
        console.warn('Session restore failed:', err)
        clearStoredSolidSession()
        setState('selecting')
      }
    }

    restore()
  }, [state, session, setState])

  // ==========================================================================
  // 状态机：监听登录状态变化
  // ==========================================================================

  useEffect(() => {
    if (session.info.isLoggedIn && state !== 'logged_in') {
      // 登录成功，保存账号信息
      const account: StoredAccount = {
        displayName: 'LinX 用户',
        issuerUrl: selectedProvider || '',
        webId: session.info.webId,
      }
      loginSuccess(account)

      // 导航到主页
      const currentPath = window.location.pathname
      if (currentPath === '/' || currentPath.startsWith('/auth/callback')) {
        navigate({ to: '/$microAppId', params: { microAppId: 'chat' }, replace: true })
      }
    }
  }, [session.info.isLoggedIn, session.info.webId, state, selectedProvider, loginSuccess, navigate])

  // ==========================================================================
  // 本地服务检测
  // ==========================================================================

  /** 扫描本地 XPod 服务 */
  const checkLocalService = useCallback(async () => {
    for (const port of XPOD_PORTS) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 2000)

        const response = await fetch(`http://localhost:${port}${XPOD_HEALTH_PATH}`, {
          method: 'GET',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          const data = await response.json()
          setLocalService({
            running: true,
            url: `http://localhost:${port}`,
            label: '本地 XPod',
          })
          return
        }
      } catch {
        // 继续尝试下一个端口
      }
    }

    // 所有端口都未检测到
    setLocalService({ running: false })
  }, [])

  /** 启动本地服务 */
  const launchLocalService = useCallback(async () => {
    setIsLaunching(true)
    try {
      // 尝试通过 Electron API 启动
      if (typeof window !== 'undefined' && (window as any).electronAPI?.launchXPod) {
        await (window as any).electronAPI.launchXPod()
      } else {
        // Web 环境：打开下载页面或提示
        window.open('https://xpod.linx.io/download', '_blank')
      }

      // 轮询检查服务是否启动
      let attempts = 0
      const maxAttempts = 30 // 最多等待 30 秒
      const checkInterval = setInterval(async () => {
        attempts++
        await checkLocalService()
        if (localService?.running || attempts >= maxAttempts) {
          clearInterval(checkInterval)
          setIsLaunching(false)
        }
      }, 1000)
    } catch (err) {
      console.error('Failed to launch local service:', err)
      setIsLaunching(false)
    }
  }, [checkLocalService, localService?.running])

  // 定期检测本地服务状态
  useEffect(() => {
    if (typeof window === 'undefined') return

    // 初始检查
    checkLocalService()

    // 定期轮询
    localServiceCheckRef.current = setInterval(checkLocalService, XPOD_CHECK_INTERVAL)

    return () => {
      if (localServiceCheckRef.current) {
        clearInterval(localServiceCheckRef.current)
      }
    }
  }, [checkLocalService])

  // ==========================================================================
  // Actions
  // ==========================================================================

  /** 检查 Provider 是否可用 */
  const checkProvider = useCallback(async (url: string): Promise<void> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PROVIDER_CHECK_TIMEOUT)

    try {
      const configUrl = `${url.replace(/\/$/, '')}/.well-known/openid-configuration`
      await fetch(configUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('连接超时，请检查网络')
      }
      throw new Error('无法连接服务器')
    } finally {
      clearTimeout(timeoutId)
    }
  }, [])

  /** 连接到 Provider */
  const connect = useCallback(async (providerUrl: string) => {
    setSelectedProvider(providerUrl)
    setError(null)
    setState('connecting')

    try {
      // 1. 检查 Provider 可用性
      await checkProvider(providerUrl)

      // 2. 发起登录
      const redirectUrl = `${window.location.origin}/auth/callback`
      await login({
        oidcIssuer: providerUrl,
        redirectUrl,
        clientName: 'LinX',
      })
    } catch (err: any) {
      loginFailed(err.message || '连接失败', providerUrl)
    }
  }, [checkProvider, login, loginFailed, setError, setSelectedProvider, setState])

  /** 添加自定义 Provider */
  const addProvider = useCallback((url: string, label?: string) => {
    const normalized = url.replace(/\/+$/, '')
    const provider: ProviderOption = {
      id: normalized,
      url: normalized,
      label: label || new URL(normalized).hostname,
    }
    addCustomProvider(provider)
    return provider
  }, [addCustomProvider])

  /** 删除 Provider */
  const deleteProvider = useCallback((url: string) => {
    removeCustomProvider(url)
    if (selectedProvider === url) {
      setSelectedProvider(providers[0]?.url || null)
    }
  }, [providers, removeCustomProvider, selectedProvider, setSelectedProvider])

  /** 登出 */
  const signOut = useCallback(async () => {
    try {
      await logout()
    } catch (err) {
      console.warn('Logout failed:', err)
    }
    clearStoredSolidSession()
    reset()
  }, [logout, reset])

  // ==========================================================================
  // 返回值
  // ==========================================================================

  return {
    // 状态
    state,
    error,
    failedProvider,
    selectedProvider,
    storedAccount,
    providers,
    isConnecting: state === 'connecting' || sessionRequestInProgress,
    localService,
    isLaunching,

    // Actions
    connect,
    addProvider,
    deleteProvider,
    signOut,
    setSelectedProvider,
    clearError: () => setError(null),
    onLaunchLocalService: launchLocalService,
  }
}
