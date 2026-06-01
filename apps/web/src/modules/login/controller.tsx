import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import { useNavigate } from '@tanstack/react-router'
import { LINX_CLOUD_IDENTITY_ORIGIN } from '@undefineds.co/models/client'
import { defaultMicroAppId } from '@/modules/layout/micro-app-registry'
import { isLocalAccessUrl } from '@/lib/local-access-url'
import { getRememberedAccount, useLoginStore, type StoredAccount } from '@linx/stores/login'
import { useSessionRestore } from './hooks/use-session-restore'
import { useOidcConnect } from './hooks/use-oidc-connect'
import { useProviders } from './hooks/use-providers'
import { useEmbeddedAuthorizationState } from './hooks/use-embedded-authorization-state'
import {
  clearPendingCallbackError,
  clearPendingLoginAttempt,
  clearPendingPostLoginMicroAppId,
  clearStoredSolidSession,
  consumePendingPostLoginMicroAppId,
  ensurePendingPostLoginMicroAppId,
  getPendingLoginAttempt,
  getStoredSolidSession,
  getPendingCallbackError,
  resolvePostLoginMicroAppId,
  SIGN_OUT_EVENT,
} from './login-utils'
import type { ConnectingProviderInfo, LocalLoginProviderSource, LoginProviderOption } from './types'
import { detectStorageConflict, type StorageConflict } from './storage-reconciliation'
import {
  isLocalLoginProviderSource,
  resolveLoginProviderSource,
} from './provider-model'

const LOCAL_RESTORE_TIMEOUT_MS = 5000
function normalizeUrl(url: string): string {
  return url.replace(/\/$/, '')
}

function restoreStoredSolidSession(session: ReturnType<typeof useSession>['session']) {
  return Promise.race([
    session.handleIncomingRedirect({
      url: window.location.href,
      restorePreviousSession: true,
    }),
    new Promise<undefined>((resolve) => {
      window.setTimeout(() => resolve(undefined), LOCAL_RESTORE_TIMEOUT_MS)
    }),
  ])
}

