import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import { useNavigate } from '@tanstack/react-router'
import { defaultMicroAppId } from '@/modules/layout/micro-app-registry'
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
import type { ConnectingProviderInfo, LoginProviderOption } from './types'
import { detectStorageConflict, type StorageConflict } from './storage-reconciliation'

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
  const { session, logout } = useSession()
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
        providerUrl: pendingAttempt.providerUrl,
        providerLabel: pendingAttempt.providerLabel,
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
    if (!session.info.isLoggedIn) return
    if (state === 'authenticated') return
    if (storageConflict) return
    if (suppressAutoLoginRef.current) return

    const { issuerUrl, issuerLabel, providerUrl, providerLabel } = resolveAccountContext(storedAccount, providers)
    const account: StoredAccount = {
      displayName: storedAccount?.displayName || 'LinX 用户',
      avatarUrl: storedAccount?.avatarUrl,
      issuerUrl,
      issuerLabel,
      providerUrl,
      providerLabel,
      webId: session.info.webId,
    }

    let cancelled = false

    const finalizeGeneration = loginFinalizeGenerationRef.current
    const isFinalizeCurrent = () => finalizeGeneration === loginFinalizeGenerationRef.current

    const finalizeLogin = async () => {
      const providerPublicUrl = resolveConflictCheckPublicUrl({
        providerLabel,
        providerUrl,
        localPublicUrl: localOnboarding?.publicUrl,
        localBaseUrl: localOnboarding?.baseUrl,
      })
      const conflict = await detectStorageConflict({
        webId: session.info.webId ?? '',
        providerUrl,
        providerPublicUrl,
      })

      if (cancelled || !isFinalizeCurrent()) return

      if (conflict) {
        setStorageConflict(conflict)
        setStoredAccount(account)
        setView('default')
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

    void finalizeLogin().catch((error: any) => {
      if (cancelled || !isFinalizeCurrent()) return
      setStoredAccount(account)
      resetDesktopAuthState()
      setConnectingProvider(null)
      setState('idle')
      setError(error?.message || '登录后校验空间失败，请重试。')
    })

    return () => {
      cancelled = true
    }
  }, [
    localOnboarding?.baseUrl,
    localOnboarding?.publicUrl,
    loginSuccess,
    logout,
    navigate,
    providers,
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

  const startLocalLogin = useCallback(async (options?: { restoreAccount?: StoredAccount | null }) => {
    loginFinalizeGenerationRef.current += 1
    suppressAutoLoginRef.current = false
    setStorageConflict(null)
    setError(null)
    setState('idle')
    setConnectingProvider(null)
    resetDesktopAuthState()
    ensurePendingPostLoginMicroAppId(resolvePostLoginMicroAppId())
    setView('local')
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

      const snapshot = await startLocal()

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
  }, [isDesktop, logout, navigate, providers, resetDesktopAuthState, session, setError, setState, startLocal])

  const connect = useCallback(async (providerUrl: string) => {
    loginFinalizeGenerationRef.current += 1
    suppressAutoLoginRef.current = false
    setStorageConflict(null)
    const normalizedProviderUrl = normalizeUrl(providerUrl)
    const provider = providers.find((item) => normalizeUrl(item.url) === normalizedProviderUrl)
    if (provider?.source === 'local') {
      await startLocalLogin({ restoreAccount: isLocalStoredAccount(storedAccount, providers) ? storedAccount : null })
      return
    }

    setView('default')
    setState('connecting')
    setError(null)
    setConnectingProvider({
      issuerLabel: resolveProviderDisplayName(provider, normalizedProviderUrl),
      issuerUrl: normalizedProviderUrl,
      providerLabel: resolveProviderDisplayName(provider, normalizedProviderUrl),
      providerUrl: normalizedProviderUrl,
    })

    try {
      const desktopApi = typeof window !== 'undefined' ? window.xpodDesktop : undefined
      const surface = desktopApi ? 'embedded' : 'window'
      if (desktopApi) {
        desktopAuthPendingRef.current = true
        desktopAuthSurfaceOpenedRef.current = false
      }
      await oidc.connect(normalizedProviderUrl, {
        authorizationSurface: surface,
        providerUrl: normalizedProviderUrl,
        providerLabel: provider?.label,
        issuerLabel: resolveProviderDisplayName(provider, normalizedProviderUrl),
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

    const targetProviderUrl =
      normalizeRememberedUrl(storedAccount?.providerUrl)
      ?? normalizeRememberedUrl(storedAccount?.issuerUrl)
      ?? (storedAccount?.webId && isLocalUrl(storedAccount.webId) ? 'http://localhost:5737' : null)
    if (!targetProviderUrl) {
      setState('idle')
      return
    }

    const matched = resolveStoredAccountProvider(targetProviderUrl, providers)
    const isRememberedLocal =
      matched?.source === 'local'
      || isLocalUrl(targetProviderUrl)
      || storedAccount?.providerLabel === 'Local'
      || storedAccount?.issuerLabel === 'Local'
    if (isRememberedLocal) {
      void startLocalLogin({ restoreAccount: storedAccount })
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
        const matched = resolveStoredAccountProvider(targetProviderUrl, providers)
        if (matched) {
          if (matched.source === 'local') {
            void startLocalLogin()
            return
          }
          void connect(matched.url)
          return
        }

        if (isLocalUrl(targetProviderUrl)) {
          void startLocalLogin()
          return
        }

        void connect(targetProviderUrl)
      }).catch(() => {
        setState('idle')
      })
      return
    }

    if (matched) {
      if (matched.source === 'local') {
        void startLocalLogin()
        return
      }
      void connect(matched.url)
      return
    }

    if (isLocalUrl(targetProviderUrl)) {
      void startLocalLogin()
      return
    }

    void connect(targetProviderUrl)
  }, [connect, isDesktop, navigate, providers, session, setError, setState, startLocalLogin, storedAccount])

  const signInLocalOnboarding = useCallback(async () => {
    if (!localOnboarding || localOnboarding.state !== 'ready') {
      void startLocalLogin({ restoreAccount: isLocalStoredAccount(storedAccount, providers) ? storedAccount : null })
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

    const isDeviceOnly = localOnboarding.mode === 'device-only'
    const localProviderUrl = isDeviceOnly
      ? normalizeRememberedUrl(localOnboarding.localUrl) ?? normalizeRememberedUrl(localOnboarding.baseUrl)
      : normalizeRememberedUrl(localOnboarding.publicUrl)
        ?? normalizeRememberedUrl(localOnboarding.baseUrl)
        ?? normalizeRememberedUrl(localOnboarding.localUrl)
    if (!localProviderUrl) {
      setError('Local 已启动，但本地登录入口尚未准备好。')
      return
    }

    const issuerUrl = isDeviceOnly
      ? localProviderUrl
      : normalizeRememberedUrl(localOnboarding.cloudIdentityUrl) ?? 'https://id.undefineds.co'

    if (!isDeviceOnly && !localOnboarding.provisionCode) {
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
      issuerLabel: isDeviceOnly ? 'Local' : 'Cloud',
      issuerUrl,
      providerLabel: 'Local',
      providerUrl: localProviderUrl,
    })

    const connectOptions = {
      authorizationSurface: 'embedded',
      providerUrl: localProviderUrl,
      providerLabel: 'Local',
      issuerLabel: isDeviceOnly ? 'Local' : 'Cloud',
      authorizationQuery: isDeviceOnly
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
      setError(error?.message || (isDeviceOnly ? '打开 Local 登录失败。' : '打开 Cloud 登录失败。'))
    }
  }, [
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

  const backFromLocal = useCallback(() => {
    setError(null)
    setStorageConflict(null)
    clearPendingCallbackError()
    clearPendingLoginAttempt()
    clearPendingPostLoginMicroAppId()
    setView('default')
    setLocalLoginActive(false)
    setConnectingProvider(null)
    localConnectKeyRef.current = null
    resetDesktopAuthState()
  }, [resetDesktopAuthState, setError])

  const cancelConnecting = useCallback(() => {
    setError(null)
    setStorageConflict(null)
    setView('default')
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
    const managementUrl = storageConflict?.managementUrl
    if (!managementUrl || typeof window === 'undefined') {
      return
    }

    const desktopApi = window.xpodDesktop
    if (desktopApi?.auth?.openEmbeddedAuthorization) {
      void desktopApi.auth.openEmbeddedAuthorization(managementUrl)
      return
    }

    if (desktopApi?.app?.openExternal) {
      void desktopApi.app.openExternal(managementUrl)
      return
    }

    window.open(managementUrl, '_blank', 'noopener,noreferrer')
  }, [storageConflict?.managementUrl])

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
    localLoginStatus: {
      active: localLoginActive,
      message: localLoginActive ? (localOnboarding?.message ?? '正在启动 Local…') : null,
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

function resolveStoredAccountProvider(
  issuerUrl: string,
  providers: LoginProviderOption[],
): LoginProviderOption | null {
  const normalized = normalizeUrl(issuerUrl)
  const exact = providers.find((provider) => normalizeUrl(provider.url) === normalized)
  if (exact) return exact

  if (isLocalUrl(normalized)) {
    return providers.find((provider) => provider.source === 'local') ?? null
  }

  return null
}

function isLocalStoredAccount(
  account: StoredAccount | null,
  providers: LoginProviderOption[],
): account is StoredAccount {
  if (!account) {
    return false
  }

  const providerUrl = normalizeRememberedUrl(account.providerUrl)
    ?? normalizeRememberedUrl(account.issuerUrl)
    ?? (account.webId && isLocalUrl(account.webId) ? account.webId : null)
  if (!providerUrl) {
    return false
  }

  const matched = resolveStoredAccountProvider(providerUrl, providers)
  return matched?.source === 'local'
    || account.providerLabel === 'Local'
    || isLocalUrl(providerUrl)
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
): Pick<StoredAccount, 'issuerUrl' | 'issuerLabel' | 'providerUrl' | 'providerLabel'> {
  const pendingLoginAttempt = getPendingLoginAttempt()
  const storedSolidSession = getStoredSolidSession()
  const issuerUrl =
    pendingLoginAttempt?.issuerUrl
    ?? storedAccount?.issuerUrl
    ?? storedSolidSession?.issuerUrl
    ?? ''
  const providerUrl =
    pendingLoginAttempt?.providerUrl
    ?? storedAccount?.providerUrl
    ?? issuerUrl

  return {
    issuerUrl,
    issuerLabel: resolveIssuerLabel(issuerUrl, providers, storedAccount?.issuerLabel),
    providerUrl,
    providerLabel: pendingLoginAttempt?.providerLabel
      ?? resolveProviderLabel(providerUrl, providers, storedAccount?.providerLabel),
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

  const matched = resolveStoredAccountProvider(issuerUrl, providers)
  if (matched) {
    if (matched.source === 'cloud') return 'Cloud'
    if (matched.source === 'local') return 'Local'
    return matched.label
  }

  if (isLocalUrl(issuerUrl)) {
    return 'Local'
  }

  try {
    return new URL(issuerUrl).hostname
  } catch {
    return fallback
  }
}

function resolveProviderLabel(
  providerUrl: string,
  providers: LoginProviderOption[],
  fallback?: string,
): string | undefined {
  if (!providerUrl) {
    return fallback
  }

  const matched = resolveStoredAccountProvider(providerUrl, providers)
  if (matched) {
    if (matched.source === 'cloud') return 'Cloud'
    if (matched.source === 'local') return 'Local'
    return matched.label
  }

  if (isLocalUrl(providerUrl)) {
    return 'Local'
  }

  if (fallback === 'Local') {
    return 'Local'
  }

  try {
    return new URL(providerUrl).hostname
  } catch {
    return fallback
  }
}

function resolveProviderDisplayName(provider: LoginProviderOption | undefined, fallbackUrl: string): string {
  if (provider?.source === 'cloud') return 'Cloud'
  if (provider?.source === 'local') return 'Local'
  if (provider?.label) return provider.label

  try {
    return new URL(fallbackUrl).hostname
  } catch {
    return fallbackUrl
  }
}

function isLocalUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname === 'localhost' || hostname === '127.0.0.1'
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
  providerLabel?: string
  providerUrl?: string
  localPublicUrl?: string | null
  localBaseUrl?: string | null
}): string | null {
  const urls = input.providerLabel === 'Local'
    ? [input.localPublicUrl, input.localBaseUrl, input.providerUrl]
    : [input.providerUrl]

  for (const url of urls) {
    const normalized = normalizeRememberedUrl(url)
    if (!normalized) {
      continue
    }
    return normalized
  }
  return null
}
