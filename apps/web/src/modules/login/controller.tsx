import { useCallback, useEffect, useReducer, useRef } from 'react'
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
  clearStoredSolidAuthRecords,
  consumePendingPostLoginMicroAppId,
  ensurePendingPostLoginMicroAppId,
  getPendingLoginAttempt,
  getPendingLoginTransaction,
  getStoredSolidSession,
  getPendingCallbackError,
  prepareFreshLoginAttempt,
  resolvePostLoginMicroAppId,
  SIGN_OUT_EVENT,
} from './login-utils'
import type { ConnectingProviderInfo, LocalLoginProviderSource, LoginProviderOption } from './types'
import type { LocalOnboardingSnapshot } from '@/types/electron-api'
import { detectStorageConflict, type StorageConflict } from './storage-reconciliation'
import {
  isLocalLoginProviderSource,
  resolveLoginProviderSource,
} from './provider-model'
import { formatLoginErrorForUser } from './error-messages'
import {
  createInitialLoginFlowState,
  loginFlowReducer,
  selectLoginFlowVisibleError,
  type LoginErrorScope,
} from './login-flow'

const LOGIN_HANDOFF_WATCHDOG_MS = 12_000

async function waitForLoginHandoff(
  connect: Promise<void>,
  cancel: () => void,
  timeoutMs = LOGIN_HANDOFF_WATCHDOG_MS,
): Promise<void> {
  let timeoutId: number | undefined
  try {
    await Promise.race([
      connect,
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          cancel()
          reject(new Error('登录页打开超时。请重试。'))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  }
}

function reloadAfterSessionReset(): void {
  window.setTimeout(() => {
    window.location.reload()
  }, 0)
}

function normalizeUrl(url: string): string {
  return url.replace(/\/$/, '')
}

export function useLoginController() {
  const { session, logout, sessionRequestInProgress } = useSession()
  const navigate = useNavigate()

  const {
    state: legacyState,
    error: storeError,
    storedAccount,
    setState: setLegacyState,
    setError: setStoreError,
    setStoredAccount,
    loginSuccess: legacyLoginSuccess,
    reset: legacyReset,
  } = useLoginStore()
  const [flow, dispatchFlow] = useReducer(loginFlowReducer, legacyState, createInitialLoginFlowState)
  const state = flow.phase
  const setState = useCallback((nextState: typeof legacyState) => {
    dispatchFlow({ type: 'set-phase', phase: nextState })
    setLegacyState(nextState)
  }, [setLegacyState])
  const loginSuccess = useCallback((account: StoredAccount) => {
    dispatchFlow({ type: 'set-phase', phase: 'authenticated' })
    legacyLoginSuccess(account)
  }, [legacyLoginSuccess])
  const reset = useCallback(() => {
    dispatchFlow({ type: 'reset-default' })
    legacyReset()
  }, [legacyReset])
  const view = flow.view
  const localLoginActive = flow.localLoginActive
  const activeLocalProviderSource = flow.localProviderSource
  const storageConflict = flow.storageConflict
  const connectingProvider = flow.connectingProvider
  const setView = useCallback((nextView: 'default' | 'local') => {
    dispatchFlow({ type: 'set-view', view: nextView })
  }, [])
  const setLocalLoginActive = useCallback((active: boolean) => {
    dispatchFlow({ type: 'set-local-login-active', active })
  }, [])
  const setActiveLocalProviderSource = useCallback((source: LocalLoginProviderSource) => {
    dispatchFlow({ type: 'set-local-provider-source', source })
  }, [])
  const setStorageConflict = useCallback((conflict: StorageConflict | null) => {
    dispatchFlow({ type: 'set-storage-conflict', conflict })
  }, [])
  const setConnectingProvider = useCallback((provider: ConnectingProviderInfo | null) => {
    dispatchFlow({ type: 'set-connecting-provider', provider })
  }, [])
  const setError = useCallback((message: string | null, scope: LoginErrorScope = 'global') => {
    if (message) {
      dispatchFlow({ type: 'set-error', scope, message })
    } else {
      dispatchFlow({ type: 'clear-error' })
    }
    setStoreError(message)
  }, [setStoreError])

  const initRef = useRef(false)
  const suppressAutoLoginRef = useRef(false)
  const desktopAuthPendingRef = useRef(false)
  const desktopAuthSurfaceOpenedRef = useRef(false)
  const loginFinalizeGenerationRef = useRef(0)
  const localLoginAttemptRef = useRef(false)
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
  const error = selectLoginFlowVisibleError({
    flow,
    storeError,
    localOnboarding,
  })
  const isDesktop = typeof window !== 'undefined' && Boolean(window.xpodDesktop?.auth)
  const resetDesktopAuthState = useCallback((): void => {
    desktopAuthPendingRef.current = false
    desktopAuthSurfaceOpenedRef.current = false
  }, [])

  const connectReadyLocalSnapshot = useCallback(async (
    snapshot: LocalOnboardingSnapshot,
    source: LocalLoginProviderSource,
    options?: { restoreAccount?: StoredAccount | null },
  ) => {
    console.info('[login] connect ready local snapshot', {
      source,
      snapshotState: snapshot.state,
      snapshotSpaceKind: snapshot.spaceKind,
      hasLocalUrl: Boolean(snapshot.localUrl),
      hasBaseUrl: Boolean(snapshot.baseUrl),
      hasPublicUrl: Boolean(snapshot.publicUrl),
      hasProvisionCode: Boolean(snapshot.provisionCode),
      isLoggedIn: session.info.isLoggedIn,
      webId: session.info.webId,
    })
    const storedSolidSession = getStoredSolidSession()
    const accountForReuse = options?.restoreAccount ?? storedAccount
    const shouldTrySilentDesktopAuth = isDesktop
      && session.info.isLoggedIn !== true
      && canReuseSessionForLocalSpace({
        account: accountForReuse,
        providers,
        activeWebId: session.info.webId,
        storedSolidSession,
      })

    const isStandalone = source === 'standalone'
    const localProviderUrl = isStandalone
      ? normalizeRememberedUrl(snapshot.localUrl) ?? normalizeRememberedUrl(snapshot.baseUrl)
      : normalizeRememberedUrl(snapshot.publicUrl)
    if (!localProviderUrl) {
      setError(isStandalone
        ? '独立空间已启动，但本机登录入口尚未准备好。请稍后重试。'
        : '本地空间还没有完成准备。请回到空间选择页，再点一次“本地空间”。')
      return
    }

    const accountIssuerUrl = isStandalone
      ? localProviderUrl
      : normalizeRememberedUrl(snapshot.cloudIdentityUrl) ?? LINX_CLOUD_IDENTITY_ORIGIN

    if (!isStandalone && !snapshot.provisionCode) {
      setError('本地空间还没有完成准备。请回到空间选择页，再点一次“本地空间”。')
      return
    }

    const oidcEntryUrl = accountIssuerUrl


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
      issuerUrl: accountIssuerUrl,
      storageProviderLabel: isStandalone ? 'Standalone' : 'Local',
      storageProviderUrl: localProviderUrl,
    })

    const connectOptions = {
      authorizationSurface: isDesktop ? 'embedded' : 'window',
      route: source,
      accountIssuerUrl,
      accountIssuerLabel: isStandalone ? 'Standalone' : 'Cloud',
      storageProviderUrl: localProviderUrl,
      storageProviderLabel: isStandalone ? 'Standalone' : 'Local',
      issuerLabel: isStandalone ? 'Standalone' : 'Cloud',
      authorizationQuery: isStandalone
        ? undefined
        : { provisionCode: snapshot.provisionCode },
      ...(shouldTrySilentDesktopAuth ? { prompt: 'none' as const } : {}),
      ...(isStandalone ? { strictDiscovery: true as const } : {}),
      nodeId: snapshot.nodeId ?? undefined,
    } as const

    try {
      console.info('[login] starting oidc local connect', {
        source,
        oidcEntryUrl,
        accountIssuerUrl,
        localProviderUrl,
        authorizationSurface: connectOptions.authorizationSurface,
        strictDiscovery: connectOptions.strictDiscovery === true,
      })
      await waitForLoginHandoff(
        oidc.connect(oidcEntryUrl, connectOptions),
        oidc.cancel,
      )
    } catch (error: any) {
      console.warn('[login] local oidc connect failed', {
        source,
        message: error instanceof Error ? error.message : String(error),
      })
      resetDesktopAuthState()
      setConnectingProvider(null)
      setState('idle')
      setError(
        formatLoginErrorForUser(error, isStandalone ? '登录页没有打开。请稍后重试。' : '登录页没有打开。请返回空间选择页重试。'),
        'auth-surface',
      )
    }
  }, [
    isDesktop,
    oidc,
    providers,
    resetDesktopAuthState,
    session.info.isLoggedIn,
    session.info.webId,
    setError,
    setState,
    storedAccount,
  ])

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

    // Only act on callback restore failures — don't interfere with user-initiated connecting state
    if (!callbackRestoreFailed && state === 'restoring') {
      setState('idle')
      return
    }

    if (!callbackRestoreFailed) return

    clearPendingLoginAttempt()
    clearPendingPostLoginMicroAppId()
    setConnectingProvider(null)
    setError('登录未完成，请重试。', 'auth-callback')

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

    if (state === 'connecting' || view === 'local' || connectingProvider) {
      oidc.cancel()
      clearPendingLoginAttempt()
      clearPendingPostLoginMicroAppId()
      clearPendingCallbackError()
      setStorageConflict(null)
      setStoredAccount(null)
      setConnectingProvider(null)
      setError(null)
      setView('default')
      setActiveLocalProviderSource('local')
      setLocalLoginActive(false)
      setState('idle')
    }
  }, [
    embeddedAuthorization.open,
    embeddedAuthorization.reason,
    connectingProvider,
    isDesktop,
    oidc,
    setError,
    resetDesktopAuthState,
    setState,
    setStoredAccount,
    state,
    view,
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
        throw new Error('本地空间还没有完成准备。请回到空间选择页，再点一次“本地空间”。')
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
          provisionCode: localOnboarding?.provisionCode,
        }))
        setStoredAccount(account)
        setView('default')
        setActiveLocalProviderSource('local')
        setLocalLoginActive(false)
        setConnectingProvider(null)
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
      console.warn('[login] finalize failed', {
        errorName: error instanceof Error ? error.name : undefined,
        errorMessage: error instanceof Error ? error.message : String(error),
        webId: account.webId,
        issuerUrl: account.issuerUrl,
        issuerLabel: account.issuerLabel,
        storageProviderUrl: account.storageProviderUrl,
        storageProviderLabel: account.storageProviderLabel,
      })
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
      setError(formatLoginErrorForUser(error, '登录后初始化失败。请返回登录页后重试。'), 'auth-callback')
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
    options?: { restoreAccount?: StoredAccount | null; skipStoredSessionRestore?: boolean },
  ) => {
    if (localLoginAttemptRef.current) {
      console.info('[login] ignored duplicate local login attempt', { source })
      return
    }
    localLoginAttemptRef.current = true
    console.info('[login] start local login', {
      source,
      hasRestoreAccount: Boolean(options?.restoreAccount),
      skipStoredSessionRestore: options?.skipStoredSessionRestore === true,
      isDesktop,
      isLoggedIn: session.info.isLoggedIn,
      webId: session.info.webId,
    })
    const shouldResetFailedAuthSession = !session.info.isLoggedIn
      && (flow.error?.scope === 'auth-surface' || Boolean(storeError))
    loginFinalizeGenerationRef.current += 1
    suppressAutoLoginRef.current = false
    setStorageConflict(null)
    prepareFreshLoginAttempt()
    setError(null)
    setState('idle')
    setConnectingProvider(null)
    resetDesktopAuthState()
    ensurePendingPostLoginMicroAppId(resolvePostLoginMicroAppId())
    setView('local')
    setActiveLocalProviderSource(source)
    setLocalLoginActive(false)

    try {
      if (shouldResetFailedAuthSession) {
        try {
          await logout()
        } catch (error) {
          console.warn('[login] failed auth session reset was ignored', error)
        }
        prepareFreshLoginAttempt()
      }

      const storedSolidSession = getStoredSolidSession()
      const canReuseActiveLocalSession = Boolean(
        options?.restoreAccount
        && session.info.isLoggedIn
        && canReuseSessionForLocalSpace({
          account: options.restoreAccount,
          providers,
          activeWebId: session.info.webId,
          storedSolidSession: null,
        }),
      )
      const canTryDesktopStoredLocalSession = Boolean(
        isDesktop
        && !options?.skipStoredSessionRestore
        && options?.restoreAccount
        && canReuseSessionForLocalSpace({
          account: options.restoreAccount,
          providers,
          activeWebId: session.info.webId,
          storedSolidSession,
        }),
      )
      const canRestoreLocalSession = Boolean(
        canReuseActiveLocalSession || canTryDesktopStoredLocalSession,
      )

      if (!canRestoreLocalSession && session.info.isLoggedIn) {
        try {
          suppressAutoLoginRef.current = true
          await logout()
        } finally {
          suppressAutoLoginRef.current = false
        }
      }

      if (!isDesktop && !canRestoreLocalSession && storedSolidSession) {
        clearStoredSolidAuthRecords()
      }

      const snapshot = await startLocal(source)
      console.info('[login] local start snapshot', {
        requestedSource: source,
        snapshotState: snapshot?.state,
        snapshotSpaceKind: snapshot?.spaceKind,
        hasLocalUrl: Boolean(snapshot?.localUrl),
        hasBaseUrl: Boolean(snapshot?.baseUrl),
        hasPublicUrl: Boolean(snapshot?.publicUrl),
      })

      if (snapshot?.state === 'error') {
        setLocalLoginActive(false)
        setError(formatLoginErrorForUser(snapshot.message, '本地空间启动失败。请稍后重试。'), 'local-start')
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

      }

      if (snapshot?.state === 'ready') {
        await connectReadyLocalSnapshot(snapshot, source, {
          restoreAccount: options?.restoreAccount ?? storedAccount,
        })
        return
      }

      setLocalLoginActive(isLocalStartupSnapshot(snapshot))
    } catch (error: any) {
      setLocalLoginActive(false)
      setError(formatLoginErrorForUser(error, '本地空间启动失败。请稍后重试。'), 'local-start')
    } finally {
      localLoginAttemptRef.current = false
    }
  }, [connectReadyLocalSnapshot, flow.error?.scope, isDesktop, logout, providers, resetDesktopAuthState, session, setError, setState, startLocal, storeError, storedAccount])

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
    prepareFreshLoginAttempt()
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
        route: source,
        storageProviderUrl,
        storageProviderLabel: provider?.storageProvider?.label ?? provider?.label,
        issuerLabel: provider?.oidcProvider?.label ?? resolveProviderDisplayName(provider, issuerUrl),
      })
    } catch (err: any) {
      resetDesktopAuthState()
      setConnectingProvider(null)
      setError(formatLoginErrorForUser(err, '连接失败。请检查网络后重试。'), 'auth-surface')
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

    if (matched) {
      const matchedSource = resolveLoginProviderSource(matched)
      if (isLocalLoginProviderSource(matchedSource)) {
        void startLocalLogin(matchedSource, {
          restoreAccount: storedAccount,
          skipStoredSessionRestore: true,
        })
        return
      }
      void connect(matched.id)
      return
    }

    if (isLocalAccessUrl(targetStorageProviderUrl)) {
      void startLocalLogin('standalone', {
        restoreAccount: storedAccount,
        skipStoredSessionRestore: true,
      })
      return
    }

    void connect(targetStorageProviderUrl)
  }, [connect, isDesktop, providers, session, setState, startLocalLogin, storedAccount])

  const signInLocalOnboarding = useCallback(async () => {
    setError(null)
    console.info('[login] sign in local onboarding', {
      activeLocalProviderSource,
      onboardingState: localOnboarding?.state,
      onboardingSpaceKind: localOnboarding?.spaceKind,
      hasLocalUrl: Boolean(localOnboarding?.localUrl),
      hasBaseUrl: Boolean(localOnboarding?.baseUrl),
      hasPublicUrl: Boolean(localOnboarding?.publicUrl),
    })
    if (!localOnboarding || localOnboarding.state !== 'ready') {
      void startLocalLogin(activeLocalProviderSource, {
        restoreAccount: getReusableLocalStoredAccount(storedAccount, providers, activeLocalProviderSource),
      })
      return
    }

    if (localOnboarding.spaceKind !== activeLocalProviderSource) {
      void startLocalLogin(activeLocalProviderSource, {
        restoreAccount: getReusableLocalStoredAccount(storedAccount, providers, activeLocalProviderSource),
      })
      return
    }

    await connectReadyLocalSnapshot(localOnboarding, activeLocalProviderSource, {
      restoreAccount: getReusableLocalStoredAccount(storedAccount, providers, activeLocalProviderSource),
    })
  }, [
    activeLocalProviderSource,
    connectReadyLocalSnapshot,
    localOnboarding,
    providers,
    setError,
    startLocalLogin,
    storedAccount,
  ])

  const saveLocalTunnelToken = useCallback(async (token: string) => {
    const desktopApi = typeof window !== 'undefined' ? window.xpodDesktop : undefined
    if (!desktopApi?.localOnboarding?.saveTunnelToken) {
      setError('当前桌面端不支持保存隧道密钥。')
      return
    }

    setError(null)
    setLocalLoginActive(true)
    try {
      await desktopApi.localOnboarding.saveTunnelToken({ token })
    } catch (error: any) {
      setError(formatLoginErrorForUser(error, '保存隧道密钥失败。请稍后重试。'), 'connectivity')
    } finally {
      setLocalLoginActive(false)
    }
  }, [setError])

  const testLocalConnectivity = useCallback(async () => {
    const desktopApi = typeof window !== 'undefined' ? window.xpodDesktop : undefined
    if (!desktopApi?.localOnboarding?.testConnectivity) {
      setError('当前桌面端不支持测试本地空间连接。')
      return
    }

    setError(null)
    setLocalLoginActive(true)
    try {
      await desktopApi.localOnboarding.testConnectivity()
    } catch (error: any) {
      setError(formatLoginErrorForUser(error, '测试本地空间连接失败。请稍后重试。'), 'connectivity')
    } finally {
      setLocalLoginActive(false)
    }
  }, [setError])

  const backFromLocal = useCallback(() => {
    oidc.cancel()
    setError(null)
    setStorageConflict(null)
    clearPendingCallbackError()
    clearPendingLoginAttempt()
    clearPendingPostLoginMicroAppId()
    setView('default')
    setActiveLocalProviderSource('local')
    setLocalLoginActive(false)
    setStoredAccount(null)
    setConnectingProvider(null)
    setState('idle')
    resetDesktopAuthState()
    void Promise.resolve(embeddedAuthorization.close()).catch(() => undefined)
  }, [embeddedAuthorization, oidc, resetDesktopAuthState, setError, setState, setStoredAccount])

  const cancelConnecting = useCallback(() => {
    oidc.cancel()
    setError(null)
    setStorageConflict(null)
    setStoredAccount(null)
    setView('default')
    setActiveLocalProviderSource('local')
    setLocalLoginActive(false)
    setConnectingProvider(null)
    resetDesktopAuthState()
    clearPendingCallbackError()
    clearPendingLoginAttempt()
    clearPendingPostLoginMicroAppId()
    if (state === 'connecting') {
      setState('idle')
    }
    void Promise.resolve(embeddedAuthorization.close()).catch(() => undefined)
  }, [embeddedAuthorization, oidc, resetDesktopAuthState, setError, setState, setStoredAccount, state])

  const switchAccount = useCallback(async () => {
    oidc.cancel()
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
    resetDesktopAuthState()
    void Promise.resolve(embeddedAuthorization.close()).catch(() => undefined)
    reloadAfterSessionReset()
  }, [embeddedAuthorization, logout, oidc, resetDesktopAuthState, setError, setState, setStoredAccount])

  const signOut = useCallback(async () => {
    oidc.cancel()
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
    resetDesktopAuthState()
    void Promise.resolve(embeddedAuthorization.close()).catch(() => undefined)
    reset()
    reloadAfterSessionReset()
  }, [embeddedAuthorization, logout, oidc, reset, resetDesktopAuthState])

  // Listen for sign-out events from other components (e.g. PrimaryLayout)
  useEffect(() => {
    const handler = () => void signOut()
    window.addEventListener(SIGN_OUT_EVENT, handler)
    return () => window.removeEventListener(SIGN_OUT_EVENT, handler)
  }, [signOut])

  const clearError = useCallback(() => setError(null), [setError])
  const dismissStorageConflict = useCallback(() => {
    oidc.cancel()
    setStoredAccount(null)
    setError(null)
    setStorageConflict(null)
    setState('idle')
    setView('default')
    setLocalLoginActive(false)
    setConnectingProvider(null)
    resetDesktopAuthState()
    void Promise.resolve(embeddedAuthorization.close()).catch(() => undefined)
  }, [embeddedAuthorization, oidc, resetDesktopAuthState, setError, setState, setStoredAccount])
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

  const localStartupStatusActive = localLoginActive && isLocalStartupSnapshot(localOnboarding)

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
      active: localStartupStatusActive,
      message: localStartupStatusActive
        ? (localOnboarding?.message ?? (activeLocalProviderSource === 'standalone' ? '正在启动独立空间…' : '正在启动本地空间…'))
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