export function useLoginController() {
  const { session, logout, sessionRequestInProgress } = useSession()
  const navigate = useNavigate()
  const [view, setView] = useState<'default' | 'local'>('default')

  const {
    state,
    error,
    storedAccount,
    setState,
    setError,
    setStoredAccount,
    loginSuccess,
    reset,
  } = useLoginStore()

  const initRef = useRef(false)
  const suppressAutoLoginRef = useRef(false)
  const localConnectKeyRef = useRef<string | null>(null)
  const desktopAuthPendingRef = useRef(false)
  const desktopAuthSurfaceOpenedRef = useRef(false)
  const silentLocalFallbackStartedRef = useRef(false)
  const loginFinalizeGenerationRef = useRef(0)
  const restore = useSessionRestore()
  const oidc = useOidcConnect()
  const embeddedAuthorization = useEmbeddedAuthorizationState()
  const {
    providers,
    addProvider,
    removeProvider,
    localOnboarding,
    startLocal,
  } = useProviders()
  const [localLoginActive, setLocalLoginActive] = useState(false)
  const [activeLocalProviderSource, setActiveLocalProviderSource] = useState<LocalLoginProviderSource>('local')
  const [storageConflict, setStorageConflict] = useState<StorageConflict | null>(null)
  const [connectingProvider, setConnectingProvider] = useState<ConnectingProviderInfo | null>(null)
  const isDesktop = typeof window !== 'undefined' && Boolean(window.xpodDesktop?.auth)
  const resetDesktopAuthState = useCallback((): void => {
    desktopAuthPendingRef.current = false
    desktopAuthSurfaceOpenedRef.current = false
  }, [])

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    if (session.info.isLoggedIn) {
      return
    }

    if (!isDesktop && restore.hasStoredSession) {
      setState('restoring')
    } else {
      setState('idle')
    }
  }, [isDesktop, restore.hasStoredSession, session.info.isLoggedIn, setState])

  useEffect(() => {
    if (storedAccount || session.info.isLoggedIn) return

    const rememberedAccount = getRememberedAccount()
    if (!rememberedAccount) return

    setStoredAccount(rememberedAccount)
  }, [session.info.isLoggedIn, setStoredAccount, storedAccount])

  useEffect(() => {
    if (restore.restoreComplete || !restore.restoreFailed) return

    const path = window.location.pathname
    const hasCallbackError =
      new URLSearchParams(window.location.search).has('error')
      || Boolean(getPendingCallbackError())
    const callbackRestoreFailed = path.startsWith('/auth/callback') && !hasCallbackError

    const pendingAttempt = getPendingLoginAttempt()
    const callbackError = getPendingCallbackError()
    if (
      pendingAttempt?.prompt === 'none'
      && callbackError?.error
      && isSilentAuthError(callbackError.error)
      && !silentLocalFallbackStartedRef.current
    ) {
      silentLocalFallbackStartedRef.current = true
      void oidc.connect(pendingAttempt.issuerUrl, {
        authorizationSurface: pendingAttempt.authorizationSurface,
        returnToMicroAppId: pendingAttempt.returnToMicroAppId,
        storageProviderUrl: pendingAttempt.storageProviderUrl,
        storageProviderLabel: pendingAttempt.storageProviderLabel,
        authorizationQuery: pendingAttempt.authorizationQuery,
      }).catch((error: any) => {
        resetDesktopAuthState()
        setConnectingProvider(null)
        setError(error?.message || '重新发起登录失败。')
        setState('idle')
      })
      return
    }

    // Only act on callback restore failures — don't interfere with user-initiated connecting state
    if (!callbackRestoreFailed && state === 'restoring') {
      setState('idle')
      return
    }

    if (!callbackRestoreFailed) return

    clearPendingLoginAttempt()
    clearPendingPostLoginMicroAppId()
    setConnectingProvider(null)
    setError('登录未完成，请重试。')

    navigate({
      to: '/$microAppId',
      params: { microAppId: defaultMicroAppId },
      replace: true,
    })

    setState('idle')
  }, [
    navigate,
    oidc,
    resetDesktopAuthState,
    restore.restoreComplete,
    restore.restoreFailed,
    setError,
    setState,
    state,
  ])

  useEffect(() => {
    if (!isDesktop || !desktopAuthPendingRef.current) return

    if (embeddedAuthorization.open && embeddedAuthorization.reason === 'opened') {
      desktopAuthSurfaceOpenedRef.current = true
      return
    }

    if (embeddedAuthorization.open) return
    if (!desktopAuthSurfaceOpenedRef.current) return

    resetDesktopAuthState()

    if (embeddedAuthorization.reason === 'completed') {
      setError(null)
      setState('restoring')
      return
    }

    if (state === 'connecting') {
      clearPendingLoginAttempt()
      clearPendingPostLoginMicroAppId()
      setConnectingProvider(null)
      setError('登录已取消。')
      setState('idle')
    }
  }, [
    embeddedAuthorization.open,
    embeddedAuthorization.reason,
    isDesktop,
    setError,
    resetDesktopAuthState,
    setState,
    state,
  ])

  useEffect(() => {
    if (sessionRequestInProgress) return
    if (!session.info.isLoggedIn) return
    if (state === 'authenticated') return
    if (storageConflict) return
    if (suppressAutoLoginRef.current) return

    const resolvedAccountContext = resolveAccountContext(storedAccount, providers)
    const storageProviderLabel = resolvedAccountContext.storageProviderLabel
    const storageProviderUrl = storageProviderLabel === 'Local'
      ? resolveCanonicalLocalStorageProviderUrl({
          storageProviderUrl: resolvedAccountContext.storageProviderUrl,
          localPublicUrl: localOnboarding?.publicUrl,
        })
      : resolvedAccountContext.storageProviderUrl
    const issuerUrl = resolvedAccountContext.issuerUrl
    const issuerLabel = resolvedAccountContext.issuerLabel
    const account: StoredAccount = {
      displayName: storedAccount?.displayName || 'LinX 用户',
      avatarUrl: storedAccount?.avatarUrl,
      issuerUrl,
      issuerLabel,
      storageProviderUrl,
      storageProviderLabel,
      webId: session.info.webId,
    }

    let cancelled = false

    const finalizeGeneration = loginFinalizeGenerationRef.current
    const isFinalizeCurrent = () => finalizeGeneration === loginFinalizeGenerationRef.current

    const finalizeLogin = async () => {
      const storageProviderPublicUrl = resolveConflictCheckPublicUrl({
        storageProviderLabel,
        storageProviderUrl,
        localPublicUrl: localOnboarding?.publicUrl,
      })
      if (storageProviderLabel === 'Local' && !storageProviderPublicUrl) {
        throw new Error('Local canonical storage URL 缺失，已阻止进入。请重新启动 Local 完成 Cloud 绑定。')
      }
      const conflict = await detectStorageConflict({
        webId: session.info.webId ?? '',
        storageProviderUrl,
        storageProviderPublicUrl,
        strictStoragePath: shouldUseStrictStoragePath({
          storageProviderLabel,
          storageProviderUrl,
          providers,
        }),
        fetch: session.fetch,
      })

      if (cancelled || !isFinalizeCurrent()) return

      if (conflict) {
        setStorageConflict(resolveStorageConflictAction(conflict, {
          storageProviderLabel,
          cloudIdentityUrl: localOnboarding?.cloudIdentityUrl,
          provisionCode: localOnboarding?.provisionCode,
        }))
        setStoredAccount(account)
        setView('default')
        setActiveLocalProviderSource('local')
        setLocalLoginActive(false)
        setConnectingProvider(null)
        localConnectKeyRef.current = null
        resetDesktopAuthState()
        clearPendingCallbackError()
        clearPendingLoginAttempt()
        clearPendingPostLoginMicroAppId()
        try {
          await logout()
        } catch {
          // ignore logout failures; local cleanup still runs below.
        }
        clearStoredSolidSession()
        setState('idle')
        return
      }

      setStorageConflict(null)
      loginSuccess(account)
      setView('default')
      setActiveLocalProviderSource('local')
      setLocalLoginActive(false)
      setConnectingProvider(null)
      localConnectKeyRef.current = null
      resetDesktopAuthState()
      clearPendingCallbackError()
      clearPendingLoginAttempt()

      const path = window.location.pathname
      if (path === '/' || path.startsWith('/auth/callback')) {
        const microAppId = consumePendingPostLoginMicroAppId()
        navigate({ to: '/$microAppId', params: { microAppId }, replace: true })
      }
    }

    void finalizeLogin().catch(async (error: any) => {
      if (cancelled || !isFinalizeCurrent()) return
      suppressAutoLoginRef.current = true
      if (account.storageProviderUrl) {
        setStoredAccount(account)
      }
      resetDesktopAuthState()
      setConnectingProvider(null)
      clearPendingCallbackError()
      clearPendingLoginAttempt()
      clearPendingPostLoginMicroAppId()
      try {
        await logout()
      } catch {
        // ignore logout failures; local cleanup still runs below.
      }
      clearStoredSolidSession()
      setState('idle')
      setError(error?.message || '登录后校验空间失败，请重试。')
    })

    return () => {
      cancelled = true
    }
  }, [
    localOnboarding?.publicUrl,
    loginSuccess,
    logout,
    navigate,
    providers,
    sessionRequestInProgress,
    session.info.isLoggedIn,
    session.info.webId,
    setError,
    setState,
    setStoredAccount,
    storageConflict,
    state,
    storedAccount,
    resetDesktopAuthState,
  ])

  const startLocalLogin = useCallback(async (
    source: LocalLoginProviderSource,
    options?: { restoreAccount?: StoredAccount | null },
  ) => {
    loginFinalizeGenerationRef.current += 1
    suppressAutoLoginRef.current = false
    setStorageConflict(null)
    setError(null)
    setState('idle')
    setConnectingProvider(null)
    resetDesktopAuthState()
    ensurePendingPostLoginMicroAppId(resolvePostLoginMicroAppId())
    setView('local')
    setActiveLocalProviderSource(source)
    setLocalLoginActive(false)
    localConnectKeyRef.current = null
    silentLocalFallbackStartedRef.current = false

    try {
      const canRestoreLocalSession = Boolean(
        options?.restoreAccount
        && canReuseSessionForLocalSpace({
          account: options.restoreAccount,
          providers,
          activeWebId: session.info.webId,
          storedSolidSession: getStoredSolidSession(),
        }),
      )

      if (!canRestoreLocalSession && session.info.isLoggedIn) {
        try {
          suppressAutoLoginRef.current = true
          await logout()
        } finally {
          suppressAutoLoginRef.current = false
        }
      }

      const snapshot = await startLocal(source)

      if (snapshot?.state === 'error') {
        setLocalLoginActive(false)
        setError(snapshot.message || '启动 Local 失败。')
        return
      }

      if (snapshot?.state === 'repair_required') {
        setLocalLoginActive(false)
        return
      }

      if (canRestoreLocalSession && snapshot?.state === 'ready') {
        if (session.info.isLoggedIn) {
          setState('restoring')
          return
        }

        if (!isDesktop && getStoredSolidSession()) {
          setState('restoring')

          try {
            const restored = await restoreStoredSolidSession(session)

            if (restored?.isLoggedIn || session.info.isLoggedIn) {
              setState('restoring')
              return
            }
          } catch {
            // fall through to interactive login
          } finally {
            setState('idle')
          }
        }
      }

      setLocalLoginActive(true)
    } catch (error: any) {
      setLocalLoginActive(false)
      setError(error?.message || '启动 Local 失败。')
    }
  }, [isDesktop, logout, providers, resetDesktopAuthState, session, setError, setState, startLocal])

  const connect = useCallback(async (providerKey: string) => {
    loginFinalizeGenerationRef.current += 1
    suppressAutoLoginRef.current = false
    setStorageConflict(null)
    const normalizedProviderKeyUrl = normalizeUrl(providerKey)
    const provider = resolveProviderByKey(providerKey, providers)
    const source = resolveLoginProviderSource(provider)
    if (isLocalLoginProviderSource(source)) {
      await startLocalLogin(source, {
        restoreAccount: getReusableLocalStoredAccount(storedAccount, providers, source),
      })
      return
    }
    const issuerUrl = provider?.oidcProvider?.url ?? normalizedProviderKeyUrl
    const storageProviderUrl = provider?.storageProvider?.url ?? normalizedProviderKeyUrl

    setView('default')
    setState('connecting')
    setError(null)
    setConnectingProvider({
      issuerLabel: provider?.oidcProvider?.label ?? resolveProviderDisplayName(provider, issuerUrl),
      issuerUrl,
      storageProviderLabel: provider?.storageProvider?.label ?? resolveProviderDisplayName(provider, storageProviderUrl),
      storageProviderUrl,
    })

    try {
      const desktopApi = typeof window !== 'undefined' ? window.xpodDesktop : undefined
      const surface = desktopApi ? 'embedded' : 'window'
      if (desktopApi) {
        desktopAuthPendingRef.current = true
        desktopAuthSurfaceOpenedRef.current = false
      }
      await oidc.connect(issuerUrl, {
        authorizationSurface: surface,
        storageProviderUrl,
        storageProviderLabel: provider?.storageProvider?.label ?? provider?.label,
        issuerLabel: provider?.oidcProvider?.label ?? resolveProviderDisplayName(provider, issuerUrl),
      })
    } catch (err: any) {
      resetDesktopAuthState()
      setConnectingProvider(null)
      setError(err.message || '连接失败')
      setState('idle')
    }
  }, [oidc, providers, resetDesktopAuthState, setError, setState, startLocalLogin, storedAccount])

  const continueStoredAccount = useCallback(() => {
    suppressAutoLoginRef.current = false
    setStorageConflict(null)
    setError(null)
    ensurePendingPostLoginMicroAppId(resolvePostLoginMicroAppId())

    const targetStorageProviderUrl =
      normalizeRememberedUrl(storedAccount?.storageProviderUrl)
      ?? normalizeRememberedUrl(storedAccount?.issuerUrl)
      ?? (storedAccount?.webId && isLocalAccessUrl(storedAccount.webId) ? 'http://localhost:5737' : null)
    if (!targetStorageProviderUrl) {
      setState('idle')
      return
    }

    const matched = resolveStoredAccountProvider(targetStorageProviderUrl, providers)
    const isRememberedLocal =
      isLocalLoginProviderSource(resolveLoginProviderSource(matched))
      || isLocalAccessUrl(targetStorageProviderUrl)
      || storedAccount?.storageProviderLabel === 'Local'
      || storedAccount?.storageProviderLabel === 'Standalone'
      || storedAccount?.issuerLabel === 'Local'
      || storedAccount?.issuerLabel === 'Standalone'
    if (isRememberedLocal) {
      void startLocalLogin(resolveLocalSourceForStoredAccount(storedAccount, matched), { restoreAccount: storedAccount })
      return
    }

    if (session.info.isLoggedIn) {
      setState('restoring')
      return
    }

    const storedSolidSession = getStoredSolidSession()
    if (!isDesktop && storedSolidSession) {
      setState('restoring')
      void session.handleIncomingRedirect({
        url: window.location.href,
        restorePreviousSession: true,
      }).then((restored) => {
        if (restored?.isLoggedIn || session.info.isLoggedIn) {
          setState('restoring')
          return
        }

        setState('idle')
        const matched = resolveStoredAccountProvider(targetStorageProviderUrl, providers)
        if (matched) {
          const matchedSource = resolveLoginProviderSource(matched)
          if (isLocalLoginProviderSource(matchedSource)) {
            void startLocalLogin(matchedSource)
            return
          }
          void connect(matched.id)
          return
        }

        if (isLocalAccessUrl(targetStorageProviderUrl)) {
          void startLocalLogin('standalone')
          return
        }

        void connect(targetStorageProviderUrl)
      }).catch(() => {
        setState('idle')
      })
      return
    }

    if (matched) {
      const matchedSource = resolveLoginProviderSource(matched)
      if (isLocalLoginProviderSource(matchedSource)) {
        void startLocalLogin(matchedSource)
        return
      }
      void connect(matched.id)
      return
    }

    if (isLocalAccessUrl(targetStorageProviderUrl)) {
      void startLocalLogin('standalone')
      return
    }

    void connect(targetStorageProviderUrl)
  }, [connect, isDesktop, providers, session, setState, startLocalLogin, storedAccount])

  const signInLocalOnboarding = useCallback(async () => {
    if (!localOnboarding || localOnboarding.state !== 'ready') {
      void startLocalLogin(activeLocalProviderSource, {
        restoreAccount: getReusableLocalStoredAccount(storedAccount, providers, activeLocalProviderSource),
      })
      return
    }

    const storedSolidSession = getStoredSolidSession()
    const shouldTrySilentDesktopAuth = isDesktop
      && session.info.isLoggedIn !== true
      && canReuseSessionForLocalSpace({
        account: storedAccount,
        providers,
        activeWebId: session.info.webId,
        storedSolidSession,
      })

    const isStandalone = activeLocalProviderSource === 'standalone'
    if (localOnboarding.spaceKind !== activeLocalProviderSource) {
      void startLocalLogin(activeLocalProviderSource, {
        restoreAccount: getReusableLocalStoredAccount(storedAccount, providers, activeLocalProviderSource),
      })
      return
    }

    const localProviderUrl = isStandalone
      ? normalizeRememberedUrl(localOnboarding.localUrl) ?? normalizeRememberedUrl(localOnboarding.baseUrl)
      : normalizeRememberedUrl(localOnboarding.publicUrl)
    if (!localProviderUrl) {
      setError(isStandalone
        ? 'Standalone 已启动，但本地登录入口尚未准备好。'
        : 'Local 已启动，但 canonical storage URL 尚未准备好。请重新启动 Local 完成 Cloud 绑定。')
      return
    }

    const issuerUrl = isStandalone
      ? localProviderUrl
      : normalizeRememberedUrl(localOnboarding.cloudIdentityUrl) ?? LINX_CLOUD_IDENTITY_ORIGIN

    if (!isStandalone && !localOnboarding.provisionCode) {
      setError('Local 还没完成 Cloud 绑定，暂时无法继续登录。')
      return
    }

    const connectKey = `${issuerUrl}|${localProviderUrl}|${localOnboarding.provisionCode ?? ''}`
    if (localConnectKeyRef.current === connectKey) return
    localConnectKeyRef.current = connectKey
    silentLocalFallbackStartedRef.current = false

    setLocalLoginActive(false)
    setState('connecting')
    setError(null)
    clearPendingCallbackError()
    if (isDesktop) {
      desktopAuthPendingRef.current = true
      desktopAuthSurfaceOpenedRef.current = false
    }
    setConnectingProvider({
      issuerLabel: isStandalone ? 'Standalone' : 'Cloud',
      issuerUrl,
      storageProviderLabel: isStandalone ? 'Standalone' : 'Local',
      storageProviderUrl: localProviderUrl,
    })

    const connectOptions = {
      authorizationSurface: 'embedded',
      storageProviderUrl: localProviderUrl,
      storageProviderLabel: isStandalone ? 'Standalone' : 'Local',
      issuerLabel: isStandalone ? 'Standalone' : 'Cloud',
      authorizationQuery: isStandalone
        ? undefined
        : { provisionCode: localOnboarding.provisionCode },
      ...(shouldTrySilentDesktopAuth ? { prompt: 'none' as const } : {}),
    } as const

    try {
      await oidc.connect(issuerUrl, connectOptions)
    } catch (error: any) {
      resetDesktopAuthState()
      localConnectKeyRef.current = null
      setConnectingProvider(null)
      setState('idle')
      setError(error?.message || (isStandalone ? '打开 Standalone 登录失败。' : '打开 Local 登录失败。'))
    }
  }, [
    activeLocalProviderSource,
    localOnboarding,
    oidc,
    isDesktop,
    resetDesktopAuthState,
    session.info.isLoggedIn,
    session.info.webId,
    providers,
    setError,
    setState,
    startLocalLogin,
    storedAccount,
  ])

  const saveLocalTunnelToken = useCallback(async (token: string) => {
    const desktopApi = typeof window !== 'undefined' ? window.xpodDesktop : undefined
    if (!desktopApi?.localOnboarding?.saveTunnelToken) {
      setError('当前桌面壳不支持保存 Tunnel token。')
      return
    }

    setError(null)
    setLocalLoginActive(true)
    try {
      await desktopApi.localOnboarding.saveTunnelToken({ token })
    } catch (error: any) {
      setError(error?.message || '保存 Tunnel token 失败。')
    } finally {
      setLocalLoginActive(false)
    }
  }, [setError])

  const testLocalConnectivity = useCallback(async () => {
    const desktopApi = typeof window !== 'undefined' ? window.xpodDesktop : undefined
    if (!desktopApi?.localOnboarding?.testConnectivity) {
      setError('当前桌面壳不支持测试 Local 联通性。')
      return
    }

    setError(null)
    setLocalLoginActive(true)
    try {
      await desktopApi.localOnboarding.testConnectivity()
    } catch (error: any) {
      setError(error?.message || '测试 Local 联通性失败。')
    } finally {
      setLocalLoginActive(false)
    }
  }, [setError])

  const backFromLocal = useCallback(() => {
    setError(null)
    setStorageConflict(null)
    clearPendingCallbackError()
    clearPendingLoginAttempt()
    clearPendingPostLoginMicroAppId()
    setView('default')
    setActiveLocalProviderSource('local')
    setLocalLoginActive(false)
    setConnectingProvider(null)
    localConnectKeyRef.current = null
    resetDesktopAuthState()
  }, [resetDesktopAuthState, setError])

  const cancelConnecting = useCallback(() => {
    setError(null)
    setStorageConflict(null)
    setView('default')
    setActiveLocalProviderSource('local')
    setLocalLoginActive(false)
    setConnectingProvider(null)
    localConnectKeyRef.current = null
    silentLocalFallbackStartedRef.current = false
    resetDesktopAuthState()
    clearPendingLoginAttempt()
    clearPendingPostLoginMicroAppId()
    if (state === 'connecting') {
      setState('idle')
    }
    void Promise.resolve(embeddedAuthorization.close()).catch(() => undefined)
  }, [embeddedAuthorization, resetDesktopAuthState, setError, setState, state])

  const switchAccount = useCallback(async () => {
    suppressAutoLoginRef.current = true
    try {
      await logout()
    } catch {
      // ignore
    }
    clearPendingLoginAttempt()
    clearPendingPostLoginMicroAppId()
    clearStoredSolidSession()
    setError(null)
    setStorageConflict(null)
    setStoredAccount(null)
    setState('idle')
    setView('default')
    setActiveLocalProviderSource('local')
    setLocalLoginActive(false)
    setConnectingProvider(null)
    localConnectKeyRef.current = null
    resetDesktopAuthState()
  }, [logout, resetDesktopAuthState, setError, setState, setStoredAccount])

  const signOut = useCallback(async () => {
    suppressAutoLoginRef.current = true
    try {
      await logout()
    } catch {
      // ignore
    }
    clearPendingLoginAttempt()
    clearPendingPostLoginMicroAppId()
    clearStoredSolidSession()
    setStorageConflict(null)
    setView('default')
    setActiveLocalProviderSource('local')
    setLocalLoginActive(false)
    setConnectingProvider(null)
    localConnectKeyRef.current = null
    resetDesktopAuthState()
    reset()
  }, [logout, reset, resetDesktopAuthState])

  // Listen for sign-out events from other components (e.g. PrimaryLayout)
  useEffect(() => {
    const handler = () => void signOut()
    window.addEventListener(SIGN_OUT_EVENT, handler)
    return () => window.removeEventListener(SIGN_OUT_EVENT, handler)
  }, [signOut])

  const clearError = useCallback(() => setError(null), [setError])
  const dismissStorageConflict = useCallback(() => {
    setStoredAccount(null)
    setError(null)
    setStorageConflict(null)
    setState('idle')
    setView('default')
    setLocalLoginActive(false)
    setConnectingProvider(null)
    localConnectKeyRef.current = null
    resetDesktopAuthState()
  }, [resetDesktopAuthState, setError, setState, setStoredAccount])
  const openCurrentSpacePodSetup = useCallback(() => {
    const setupUrl = storageConflict?.setupUrl ?? storageConflict?.managementUrl
    if (!setupUrl || typeof window === 'undefined') {
      return
    }

    const desktopApi = window.xpodDesktop
    if (desktopApi?.auth?.openEmbeddedAuthorization) {
      void desktopApi.auth.openEmbeddedAuthorization(setupUrl, {
        providerLabel: storageConflict?.setupKind === 'create-pod' ? 'Local' : undefined,
      })
      return
    }

    if (desktopApi?.app?.openExternal) {
      void desktopApi.app.openExternal(setupUrl)
      return
    }

    window.open(setupUrl, '_blank', 'noopener,noreferrer')
  }, [storageConflict?.managementUrl, storageConflict?.setupKind, storageConflict?.setupUrl])

  return {
    view,
    state,
    error,
    storedAccount,
    storageConflict,
    hasRestorableSession: hasRestorableSessionForStoredAccount(
      storedAccount,
      session.info.webId,
      getStoredSolidSession(),
    ),
    providers,
    localOnboarding,
    localProviderSource: activeLocalProviderSource,
    localLoginStatus: {
      active: localLoginActive,
      message: localLoginActive
        ? (localOnboarding?.message ?? (activeLocalProviderSource === 'standalone' ? '正在启动 Standalone…' : '正在启动 Local…'))
        : null,
    },
    authWindowStatus: {
      open: embeddedAuthorization.open,
      reason: embeddedAuthorization.reason,
      ready: embeddedAuthorization.ready,
    },
    connectingProvider,
    isRestoring: restore.isRestoring,
    connect,
    continueStoredAccount,
    continueLocalLogin: signInLocalOnboarding,
    saveLocalTunnelToken,
    testLocalConnectivity,
    backFromLocal,
    cancelConnecting,
    switchAccount,
    addProvider,
    removeProvider,
    signOut,
    clearError,
    dismissStorageConflict,
    openCurrentSpacePodSetup,
  }
}

