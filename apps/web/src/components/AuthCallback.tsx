import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '@/providers/solid-session-context'
import { EVENTS, type ISessionEventListener } from '@inrupt/solid-client-authn-browser'
import { Loader2, AlertTriangle } from 'lucide-react'
import { useOidcConnect } from '@/modules/login/hooks/use-oidc-connect'
import { useEmbeddedAuthorizationState } from '@/modules/login/hooks/use-embedded-authorization-state'
import {
  capturePendingCallbackError,
  clearPendingCallbackError,
  clearPendingLoginAttempt,
  clearPendingPostLoginMicroAppId,
  clearStoredSolidSession,
  getPendingCallbackError,
  getPendingLoginAttempt,
  getPendingLoginTransaction,
  isInvalidClientError,
  isInvalidClientErrorCode,
} from '@/modules/login/login-utils'
import {
  getLoginTransactionRetryEntryUrl,
  isLocalLoginTransaction,
} from '@/modules/login/login-transaction'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import {
  clearRememberedDesktopAuthRedirectUrl,
  getCurrentLocationCallbackRedirectUrl,
  getRememberedDesktopAuthRedirectUrl,
  isCallbackErrorRedirect,
  normalizeDesktopAuthRedirectUrl,
} from '@/modules/login/desktop-auth-redirect'

interface AuthCallbackProps {
  onSuccess?: () => void
  onError?: (error: string) => void
}

const CURRENT_SOLID_SESSION_KEY = 'solidClientAuthn:currentSession'
const SOLID_SESSION_PREFIX = 'solidClientAuthenticationUser:'
const CALLBACK_RESTORE_TIMEOUT_MS = 15_000
const SILENT_RESTORE_FALLBACK_KEY = 'linx-auth-silent-restore-fallback'
const SESSION_CURRENT_KEY_TIMEOUT_MS = 10_000
const SESSION_CURRENT_KEY_POLL_MS = 100
const CALLBACK_REDIRECT_RETRY_ATTEMPTS = 3
const CALLBACK_REDIRECT_RETRY_DELAY_MS = 500
let desktopRedirectRestorePromise: Promise<Awaited<ReturnType<ReturnType<typeof useSession>['session']['handleIncomingRedirect']>>> | null = null
let desktopRedirectRestoreUrl: string | null = null