function isLocalStartupSnapshot(snapshot: LocalOnboardingSnapshot | null | undefined): boolean {
  if (!snapshot) {
    return true
  }

  return snapshot.state === 'checking' || snapshot.state === 'starting'
}

function resolveStorageConflictAction(
  conflict: StorageConflict,
  input: {
    storageProviderLabel?: string
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

  const createPodUrl = buildLocalScopedCreatePodUrl(conflict.storageProviderUrl, input.provisionCode)
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

function buildLocalScopedCreatePodUrl(
  storageProviderUrl: string | null | undefined,
  provisionCode: string,
): string | null {
  const normalizedStorageProviderUrl = normalizeRememberedUrl(storageProviderUrl)
  if (!normalizedStorageProviderUrl) {
    return null
  }

  try {
    const url = new URL('/.account/create-pod/', normalizedStorageProviderUrl.endsWith('/')
      ? normalizedStorageProviderUrl
      : `${normalizedStorageProviderUrl}/`)
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
  const pendingTransaction = getPendingLoginTransaction()
  const storedSolidSession = getStoredSolidSession()
  const issuerUrl =
    pendingTransaction?.accountIssuerUrl
    ?? pendingLoginAttempt?.accountIssuerUrl
    ?? pendingLoginAttempt?.issuerUrl
    ?? storedAccount?.issuerUrl
    ?? storedSolidSession?.issuerUrl
    ?? ''
  const storageProviderUrl =
    pendingTransaction?.storageProviderUrl
    ?? pendingLoginAttempt?.storageProviderUrl
    ?? storedAccount?.storageProviderUrl
    ?? issuerUrl

  return {
    issuerUrl,
    issuerLabel: pendingTransaction?.accountIssuerLabel
      ?? pendingLoginAttempt?.accountIssuerLabel
      ?? resolveIssuerLabel(issuerUrl, providers, storedAccount?.issuerLabel),
    storageProviderUrl,
    storageProviderLabel: pendingTransaction?.storageProviderLabel
      ?? pendingLoginAttempt?.storageProviderLabel
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