function isSilentAuthError(error: string): boolean {
  return error === 'login_required'
    || error === 'interaction_required'
    || error === 'consent_required'
    || error === 'account_selection_required'
}

function resolveStorageConflictAction(
  conflict: StorageConflict,
  input: {
    storageProviderLabel?: string
    cloudIdentityUrl?: string | null
    provisionCode?: string | null
  },
): StorageConflict {
  if (input.storageProviderLabel !== 'Local' || !input.provisionCode) {
    return {
      ...conflict,
      setupUrl: conflict.managementUrl,
      setupKind: 'account-management',
    }
  }

  const createPodUrl = buildCloudScopedAccountUrl(input.cloudIdentityUrl, input.provisionCode)
  if (!createPodUrl) {
    return {
      ...conflict,
      setupUrl: conflict.managementUrl,
      setupKind: 'account-management',
    }
  }

  return {
    ...conflict,
    setupUrl: createPodUrl,
    setupKind: 'create-pod',
  }
}

function buildCloudScopedAccountUrl(
  cloudIdentityUrl: string | null | undefined,
  provisionCode: string,
): string | null {
  const normalizedCloudIdentityUrl = normalizeRememberedUrl(cloudIdentityUrl) ?? LINX_CLOUD_IDENTITY_ORIGIN
  try {
    const url = new URL('/.account/create-pod/', normalizedCloudIdentityUrl.endsWith('/')
      ? normalizedCloudIdentityUrl
      : `${normalizedCloudIdentityUrl}/`)
    url.searchParams.set('provisionCode', provisionCode)
    return url.toString()
  } catch {
    return null
  }
}

