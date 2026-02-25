import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import { useNavigate } from '@tanstack/react-router'
import { solidProfileTable } from '@linx/models'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import type {
  SolidAccountPreview,
  SolidIssuerOption,
  SolidLoginModalProps,
} from './types'
import type { MicroAppId } from '@/modules/layout/micro-app-registry'
import { combineIssuerOptions, extractDomain, normalizeIssuerUrl, getIssuerLogoUrl, getProviderAlias, validateIssuer } from './utils'
import { useSolidLoginStore } from '@linx/stores/login'
import { loadStoredIssuers, upsertStoredIssuer } from './storage'
import {
  clearStoredSolidSession,
  ensureRedirectAllowed,
  hasStoredSolidSession,
  resolveRedirectUrl,
  setSkipAutoRestore,
  shouldSkipAutoRestore,
  getRedirectPath,
  saveRedirectPath,
} from './login-utils'
import { SESSION_STORAGE_KEY } from './constants'

const DEFAULT_ACCOUNT_PREVIEW: SolidAccountPreview = {
  displayName: 'Linq',
  handle: 'linx@linx.ai',
  issuerLabel: 'linx.ai',
  issuerDomain: 'linx.ai',
  issuerLogoUrl: 'https://linx.ai/favicon.ico',
}

const formatAccountHandle = (name: string, domain?: string) =>
  domain ? `${name}@${domain}` : name

const toStringValue = (value: unknown) => (typeof value === 'string' ? value : undefined)

const toUrlValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    if ('@id' in (value as Record<string, unknown>) && typeof (value as Record<string, unknown>)['@id'] === 'string') {
      return (value as Record<string, unknown>)['@id'] as string
    }
    if ('value' in (value as Record<string, unknown>) && typeof (value as Record<string, unknown>)['value'] === 'string') {
      return (value as Record<string, unknown>)['value'] as string
    }
  }
  return undefined
}

const determineInitialIssuer = (issuers: SolidIssuerOption[], storedAccount?: SolidAccountPreview): string | undefined => {
    if (storedAccount?.issuerDomain) {
      const candidate = issuers.find((issuer) => extractDomain(issuer.url) === storedAccount.issuerDomain)
      if (candidate) return candidate.url
    }
    return issuers[0]?.url
  }