export default function SolidAuthCallback({ onSuccess, onError }: AuthCallbackProps) {
  const { session, sessionRequestInProgress } = useSession()
  const oidc = useOidcConnect()
  const embeddedAuthorization = useEmbeddedAuthorizationState()
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const navigatedRef = useRef(false)
  const silentFallbackStartedRef = useRef(false)
  const webRedirectRestoreStartedRef = useRef(false)
  const desktopRedirectRestoreStartedRef = useRef(false)
  const desktopRedirectRestoreInProgressRef = useRef(false)
  const pendingAttempt = useMemo(() => getPendingLoginAttempt(), [])
  const pendingTransaction = useMemo(() => getPendingLoginTransaction(), [])
  const callbackError = useMemo(() => getPendingCallbackError(), [])
  const retryInteractiveFromSilentAttempt = useCallback(async () => {
    if (!pendingAttempt || retrying) {
      return
    }

    setRetrying(true)
    setError(null)

    try {
      const retryEntryUrl = pendingTransaction
        ? getLoginTransactionRetryEntryUrl(pendingTransaction)
        : pendingAttempt.issuerUrl
      await oidc.connect(retryEntryUrl, {
        authorizationSurface: pendingAttempt.authorizationSurface,
        returnToMicroAppId: pendingAttempt.returnToMicroAppId,
        route: pendingTransaction?.route,
        accountIssuerUrl: pendingTransaction?.accountIssuerUrl ?? pendingAttempt.accountIssuerUrl,
        accountIssuerLabel: pendingTransaction?.accountIssuerLabel ?? pendingAttempt.accountIssuerLabel,
        storageProviderUrl: pendingTransaction?.storageProviderUrl ?? pendingAttempt.storageProviderUrl,
        storageProviderLabel: pendingTransaction?.storageProviderLabel ?? pendingAttempt.storageProviderLabel,
        authorizationQuery: pendingTransaction?.authorizationQuery ?? pendingAttempt.authorizationQuery,
        strictDiscovery: pendingTransaction?.strictDiscovery ?? pendingAttempt.strictDiscovery,
        nodeId: pendingTransaction?.nodeId,
      })
    } catch (retryError: any) {
      console.warn('[auth-callback] silent fallback connect failed', retryError)
      setError(formatLoginErrorForUser(retryError, '重新发起登录失败。请返回登录页后再试。'))
    } finally {
      setRetrying(false)
    }
  }, [oidc, pendingAttempt, pendingTransaction, retrying])

  // The SDK's session restore performs its own silent (prompt=none) attempt
  // without an app-level pending login attempt. When the provider answers
  // with a silent-auth error (e.g. consent_required for a fresh client),
  // recover with an interactive connect instead of a terminal error page.
  const retryInteractiveFromRestoredIssuer = useCallback(async (issuerUrl: string | null, errorDescription?: string | null) => {
    if (!issuerUrl || retrying) return
    if (hasSilentRestoreFallbackStarted()) {
      // Already retried once: surface the error rather than looping reloads.
      setError(formatLoginErrorForUser(errorDescription ?? 'consent_required', '登录未完成，请重试。'))
      return
    }
    markSilentRestoreFallbackStarted()

    setRetrying(true)
    setError(null)

    try {
      await oidc.connect(issuerUrl, { prompt: 'consent' })
    } catch (retryError: any) {
      console.warn('[auth-callback] restored-issuer fallback connect failed', retryError)
      clearSilentRestoreFallback()
      setError(formatLoginErrorForUser(retryError, '重新发起登录失败。请返回登录页后再试。'))
    } finally {
      setRetrying(false)
    }
  }, [oidc, retrying])

  // Check for OIDC errors in URL
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const errorParam = params.get('error')
    const errorDesc = params.get('error_description')
    if (errorParam) {
      if (errorParam === 'email_unverified' || errorParam === 'verify_required') {
        setError(formatLoginErrorForUser(errorParam, '请先验证邮箱后再登录。'))
      } else if (isInvalidClientErrorCode(errorParam)) {
        // The provider rejected a stale/invalid OIDC client. Purge the cached
        // session so the user re-logs in with a freshly registered client.
        clearStoredSolidSession()
        setError(formatLoginErrorForUser(errorParam, '登录凭据已失效，请重新登录。'))
      } else if (pendingAttempt?.prompt === 'none' && isSilentAuthError(errorParam)) {
        if (!silentFallbackStartedRef.current) {
          silentFallbackStartedRef.current = true
          void retryInteractiveFromSilentAttempt()
        }
      } else if (!pendingAttempt && isSilentAuthError(errorParam)) {
        if (!silentFallbackStartedRef.current) {
          silentFallbackStartedRef.current = true
          void retryInteractiveFromRestoredIssuer(params.get('iss'), errorDesc)
        }
      } else {
        setError(formatLoginErrorForUser(errorDesc ?? errorParam, '登录请求被拒绝。请返回登录页后重试。'))
      }
      return
    }

    if (callbackError?.error) {
      if (isInvalidClientErrorCode(callbackError.error)) {
        clearStoredSolidSession()
        setError(formatLoginErrorForUser(callbackError.description ?? callbackError.error, '登录凭据已失效，请重新登录。'))
        return
      }

      if (pendingAttempt?.prompt === 'none' && isSilentAuthError(callbackError.error)) {
        if (!silentFallbackStartedRef.current) {
          silentFallbackStartedRef.current = true
          void retryInteractiveFromSilentAttempt()
        }
        return
      }

      setError(formatLoginErrorForUser(callbackError.description ?? callbackError.error, '登录请求被拒绝。请返回登录页后重试。'))
    }
  }, [callbackError, pendingAttempt, retryInteractiveFromSilentAttempt, retryInteractiveFromRestoredIssuer])

  const restoreDesktopRedirect = useCallback(async (redirectUrl: string) => {
    if (navigatedRef.current || desktopRedirectRestoreInProgressRef.current) {
      return
    }

    const normalizedRedirectUrl = normalizeDesktopAuthRedirectUrl(redirectUrl)
    if (isCallbackErrorRedirect(redirectUrl) || isCallbackErrorRedirect(normalizedRedirectUrl)) {
      const captured = capturePendingCallbackError(redirectUrl)
        ?? capturePendingCallbackError(normalizedRedirectUrl)
      if (captured?.error) {
        console.warn('[auth-callback] error redirect captured', {
          error: captured.error,
          description: captured.description,
          prompt: pendingAttempt?.prompt,
          silentFallbackStarted: silentFallbackStartedRef.current,
        })
        if (isInvalidClientErrorCode(captured.error)) {
          clearStoredSolidSession()
        }
        if (pendingAttempt?.prompt === 'none' && isSilentAuthError(captured.error)) {
          // A silent (prompt=none) attempt failed on the desktop loopback
          // redirect. Fall back to an interactive authorization instead of
          // surfacing the provider's raw error to the user.
          clearRememberedDesktopAuthRedirectUrl()
          if (!silentFallbackStartedRef.current) {
            silentFallbackStartedRef.current = true
            void retryInteractiveFromSilentAttempt()
            return
          }
        }
        setError(formatLoginErrorForUser(
          captured.description ?? captured.error,
          '登录请求被拒绝。请返回登录页后重试。',
        ))
        desktopRedirectRestoreStartedRef.current = false
      }
      clearRememberedDesktopAuthRedirectUrl()
      return
    }

    desktopRedirectRestoreInProgressRef.current = true
    try {
      // The SDK reads the registered redirect URI from the stored OIDC state
      // for its token exchange. It must receive a renderer-origin callback
      // URL here because it waits for window.location.href to equal this URL
      // after cleaning up the callback route.
      const restored = await restoreDesktopRedirectOnce(redirectUrl, () => (
        captureDesktopCallbackFailure(session.events, () => (
          handleIncomingRedirectWithRetry(() => session.handleIncomingRedirect({
            url: normalizedRedirectUrl,
            restorePreviousSession: false,
          }))
        ))
      ))
      if (navigatedRef.current) return

      const restoredSessionId = typeof restored?.sessionId === 'string'
        ? restored.sessionId
        : session.info.sessionId
      if (restored?.isLoggedIn || session.info.isLoggedIn) {
        const persistence = await ensureCurrentSessionPersistence(
          restoredSessionId,
          SESSION_CURRENT_KEY_TIMEOUT_MS,
        )
        if (navigatedRef.current) return
        if (persistence === 'missing') {
          console.warn('[auth-callback] continuing after desktop redirect before currentSession was persisted')
        }
        navigatedRef.current = true
        clearRememberedDesktopAuthRedirectUrl()
        clearSilentRestoreFallback()
        onSuccess?.()
        return
      }

      setError('登录未完成，请重试。')
      desktopRedirectRestoreStartedRef.current = false
    } catch (restoreError) {
      console.warn('[auth-callback] failed to restore desktop redirect', restoreError)
      desktopRedirectRestoreStartedRef.current = false
      if (isInvalidClientError(restoreError)) {
        clearStoredSolidSession()
        setError('登录凭据已失效，请重新登录。')
        return
      }
      if (!session.info.isLoggedIn) {
        setError(formatLoginErrorForUser(restoreError, '登录未完成，请重试。'))
      }
      clearRememberedDesktopAuthRedirectUrl()
    } finally {
      desktopRedirectRestoreInProgressRef.current = false
    }
  }, [onSuccess, pendingAttempt?.prompt, retryInteractiveFromSilentAttempt, session])

  useEffect(() => {
    if (error || navigatedRef.current || session.info.isLoggedIn) return
    const desktopAuth = typeof window !== 'undefined' ? window.xpodDesktop?.auth : undefined
    const rememberedDesktopRedirectUrl = desktopAuth
      ? getRememberedDesktopAuthRedirectUrl()
      : null
    // Keep the OAuth parameters out of the renderer route. SessionProvider
    // always attempts its own callback handling on mount, while the desktop
    // exchange must use the original loopback redirect URI.
    if (desktopAuth && rememberedDesktopRedirectUrl && !desktopRedirectRestoreStartedRef.current) {
      desktopRedirectRestoreStartedRef.current = true
      void restoreDesktopRedirect(rememberedDesktopRedirectUrl)
      return
    }
    // The provider's initial callback work targets the renderer URL. In
    // Electron, the registered loopback URL is handed off separately and must
    // be consumed even while that background work is still pending.
    if (sessionRequestInProgress && !desktopAuth) return
    const currentRedirectUrl = getCurrentLocationCallbackRedirectUrl()
    if (currentRedirectUrl) {
      if (desktopAuth && !desktopRedirectRestoreStartedRef.current) {
        desktopRedirectRestoreStartedRef.current = true
        void restoreDesktopRedirect(getRememberedDesktopAuthRedirectUrl() ?? currentRedirectUrl)
      }
      return
    }

    if (!desktopAuth?.consumePendingRedirect) return
    if (desktopRedirectRestoreStartedRef.current) return
    desktopRedirectRestoreStartedRef.current = true

    let cancelled = false
    void desktopAuth.consumePendingRedirect()
      .then((redirectUrl) => {
        if (cancelled || !redirectUrl) return
        void restoreDesktopRedirect(redirectUrl)
      })
      .catch((restoreError) => {
        console.warn('[auth-callback] failed to consume desktop redirect', restoreError)
      })

    return () => {
      cancelled = true
    }
  }, [error, restoreDesktopRedirect, session.info.isLoggedIn, sessionRequestInProgress])

  // Web: the provider skips callback routes (restorePreviousSession=false
  // there), so this page must finish the OAuth exchange itself.
  useEffect(() => {
    if (error || navigatedRef.current || session.info.isLoggedIn) return
    if (sessionRequestInProgress) return

    const currentRedirectUrl = getCurrentLocationCallbackRedirectUrl()
    if (!currentRedirectUrl) return

    const desktopAuth = typeof window !== 'undefined' ? window.xpodDesktop?.auth : undefined
    if (desktopAuth) return
    if (webRedirectRestoreStartedRef.current) return
    webRedirectRestoreStartedRef.current = true

    let cancelled = false
    void handleIncomingRedirectWithRetry(() => session.handleIncomingRedirect({
      url: currentRedirectUrl,
      restorePreviousSession: false,
    })).then(async (restored) => {
      if (cancelled || navigatedRef.current) return

      const restoredSessionId = typeof restored?.sessionId === 'string'
        ? restored.sessionId
        : session.info.sessionId
      if (restored?.isLoggedIn || session.info.isLoggedIn) {
        const persistence = await ensureCurrentSessionPersistence(
          restoredSessionId,
          SESSION_CURRENT_KEY_TIMEOUT_MS,
        )
        if (cancelled || navigatedRef.current) return
        if (persistence === 'missing') {
          console.warn('[auth-callback] continuing after web redirect before currentSession was persisted')
        }
        navigatedRef.current = true
        onSuccess?.()
        return
      }

      setError('登录未完成，请重试。')
    }).catch((restoreError) => {
      console.warn('[auth-callback] failed to restore web redirect', restoreError)
      if (!session.info.isLoggedIn) {
        setError(formatLoginErrorForUser(restoreError, '登录未完成，请重试。'))
      }
    })

    return () => {
      cancelled = true
    }
  }, [error, onSuccess, session, session.info.isLoggedIn, session.info.sessionId, sessionRequestInProgress])

  useEffect(() => {
    if (navigatedRef.current || session.info.isLoggedIn) return
    const desktopAuth = typeof window !== 'undefined' ? window.xpodDesktop?.auth : undefined
    if (sessionRequestInProgress && !desktopAuth) return
    if (getCurrentLocationCallbackRedirectUrl()) return

    if (!desktopAuth?.onRedirect || !desktopAuth.consumePendingRedirect) return

    return desktopAuth.onRedirect(() => {
      void desktopAuth.consumePendingRedirect()
        .then((redirectUrl) => {
          // useSessionRestore also listens for this event and may have won
          // the consume race, stashing the URL in session storage instead.
          const effectiveUrl = redirectUrl ?? getRememberedDesktopAuthRedirectUrl()
          if (!effectiveUrl) return
          // A late callback (e.g. the user finished typing credentials after
          // the error page appeared) beats the error state.
          setError(null)
          void restoreDesktopRedirect(effectiveUrl)
        })
        .catch((restoreError) => {
          console.warn('[auth-callback] failed to consume desktop redirect event', restoreError)
        })
    })
  }, [restoreDesktopRedirect, session.info.isLoggedIn, sessionRequestInProgress])

  useEffect(() => {
    if (error || navigatedRef.current) return
    if (session.info.isLoggedIn) return
    if (sessionRequestInProgress) return
    // An interactive embedded sheet flow owns the clock: the user may need
    // arbitrarily long to type credentials, so the restore timeout must not
    // fire while a retry is being set up or the sheet is open.
    if (retrying || embeddedAuthorization.open) return

    const timeoutId = window.setTimeout(() => {
      if (navigatedRef.current) return
      console.warn('[auth-callback] restore timeout fired', { sessionRequestInProgress, loggedIn: session.info.isLoggedIn })
      setError('登录未完成，请重试。')
    }, CALLBACK_RESTORE_TIMEOUT_MS)

    return () => window.clearTimeout(timeoutId)
  }, [error, session.info.isLoggedIn, sessionRequestInProgress, retrying, embeddedAuthorization.open])

  // Wait for the Inrupt callback to finish persisting auth metadata before
  // leaving /auth/callback. Navigating on the first LOGIN event can interrupt
  // storage writes and leave LinX with a remembered account but no Solid session.
  // If Inrupt already reports a logged-in session, do not hard-fail the callback
  // solely because its browser-only currentSession key is late or missing.
  useEffect(() => {
    if (error || navigatedRef.current) return
    if (!session.info.isLoggedIn) return

    let cancelled = false

    const finishAfterSessionIsPersisted = async () => {
      const persistence = await ensureCurrentSessionPersistence(
        session.info.sessionId,
        SESSION_CURRENT_KEY_TIMEOUT_MS,
      )
      if (cancelled || navigatedRef.current) return

      if (session.info.isLoggedIn) {
        if (persistence === 'missing') {
          console.warn('[auth-callback] continuing after login before currentSession was persisted')
        }
        navigatedRef.current = true
        clearRememberedDesktopAuthRedirectUrl()
        clearSilentRestoreFallback()
        onSuccess?.()
        return
      }

      setError('登录未完成，请重试。')
    }

    void finishAfterSessionIsPersisted()

    return () => {
      cancelled = true
    }
  }, [session.info.isLoggedIn, session.info.sessionId, sessionRequestInProgress, onSuccess, error])

  const retryLabel = pendingAttempt
    ? isLocalLoginTransaction(pendingTransaction) || isLocalIssuer(pendingAttempt.issuerUrl)
      ? '重试本机空间'
      : '重试云端登录'
    : '重试登录'

  const handleRetry = async () => {
    if (!pendingAttempt || retrying) return

    setRetrying(true)
    setError(null)
    silentFallbackStartedRef.current = false

    try {
      const retryEntryUrl = pendingTransaction
        ? getLoginTransactionRetryEntryUrl(pendingTransaction)
        : pendingAttempt.issuerUrl
      // A manual retry always runs interactively: reusing a silent
      // (prompt=none) attempt would loop back into the same failure the
      // user is trying to escape.
      const retryOptions = {
        authorizationSurface: pendingAttempt.authorizationSurface,
        returnToMicroAppId: pendingAttempt.returnToMicroAppId,
        route: pendingTransaction?.route,
        accountIssuerUrl: pendingTransaction?.accountIssuerUrl ?? pendingAttempt.accountIssuerUrl,
        accountIssuerLabel: pendingTransaction?.accountIssuerLabel ?? pendingAttempt.accountIssuerLabel,
        storageProviderUrl: pendingTransaction?.storageProviderUrl ?? pendingAttempt.storageProviderUrl,
        storageProviderLabel: pendingTransaction?.storageProviderLabel ?? pendingAttempt.storageProviderLabel,
        authorizationQuery: pendingTransaction?.authorizationQuery ?? pendingAttempt.authorizationQuery,
        strictDiscovery: pendingTransaction?.strictDiscovery ?? pendingAttempt.strictDiscovery,
        nodeId: pendingTransaction?.nodeId,
      }
      await oidc.connect(retryEntryUrl, {
        ...retryOptions,
      })
    } catch (retryError: any) {
      setError(formatLoginErrorForUser(retryError, '重新发起登录失败。请返回登录页后再试。'))
    } finally {
      setRetrying(false)
    }
  }

  const handleBack = () => {
    clearPendingCallbackError()
    clearPendingLoginAttempt()
    clearPendingPostLoginMicroAppId()
    clearSilentRestoreFallback()
    onError?.(formatLoginErrorForUser(error ?? '登录未完成', '登录未完成，请重试。'))
  }
  const visibleError = error ? formatLoginErrorForUser(error, '登录未完成，请重试。') : null

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <div className="w-compact-modal overflow-hidden rounded-xl border border-border/50 bg-card flex flex-col shadow-lg">
        {visibleError ? (
          <div className="flex-1 flex flex-col animate-in fade-in">
            <div className="px-6 pt-7 pb-5 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <p className="text-base font-semibold text-foreground">登录未完成</p>
              <p className="text-sm leading-6 text-muted-foreground">{visibleError}</p>
            </div>
            <div className="px-4 pb-5 space-y-2">
              {pendingAttempt ? (
                <button
                  type="button"
                  onClick={() => void handleRetry()}
                  disabled={retrying}
                  className="w-full h-9 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  {retrying ? '正在重新发起登录…' : retryLabel}
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleBack}
                className={pendingAttempt
                  ? 'w-full h-9 rounded-md border border-border/60 bg-muted/30 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors cursor-pointer'
                  : 'w-full h-9 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer'}
              >
                重新登录
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 gap-3 text-center animate-in fade-in">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            <p className="text-sm font-medium text-foreground">正在验证身份</p>
            <p className="text-xs text-muted-foreground">请稍候，即将进入 LinX...</p>
          </div>
        )}
      </div>
    </div>
  )
}