function resolveStoredAccountProvider(
  issuerUrl: string,
  providers: LoginProviderOption[],
): LoginProviderOption | null {
  const normalized = normalizeUrl(issuerUrl)
  if (isLocalAccessUrl(normalized)) {
    return providers.find((provider) => resolveLoginProviderSource(provider) === 'standalone')
      ?? null
  }

  const exact = providers.find((provider) => normalizeUrl(provider.url) === normalized)
  if (exact) return exact

  return null
}

function resolveProviderByKey(
  providerKey: string,
  providers: LoginProviderOption[],
): LoginProviderOption | undefined {
  const byId = providers.find((provider) => provider.id === providerKey)
  if (byId) {
    return byId
  }

  const normalized = normalizeUrl(providerKey)
  return providers.find((provider) => normalizeUrl(provider.url) === normalized)
}

function resolveLocalSourceForStoredAccount(
  account: StoredAccount | null,
  matched: LoginProviderOption | null,
): 'local' | 'standalone' {
  const resolved = resolveStoredAccountLocalSource(account, matched)
  if (resolved) {
    return resolved
  }

  const matchedSource = resolveLoginProviderSource(matched)
  if (isLocalLoginProviderSource(matchedSource)) {
    return matchedSource
  }

  return 'standalone'
}

function getReusableLocalStoredAccount(
  account: StoredAccount | null,
  providers: LoginProviderOption[],
  source: 'local' | 'standalone',
): StoredAccount | null {
  if (!account) {
    return null
  }

  return resolveStoredAccountLocalSource(account, resolveStoredAccountProviderForAccount(account, providers)) === source
    ? account
    : null
}