export const useSolidLoginController = () => {
  const { session, login, logout, sessionRequestInProgress } = useSession()
  const { db } = useSolidDatabase()
  const navigate = useNavigate()

  const {
    mode,
    showModal,
    isRestoringSession,
    selectedIssuer,
    customIssuer,
    errorMessage,
    accountPreview,
    setMode: updateMode,
    setShowModal,
    setRestoringSession,
    setHasCachedSession,
    setSelectedIssuer,
    setCustomIssuer,
    resetCustomIssuer,
    setErrorMessage,
    setAccountPreview,
    storedAccount,
    setStoredAccount,
  } = useSolidLoginStore()

  const hasCachedSessionRef = useRef(false)
  const [storedIssuers, setStoredIssuers] = useState(() => loadStoredIssuers())
  const issuerOptions = useMemo(() => combineIssuerOptions(storedIssuers), [storedIssuers])
  const initialAccountPreview = storedAccount
  const [sessionProbeComplete, setSessionProbeComplete] = useState(false)

  useEffect(() => {
    if (!storedAccount) return
    if (!accountPreview) {
      setAccountPreview(storedAccount)
    }
  }, [accountPreview, setAccountPreview, storedAccount])
  const restoreAttemptedRef = useRef(false)
  const lastLoginIssuerRef = useRef<string | undefined>(selectedIssuer)
  const navigatedRef = useRef(false)
  const CHAT_MICRO_APP: MicroAppId = 'chat'
  const SETTINGS_MICRO_APP: MicroAppId = 'settings'

  const refreshStoredIssuers = useCallback(() => {
    setStoredIssuers(loadStoredIssuers())
  }, [])

  const dropStoredSession = useCallback(() => {
    clearStoredSolidSession(SESSION_STORAGE_KEY)
    hasCachedSessionRef.current = false
    setRestoringSession(false)
    setHasCachedSession(false)
  }, [setHasCachedSession, setRestoringSession])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (hasCachedSessionRef.current) return
    if (!hasStoredSolidSession(SESSION_STORAGE_KEY)) return
    hasCachedSessionRef.current = true
    setHasCachedSession(true)
    setRestoringSession(true)
    updateMode('loading')
    setShowModal(false)
  }, [setHasCachedSession, setRestoringSession, setShowModal, updateMode])

  const switchToDefaultMode = useCallback(() => {
    updateMode(accountPreview ? 'auto' : 'switch')
  }, [accountPreview, updateMode])

  const handleSilentRestore = useCallback(async () => {
    if (restoreAttemptedRef.current) return
    restoreAttemptedRef.current = true
    if (!hasCachedSessionRef.current) {
      switchToDefaultMode()
      setRestoringSession(false)
      setShowModal(true)
      return
    }
    setRestoringSession(true)
    updateMode('loading')
    try {
      await Promise.race([
        session.handleIncomingRedirect({
          url: typeof window === 'undefined' ? undefined : window.location.href,
          restorePreviousSession: true,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Session restore timeout')), 8000))
      ])
    } catch (error) {
      console.error('Silent Solid restore failed', error)
      dropStoredSession()
      setErrorMessage('恢复会话超时，请重新登录')
      switchToDefaultMode()
      setShowModal(true)
    } finally {
      setRestoringSession(false)
    }
  }, [dropStoredSession, session, switchToDefaultMode])

  useEffect(() => {
    if (sessionProbeComplete) return
    if (typeof window === 'undefined') return
    const skipRestore = shouldSkipAutoRestore()
    if (skipRestore) {
      hasCachedSessionRef.current = false
      setRestoringSession(false)
      setShowModal(true)
      updateMode('switch')
      setSessionProbeComplete(true)
      return
    }
    const hasSession = hasStoredSolidSession(SESSION_STORAGE_KEY)
    hasCachedSessionRef.current = hasSession
    setHasCachedSession(hasSession)
    if (hasSession) {
      setRestoringSession(true)
      updateMode('loading')
      setShowModal(false)
    } else {
      updateMode(initialAccountPreview ? 'auto' : 'switch')
      setShowModal(true)
    }
    setSessionProbeComplete(true)
  }, [initialAccountPreview, sessionProbeComplete])

  useEffect(() => {
    console.log('📊 Session state changed:', { 
      isLoggedIn: session.info.isLoggedIn, 
      webId: session.info.webId,
      sessionId: session.info.sessionId 
    })
    if (session.info.isLoggedIn) {
      console.log('✅ User logged in, hiding modal')
      hasCachedSessionRef.current = true
      setSkipAutoRestore(false)
      setShowModal(false)
      updateMode('auto')
      return
    }

    if (isRestoringSession) {
      console.log('⏳ Waiting for cached session restore, keep modal hidden')
      setShowModal(false)
      return
    }

    console.log('❌ User not logged in, showing modal')
    setShowModal(true)
  }, [isRestoringSession, session.info.isLoggedIn])

  useEffect(() => {
    if (!session.info.isLoggedIn && sessionRequestInProgress && mode !== 'switch') {
      updateMode('loading')
    }
  }, [mode, session.info.isLoggedIn, sessionRequestInProgress, updateMode])

  useEffect(() => {
    if (!sessionProbeComplete) return
    if (!session.info.isLoggedIn && !sessionRequestInProgress && hasCachedSessionRef.current) {
      void handleSilentRestore()
    }
  }, [handleSilentRestore, session.info.isLoggedIn, sessionProbeComplete, sessionRequestInProgress])


  useEffect(() => {
    if (selectedIssuer) return
    const fallback = determineInitialIssuer(issuerOptions, accountPreview ?? initialAccountPreview)
    if (fallback) {
      setSelectedIssuer(fallback)
    }
  }, [accountPreview, initialAccountPreview, issuerOptions, selectedIssuer, setSelectedIssuer])

  const handleCustomIssuerChange = (value: string) => {
    setCustomIssuer({
      value,
      isValid: validateIssuer(value),
      error: value.length === 0 || validateIssuer(value) ? undefined : '请输入合法的 URL',
    })
  }

  const applyCustomIssuer = () => {
    if (!customIssuer.value) return
    if (!customIssuer.isValid) {
      setErrorMessage(customIssuer.error ?? '请输入合法的 Issuer 地址')
      return
    }
    const normalized = normalizeIssuerUrl(customIssuer.value)
    upsertStoredIssuer(normalized)
    refreshStoredIssuers()
    setSelectedIssuer(normalized)
    resetCustomIssuer()
    setErrorMessage(null)
  }

  const ensureIssuerSelected = () => {
    if (selectedIssuer) return true
    setErrorMessage('请选择 Solid Issuer')
    updateMode('switch')
    return false
  }

  const handleEnter = async (explicitIssuer?: string) => {
    const targetIssuer = explicitIssuer ?? selectedIssuer
    console.log('🚀 Starting login process:', { mode, targetIssuer, customIssuer })
    
    if (mode === 'switch' && !customIssuer.isValid && !targetIssuer) {
      setErrorMessage('请先选择或添加 Issuer')
      return
    }
    
    if (!targetIssuer) {
       setErrorMessage('请选择 Solid Issuer')
       updateMode('switch')
       return
    }

    const redirectUrl = resolveRedirectUrl()
    console.log('🔄 Redirect URL:', redirectUrl)
    let validatedRedirect: string
    try {
      validatedRedirect = ensureRedirectAllowed(redirectUrl)
      console.log('✅ Validated redirect URL:', validatedRedirect)
    } catch (error) {
      console.error('❌ Redirect validation failed:', error)
      setErrorMessage(error instanceof Error ? error.message : '登录配置无效，请联系管理员')
      return
    }

    setErrorMessage(null)
    setSkipAutoRestore(false)
    updateMode('loading')
    lastLoginIssuerRef.current = targetIssuer
    const normalizedIssuer = normalizeIssuerUrl(targetIssuer)
    
    // Use current page as redirect URL if valid, otherwise fallback
    let finalRedirectUrl = validatedRedirect
    if (typeof window !== 'undefined') {
       // Only use current href if it's not the callback page itself
       if (!window.location.pathname.startsWith('/auth/callback')) {
          finalRedirectUrl = window.location.href
       }
    }

    console.log('🔐 Attempting login:', { 
      oidcIssuer: normalizedIssuer, 
      redirectUrl: finalRedirectUrl, 
      clientName: 'Linq' 
    })
    
    try {
      await login({
        oidcIssuer: normalizedIssuer,
        redirectUrl: finalRedirectUrl,
        clientName: 'Linq',
      })
      console.log('✅ Login initiated successfully')
    } catch (error) {
      console.error('❌ Solid login failed', error)
      setErrorMessage('登录 Solid 失败，请稍后重试 / Solid login failed.')
      switchToDefaultMode()
    }
  }

  const handleCancel = () => {
    setErrorMessage(null)
    if (mode === 'loading') {
      setSkipAutoRestore(true)
      dropStoredSession()
      void logout().catch((error) => {
        console.error('Failed to logout Solid session', error)
      })
      updateMode('switch')
      setShowModal(true)
      return
    }

    if (mode === 'switch' && accountPreview) {
      updateMode('auto')
      return
    }

    updateMode('switch')
    setShowModal(true)
  }

  const handleSwitchAccount = () => {
    setErrorMessage(null)
    setSkipAutoRestore(true)
    dropStoredSession()
    void logout().catch((error) => {
      console.error('Failed to logout Solid session before switching', error)
    })
    updateMode('switch')
    setShowModal(true)
  }

  const handleClose = () => {
    void handleCancel()
  }

  const handleSettings = () => {
    navigate({ to: '/$microAppId', params: { microAppId: SETTINGS_MICRO_APP } })
  }

  useEffect(() => {
    if (!session.info.isLoggedIn) return
    if (navigatedRef.current) return
    const webId = session.info.webId
    const issuerForAccount = selectedIssuer ?? lastLoginIssuerRef.current
    let cancelled = false

    const hydrateProfile = async () => {
      try {
        // Wait for DB to be ready if needed, or just check
        if (webId && db) {
          const record = await db.findByIri(solidProfileTable, webId)
          if (cancelled) return
          const avatarValue = toUrlValue(record?.avatar)
          const nickname = toStringValue(record?.nick)
          const displayName = nickname ?? toStringValue(record?.name) ?? 'Linq 用户'
          const issuerDomainValue = issuerForAccount ? extractDomain(issuerForAccount) : undefined
          const issuerAlias = getProviderAlias(issuerDomainValue)
          const nextPreview: SolidAccountPreview = {
            displayName,
            issuerDomain: issuerDomainValue,
            issuerLabel: issuerAlias ?? issuerDomainValue,
            avatarUrl: avatarValue,
            isRecent: true,
            handle: formatAccountHandle(displayName, issuerAlias ?? issuerDomainValue),
            issuerLogoUrl: getIssuerLogoUrl(issuerDomainValue),
          }
          setAccountPreview(nextPreview)
          if (issuerForAccount) {
            setStoredAccount(nextPreview)
            upsertStoredIssuer(issuerForAccount, nextPreview.issuerLabel ?? nextPreview.displayName, nextPreview.issuerLogoUrl)
            refreshStoredIssuers()
          }
        }

        // ChatKit now runs entirely in the browser (chatkit-local),
        // so no API server credentials are needed.
      } catch (error) {
        console.error('Failed to fetch Solid profile', error)
      } finally {
        if (!cancelled) {
          setShowModal(false)
          navigatedRef.current = true
          
          const currentPath = window.location.pathname
          // Strict check for debug page to avoid any router race conditions
          if (currentPath.includes('/debug')) {
             console.log('🛡️ Staying on debug page')
             return
          }

          const returnTo = getRedirectPath()
          console.log('🔍 Hydrate Profile Navigation Check:', {
            returnTo,
            currentPath,
            isRoot: currentPath === '/',
            isCallback: currentPath.startsWith('/auth/callback')
          })

          if (returnTo && returnTo !== '/') {
            console.log('👉 Navigating to saved redirect path:', returnTo)
            navigate({ to: returnTo as any, replace: true })
          } else {
            // Only auto-redirect to default chat if we are at root or callback
            if (currentPath === '/' || currentPath.startsWith('/auth/callback')) {
              console.log('👉 Navigating to default chat (from root/callback)')
              navigate({ to: '/$microAppId', params: { microAppId: CHAT_MICRO_APP }, replace: true })
            } else {
              console.log('✋ Staying on current path:', currentPath)
            }
          }
        }
      }
    }

    void hydrateProfile()
    return () => {
      cancelled = true
    }
  }, [CHAT_MICRO_APP, db, navigate, refreshStoredIssuers, selectedIssuer, session.info.isLoggedIn, session.info.webId])

  const modalProps: SolidLoginModalProps = {
    mode,
    account: accountPreview ?? DEFAULT_ACCOUNT_PREVIEW,
    issuers: issuerOptions,
    selectedIssuer,
    customIssuer,
    errorMessage,
    disablePrimary: mode === 'loading' || (mode === 'switch' && !selectedIssuer && !customIssuer.isValid),
    onEnter: () => handleEnter(),
    onSwitchAccount: handleSwitchAccount,
    onCancel: handleCancel,
    onClose: handleClose,
    onOpenSettings: handleSettings,
    onSelectIssuer: (url) => {
      const normalized = normalizeIssuerUrl(url)
      setSelectedIssuer(normalized)
      handleEnter(normalized)
    },
    onCustomIssuerChange: handleCustomIssuerChange,
    onSaveCustomIssuer: applyCustomIssuer,
  }

  return {
    showModal,
    modalProps,
  }
}