import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOidcConnect } from '@/modules/login/hooks/use-oidc-connect'
import {
  capturePendingCallbackError,
  clearPendingCallbackError,
  clearPendingLoginAttempt,
  clearPendingPostLoginMicroAppId,
  clearStoredSolidSession,
  getPendingCallbackError,
  getPendingLoginAttempt,
  getPendingLoginTransaction,
  isInvalidClientErrorCode,
} from '@/modules/login/login-utils'
import {
  getLoginTransactionRetryEntryUrl,
  isLocalLoginTransaction,
} from '@/modules/login/login-transaction'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import {
  getCurrentLocationCallbackRedirectUrl,
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
const SESSION_CURRENT_KEY_TIMEOUT_MS = 10_000
const SESSION_CURRENT_KEY_POLL_MS = 100
const CALLBACK_REDIRECT_RETRY_ATTEMPTS = 3
const CALLBACK_REDIRECT_RETRY_DELAY_MS = 500
let desktopRedirectRestorePromise: Promise<Awaited<ReturnType<ReturnType<typeof useSession>['session']['handleIncomingRedirect']>>> | null = null
let desktopRedirectRestoreUrl: string | null = null

export default function SolidAuthCallback({ onSuccess, onError }: AuthCallbackProps) {
  const { session, sessionRequestInProgress } = useSession()
  const oidc = useOidcConnect()
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const navigatedRef = useRef(false)
  const silentFallbackStartedRef = useRef(false)
  const desktopRedirectRestoreStartedRef = useRef(false)
  const desktopRedirectRestoreInProgressRef = useRef(false)
  const pendingAttempt = useMemo(() => getPendingLoginAttempt(), [])
  const pendingTransaction = useMemo(() => getPendingLoginTransaction(), [])
  const callbackError = useMemo(() => getPendingCallbackError(), [])
  const retryInteractiveFromSilentAttempt = useCallback(async () => {
    if (!pendingAttempt || retrying) return

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
      setError(formatLoginErrorForUser(retryError, '重新发起登录失败。请返回登录页后再试。'))
    } finally {
      setRetrying(false)
    }
  }, [oidc, pendingAttempt, pendingTransaction, retrying])

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
  }, [callbackError, pendingAttempt, retryInteractiveFromSilentAttempt])

  const restoreDesktopRedirect = useCallback(async (redirectUrl: string) => {
    if (navigatedRef.current || desktopRedirectRestoreInProgressRef.current) return

    const normalizedRedirectUrl = normalizeDesktopAuthRedirectUrl(redirectUrl)
    if (isCallbackErrorRedirect(redirectUrl) || isCallbackErrorRedirect(normalizedRedirectUrl)) {
      const captured = capturePendingCallbackError(redirectUrl)
        ?? capturePendingCallbackError(normalizedRedirectUrl)
      if (captured?.error) {
        if (isInvalidClientErrorCode(captured.error)) {
          clearStoredSolidSession()
        }
        setError(formatLoginErrorForUser(
          captured.description ?? captured.error,
          '登录请求被拒绝。请返回登录页后重试。',
        ))
      }
      return
    }

    desktopRedirectRestoreInProgressRef.current = true
    try {
      // Preserve the exact redirect URL that was registered with the OIDC
      // authorization request. Desktop loopback callbacks use
      // http://127.0.0.1:<port>/auth/callback; rewriting that to the renderer
      // origin before Inrupt restores the session can make the token exchange
      // use a different redirect_uri from the one Cloud issued the code for.
      const restored = await restoreDesktopRedirectOnce(redirectUrl, () => (
        handleIncomingRedirectWithRetry(() => session.handleIncomingRedirect({
          url: redirectUrl,
          restorePreviousSession: false,
        }))
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
        onSuccess?.()
        return
      }

      setError('登录未完成，请重试。')
    } catch (restoreError) {
      console.warn('[auth-callback] failed to restore desktop redirect', restoreError)
      if (!session.info.isLoggedIn) {
        setError(formatLoginErrorForUser(restoreError, '登录未完成，请重试。'))
      }
    } finally {
      desktopRedirectRestoreInProgressRef.current = false
    }
  }, [onSuccess, session])

  useEffect(() => {
    if (error || navigatedRef.current || session.info.isLoggedIn) return
    if (sessionRequestInProgress) return
    const currentRedirectUrl = getCurrentLocationCallbackRedirectUrl()
    if (currentRedirectUrl) {
      const desktopAuth = typeof window !== 'undefined' ? window.xpodDesktop?.auth : undefined
      if (desktopAuth && !desktopRedirectRestoreStartedRef.current) {
        desktopRedirectRestoreStartedRef.current = true
        void restoreDesktopRedirect(currentRedirectUrl)
      }
      return
    }

    const desktopAuth = typeof window !== 'undefined' ? window.xpodDesktop?.auth : undefined
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

  useEffect(() => {
    if (error || navigatedRef.current || session.info.isLoggedIn) return
    if (sessionRequestInProgress) return
    if (getCurrentLocationCallbackRedirectUrl()) return

    const desktopAuth = typeof window !== 'undefined' ? window.xpodDesktop?.auth : undefined
    if (!desktopAuth?.onRedirect || !desktopAuth.consumePendingRedirect) return

    return desktopAuth.onRedirect(() => {
      void desktopAuth.consumePendingRedirect()
        .then((redirectUrl) => {
          if (!redirectUrl) return
          void restoreDesktopRedirect(redirectUrl)
        })
        .catch((restoreError) => {
          console.warn('[auth-callback] failed to consume desktop redirect event', restoreError)
        })
    })
  }, [error, restoreDesktopRedirect, session.info.isLoggedIn, sessionRequestInProgress])

  useEffect(() => {
    if (error || navigatedRef.current) return
    if (session.info.isLoggedIn) return
    if (sessionRequestInProgress) return

    const timeoutId = window.setTimeout(() => {
      if (navigatedRef.current) return
      setError('登录未完成，请重试。')
    }, CALLBACK_RESTORE_TIMEOUT_MS)

    return () => window.clearTimeout(timeoutId)
  }, [error, session.info.isLoggedIn, sessionRequestInProgress])

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
    ? isLocalLoginTransaction(pendingTransaction) || isLocalIssuer(pendingAttempt.issuerUrl) || pendingAttempt.authorizationSurface === 'embedded'
      ? '重试本地空间'
      : '重试云端登录'
    : '重试登录'

  const handleRetry = async () => {
    if (!pendingAttempt || retrying) return

    setRetrying(true)
    setError(null)

    try {
      const retryEntryUrl = pendingTransaction
        ? getLoginTransactionRetryEntryUrl(pendingTransaction)
        : pendingAttempt.issuerUrl
      const prompt = pendingTransaction?.prompt ?? pendingAttempt.prompt
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
        ...(prompt ? { prompt } : {}),
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
    onError?.(formatLoginErrorForUser(error ?? '登录未完成', '登录未完成，请重试。'))
  }
  const visibleError = error ? formatLoginErrorForUser(error, '登录未完成，请重试。') : null

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border border-border/50 bg-card p-8 text-center shadow-lg">
        {visibleError ? (
          <div className="flex flex-col items-center animate-in fade-in">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">登录未完成</h2>
            <p className="text-sm text-muted-foreground mb-8 px-4">{visibleError}</p>
            <div className="flex w-full max-w-[280px] flex-col gap-3">
              {pendingAttempt ? (
                <Button onClick={() => void handleRetry()} disabled={retrying}>
                  {retrying ? '正在重新发起登录…' : retryLabel}
                </Button>
              ) : null}
              <Button variant={pendingAttempt ? 'outline' : 'default'} onClick={handleBack}>
                返回登录
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center animate-in fade-in">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">正在验证身份</h2>
            <p className="text-sm text-muted-foreground">请稍候，即将进入 LinX...</p>
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