function isLocalStoredAccount(
  account: StoredAccount | null,
  providers: LoginProviderOption[],
): account is StoredAccount {
  return Boolean(account && resolveStoredAccountLocalSource(account, resolveStoredAccountProviderForAccount(account, providers)))
}

function resolveStoredAccountProviderForAccount(
  account: StoredAccount,
  providers: LoginProviderOption[],
): LoginProviderOption | null {
  const storageProviderUrl = normalizeRememberedUrl(account.storageProviderUrl)
    ?? normalizeRememberedUrl(account.issuerUrl)
    ?? (account.webId && isLocalAccessUrl(account.webId) ? account.webId : null)
  if (!storageProviderUrl) {
    return null
  }

  return resolveStoredAccountProvider(storageProviderUrl, providers)
}

function resolveStoredAccountLocalSource(
  account: StoredAccount | null,
  matched: LoginProviderOption | null,
): 'local' | 'standalone' | null {
  if (!account) {
    return null
  }

  const storageProviderUrl = normalizeRememberedUrl(account.storageProviderUrl)
    ?? normalizeRememberedUrl(account.issuerUrl)
    ?? (account.webId && isLocalAccessUrl(account.webId) ? account.webId : null)
  const issuerUrl = normalizeRememberedUrl(account.issuerUrl)
  const webId = normalizeRememberedUrl(account.webId)
  const storageProviderLabel = account.storageProviderLabel?.trim().toLowerCase()
  const issuerLabel = account.issuerLabel?.trim().toLowerCase()

  if (storageProviderLabel === 'standalone' || issuerLabel === 'standalone') {
    return 'standalone'
  }

  if (storageProviderLabel === 'local') {
    if (issuerLabel === 'standalone' || (issuerUrl && isLocalAccessUrl(issuerUrl))) {
      return 'standalone'
    }
    if (
      issuerLabel === 'cloud'
      || (issuerUrl && !isLocalAccessUrl(issuerUrl))
      || (storageProviderUrl && !isLocalAccessUrl(storageProviderUrl))
    ) {
      return 'local'
    }
    return 'standalone'
  }

  if (issuerLabel === 'local') {
    return 'standalone'
  }

  if (
    issuerUrl
    && storageProviderUrl
    && !sameUrlOrigin(issuerUrl, storageProviderUrl)
    && !isLocalAccessUrl(issuerUrl)
  ) {
    return 'local'
  }

  const matchedSource = resolveLoginProviderSource(matched)
  if (isLocalLoginProviderSource(matchedSource)) {
    return matchedSource
  }

  if ((issuerUrl && isLocalAccessUrl(issuerUrl)) || (webId && isLocalAccessUrl(webId)) || (storageProviderUrl && isLocalAccessUrl(storageProviderUrl))) {
    return 'standalone'
  }

  return null
}

