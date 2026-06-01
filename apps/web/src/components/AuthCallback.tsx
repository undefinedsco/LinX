import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOidcConnect } from '@/modules/login/hooks/use-oidc-connect'
import {
  clearPendingCallbackError,
  clearPendingLoginAttempt,
  clearPendingPostLoginMicroAppId,
  getPendingCallbackError,
  getPendingLoginAttempt,
} from '@/modules/login/login-utils'

interface AuthCallbackProps {
  onSuccess?: () => void
  onError?: (error: string) => void
}

const CURRENT_SOLID_SESSION_KEY = 'solidClientAuthn:currentSession'
const SOLID_SESSION_PREFIX = 'solidClientAuthenticationUser:'
const CALLBACK_RESTORE_TIMEOUT_MS = 15_000
const SESSION_CURRENT_KEY_TIMEOUT_MS = 10_000
const SESSION_CURRENT_KEY_POLL_MS = 100

export default function SolidAuthCallback({ onSuccess, onError }: AuthCallbackProps) {
  const { session, sessionRequestInProgress } = useSession()
  const oidc = useOidcConnect()
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const navigatedRef = useRef(false)
  const silentFallbackStartedRef = useRef(false)
  const pendingAttempt = useMemo(() => getPendingLoginAttempt(), [])
  const callbackError = useMemo(() => getPendingCallbackError(), [])
  const retryInteractiveFromSilentAttempt = useCallback(async () => {
    if (!pendingAttempt || retrying) return

    setRetrying(true)
    setError(null)

    try {
      await oidc.connect(pendingAttempt.issuerUrl, {
        authorizationSurface: pendingAttempt.authorizationSurface,
        returnToMicroAppId: pendingAttempt.returnToMicroAppId,
        storageProviderUrl: pendingAttempt.storageProviderUrl,
        storageProviderLabel: pendingAttempt.storageProviderLabel,
        authorizationQuery: pendingAttempt.authorizationQuery,
      })
    } catch (retryError: any) {
      setError(retryError?.message || '重新发起登录失败。')
    } finally {
      setRetrying(false)
    }
  }, [oidc, pendingAttempt, retrying])

  // Check for OIDC errors in URL
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const errorParam = params.get('error')
    const errorDesc = params.get('error_description')
    if (errorParam) {
      if (errorParam === 'email_unverified' || errorParam === 'verify_required') {
        setError('请先验证邮箱后再登录。')
      } else if (pendingAttempt?.prompt === 'none' && isSilentAuthError(errorParam)) {
        if (!silentFallbackStartedRef.current) {
          silentFallbackStartedRef.current = true
          void retryInteractiveFromSilentAttempt()
        }
      } else {
        setError(errorDesc ? decodeURIComponent(errorDesc) : '认证服务器拒绝了请求')
      }
      return
    }

    if (callbackError?.error) {
      if (pendingAttempt?.prompt === 'none' && isSilentAuthError(callbackError.error)) {
        if (!silentFallbackStartedRef.current) {
          silentFallbackStartedRef.current = true
          void retryInteractiveFromSilentAttempt()
        }
        return
      }

      setError(callbackError.description ? decodeURIComponent(callbackError.description) : '认证服务器拒绝了请求')
    }
  }, [callbackError, pendingAttempt, retryInteractiveFromSilentAttempt])

  useEffect(() => {
    if (error || navigatedRef.current) return
    if (session.info.isLoggedIn) return

    const timeoutId = window.setTimeout(() => {
      if (navigatedRef.current) return
      setError('登录未完成，请重试。')
    }, CALLBACK_RESTORE_TIMEOUT_MS)

    return () => window.clearTimeout(timeoutId)
  }, [error, session.info.isLoggedIn])

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
    ? isLocalIssuer(pendingAttempt.issuerUrl) || pendingAttempt.authorizationSurface === 'embedded'
      ? '重试 Local'
      : '重试 Cloud'
    : '重试登录'

  const handleRetry = async () => {
    if (!pendingAttempt || retrying) return

    setRetrying(true)
    setError(null)

    try {
      const retryOptions = {
        authorizationSurface: pendingAttempt.authorizationSurface,
        returnToMicroAppId: pendingAttempt.returnToMicroAppId,
        storageProviderUrl: pendingAttempt.storageProviderUrl,
        storageProviderLabel: pendingAttempt.storageProviderLabel,
        authorizationQuery: pendingAttempt.authorizationQuery,
        ...(pendingAttempt.prompt ? { prompt: pendingAttempt.prompt } : {}),
      }
      await oidc.connect(pendingAttempt.issuerUrl, {
        ...retryOptions,
      })
    } catch (retryError: any) {
      setError(retryError?.message || '重新发起登录失败。')
    } finally {
      setRetrying(false)
    }
  }

  const handleBack = () => {
    clearPendingCallbackError()
    clearPendingLoginAttempt()
    clearPendingPostLoginMicroAppId()
    onError?.(error ?? '登录未完成')
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-card border border-border/50 rounded-2xl shadow-2xl p-8 text-center">
        {error ? (
          <div className="flex flex-col items-center animate-in fade-in">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">登录未完成</h2>
            <p className="text-sm text-muted-foreground mb-8 px-4">{error}</p>
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