function isLocalIssuer(issuerUrl: string): boolean {
  try {
    const parsed = new URL(issuerUrl)
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

function isSilentAuthError(error: string): boolean {
  return error === 'login_required'
    || error === 'interaction_required'
    || error === 'consent_required'
    || error === 'account_selection_required'
}

function hasSilentRestoreFallbackStarted(): boolean {
  if (typeof window === 'undefined') return false
  return window.sessionStorage.getItem(SILENT_RESTORE_FALLBACK_KEY) === '1'
}

function markSilentRestoreFallbackStarted() {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(SILENT_RESTORE_FALLBACK_KEY, '1')
}

function clearSilentRestoreFallback() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(SILENT_RESTORE_FALLBACK_KEY)
}

type CurrentSessionPersistence = 'ready' | 'repaired' | 'missing'


async function handleIncomingRedirectWithRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= CALLBACK_REDIRECT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt >= CALLBACK_REDIRECT_RETRY_ATTEMPTS || !isTransientCallbackRestoreError(error)) {
        throw error
      }
      await delay(CALLBACK_REDIRECT_RETRY_DELAY_MS * attempt)
    }
  }

  throw lastError
}

function isTransientCallbackRestoreError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /Failed to fetch|ERR_CONNECTION|network|NetworkError|fetch failed/i.test(message)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function restoreDesktopRedirectOnce<T>(redirectUrl: string, operation: () => Promise<T>): Promise<T> {
  if (desktopRedirectRestorePromise && desktopRedirectRestoreUrl === redirectUrl) {
    return desktopRedirectRestorePromise as Promise<T>
  }

  desktopRedirectRestoreUrl = redirectUrl
  desktopRedirectRestorePromise = operation().finally(() => {
    if (desktopRedirectRestoreUrl === redirectUrl) {
      desktopRedirectRestoreUrl = null
      desktopRedirectRestorePromise = null
    }
  }) as typeof desktopRedirectRestorePromise
  return desktopRedirectRestorePromise as Promise<T>
}