function canReuseSessionForLocalSpace(input: {
  account: StoredAccount | null | undefined
  providers: LoginProviderOption[]
  activeWebId?: string
  storedSolidSession: ReturnType<typeof getStoredSolidSession>
}): boolean {
  if (!isLocalStoredAccount(input.account ?? null, input.providers)) {
    return false
  }

  const accountWebId = normalizeRememberedUrl(input.account?.webId)
  if (!accountWebId) {
    return false
  }

  if (input.activeWebId && normalizeWebId(input.activeWebId) === normalizeWebId(accountWebId)) {
    return true
  }

  const storedWebId = normalizeRememberedUrl(input.storedSolidSession?.webId)
  return Boolean(storedWebId && normalizeWebId(storedWebId) === normalizeWebId(accountWebId))
}

function hasRestorableSessionForStoredAccount(
  account: StoredAccount | null,
  activeWebId: string | undefined,
  storedSolidSession: ReturnType<typeof getStoredSolidSession>,
): boolean {
  const accountWebId = normalizeRememberedUrl(account?.webId)
  if (!accountWebId) {
    return false
  }

  if (activeWebId && normalizeWebId(activeWebId) === normalizeWebId(accountWebId)) {
    return true
  }

  const storedWebId = normalizeRememberedUrl(storedSolidSession?.webId)
  return Boolean(storedWebId && normalizeWebId(storedWebId) === normalizeWebId(accountWebId))
}

function normalizeWebId(webId: string): string {
  return webId.trim()
}

function resolveAccountContext(
  storedAccount: StoredAccount | null,
  providers: LoginProviderOption[],
): Pick<StoredAccount, 'issuerUrl' | 'issuerLabel' | 'storageProviderUrl' | 'storageProviderLabel'> {
  const pendingLoginAttempt = getPendingLoginAttempt()
  const storedSolidSession = getStoredSolidSession()
  const issuerUrl =
    pendingLoginAttempt?.issuerUrl
    ?? storedAccount?.issuerUrl
    ?? storedSolidSession?.issuerUrl
    ?? ''
  const storageProviderUrl =
    pendingLoginAttempt?.storageProviderUrl
    ?? storedAccount?.storageProviderUrl
    ?? issuerUrl

  return {
    issuerUrl,
    issuerLabel: resolveIssuerLabel(issuerUrl, providers, storedAccount?.issuerLabel),
    storageProviderUrl,
    storageProviderLabel: pendingLoginAttempt?.storageProviderLabel
      ?? resolveStorageProviderLabel(storageProviderUrl, providers, storedAccount?.storageProviderLabel),
  }
}

function resolveIssuerLabel(
  issuerUrl: string,
  providers: LoginProviderOption[],
  fallback?: string,
): string | undefined {
  if (!issuerUrl) {
    return fallback
  }

  if (isLocalAccessUrl(issuerUrl)) {
    return 'Standalone'
  }

  const matched = resolveStoredAccountProvider(issuerUrl, providers)
  if (matched) {
    const source = resolveLoginProviderSource(matched)
    if (source === 'cloud') return 'Cloud'
    if (source === 'local') return 'Local'
    if (source === 'standalone') return 'Standalone'
    return matched.label
  }

  try {
    return new URL(issuerUrl).hostname
  } catch {
    return fallback
  }
}