async function ensureCurrentSessionPersistence(
  sessionId: string | undefined,
  timeoutMs: number,
): Promise<CurrentSessionPersistence> {
  if (!sessionId) {
    return 'missing'
  }

  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const status = getCurrentSessionPersistence(sessionId)
    if (status !== 'missing') {
      return status
    }
    await new Promise((resolve) => window.setTimeout(resolve, SESSION_CURRENT_KEY_POLL_MS))
  }

  return getCurrentSessionPersistence(sessionId)
}

function getCurrentSessionPersistence(sessionId: string): CurrentSessionPersistence {
  if (window.localStorage.getItem(CURRENT_SOLID_SESSION_KEY) === sessionId) {
    return 'ready'
  }

  if (hasStoredSolidSessionRecord(sessionId)) {
    window.localStorage.setItem(CURRENT_SOLID_SESSION_KEY, sessionId)
    return 'repaired'
  }

  return 'missing'
}

function hasStoredSolidSessionRecord(sessionId: string): boolean {
  const raw = window.localStorage.getItem(`${SOLID_SESSION_PREFIX}${sessionId}`)
  if (!raw) {
    return false
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return parsed.isLoggedIn === 'true'
      || parsed.isLoggedIn === true
      || typeof parsed.webId === 'string'
      || typeof parsed.refreshToken === 'string'
  } catch {
    return false
  }
}

async function captureDesktopCallbackFailure<T>(
  events: ISessionEventListener,
  operation: () => Promise<T>,
): Promise<T> {
  let callbackFailure: { error: string | null; description?: unknown } | null = null
  const onError = (error: string | null, description?: unknown) => {
    callbackFailure = { error, description }
  }

  events.on(EVENTS.ERROR, onError)
  try {
    const result = await operation()
    if (callbackFailure) {
      throw new Error(describeDesktopCallbackFailure(callbackFailure))
    }
    return result
  } finally {
    events.removeListener(EVENTS.ERROR, onError)
  }
}

function describeDesktopCallbackFailure(failure: { error: string | null; description?: unknown }): string {
  if (failure.description instanceof Error && failure.description.message) {
    return failure.description.message
  }
  if (typeof failure.description === 'string' && failure.description.trim()) {
    return failure.description
  }
  if (failure.error && failure.error !== 'redirect') {
    return failure.error
  }
  return '身份服务未能完成登录回调。'
}