function resolveStorageProviderLabel(
  storageProviderUrl: string,
  providers: LoginProviderOption[],
  fallback?: string,
): string | undefined {
  if (!storageProviderUrl) {
    return fallback
  }

  const matched = resolveStoredAccountProvider(storageProviderUrl, providers)
  if (matched) {
    const source = resolveLoginProviderSource(matched)
    if (source === 'cloud') return 'Cloud'
    if (source === 'local') return 'Local'
    if (source === 'standalone') return 'Standalone'
    return matched.label
  }

  if (fallback === 'Local') {
    return 'Local'
  }

  if (fallback === 'Standalone') {
    return 'Standalone'
  }

  if (isLocalAccessUrl(storageProviderUrl)) {
    return 'Standalone'
  }

  try {
    return new URL(storageProviderUrl).hostname
  } catch {
    return fallback
  }
}

function resolveProviderDisplayName(provider: LoginProviderOption | undefined, fallbackUrl: string): string {
  const source = resolveLoginProviderSource(provider)
  if (source === 'cloud') return 'Cloud'
  if (source === 'local') return 'Local'
  if (source === 'standalone') return 'Standalone'
  if (provider?.label) return provider.label

  try {
    return new URL(fallbackUrl).hostname
  } catch {
    return fallbackUrl
  }
}

function sameUrlOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin
  } catch {
    return false
  }
}

function normalizeRememberedUrl(url?: string | null): string | null {
  if (typeof url !== 'string') {
    return null
  }

  const trimmed = url.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resolveConflictCheckPublicUrl(input: {
  storageProviderLabel?: string
  storageProviderUrl?: string
  localPublicUrl?: string | null
}): string | null {
  const urls = input.storageProviderLabel === 'Local'
    ? [input.localPublicUrl, input.storageProviderUrl && !isLocalAccessUrl(input.storageProviderUrl) ? input.storageProviderUrl : null]
    : [input.storageProviderUrl]

  for (const url of urls) {
    const normalized = normalizeRememberedUrl(url)
    if (!normalized) {
      continue
    }
    return normalized
  }
  return null
}

function shouldUseStrictStoragePath(input: {
  storageProviderLabel?: string
  storageProviderUrl?: string
  providers: LoginProviderOption[]
}): boolean {
  const matchedProvider = input.storageProviderUrl
    ? resolveStoredAccountProvider(input.storageProviderUrl, input.providers)
    : null
  if (matchedProvider && resolveLoginProviderSource(matchedProvider) === 'custom') {
    return false
  }

  const normalized = input.storageProviderLabel?.trim().toLowerCase()
  return normalized === 'cloud' || normalized === 'local' || normalized === 'standalone'
}

function resolveCanonicalLocalStorageProviderUrl(input: {
  storageProviderUrl?: string
  localPublicUrl?: string | null
}): string {
  const publicUrl = normalizeRememberedUrl(input.localPublicUrl)
  if (publicUrl) {
    return publicUrl
  }

  const storageProviderUrl = normalizeRememberedUrl(input.storageProviderUrl)
  if (storageProviderUrl && !isLocalAccessUrl(storageProviderUrl)) {
    return storageProviderUrl
  }

  return ''
}
