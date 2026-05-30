import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
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

  // Wait for the Inrupt callback to finish persisting auth metadata before
  // leaving /auth/callback. Navigating on the first LOGIN event can interrupt
  // storage writes and leave LinX with a remembered account but no Solid session.
  useEffect(() => {
    if (error || navigatedRef.current) return
    if (!session.info.isLoggedIn) return

    let cancelled = false

    const finishAfterSessionIsPersisted = async () => {
      const stored = await waitForCurrentSessionKey(
        session.info.sessionId,
        SESSION_CURRENT_KEY_TIMEOUT_MS,
      )
      if (cancelled || navigatedRef.current) return

      if (stored && session.info.isLoggedIn) {
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
  }, [session.info.isLoggedIn, sessionRequestInProgress, onSuccess, error])

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

async function waitForCurrentSessionKey(sessionId: string | undefined, timeoutMs: number): Promise<boolean> {
  if (!sessionId) {
    return false
  }

  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (window.localStorage.getItem(CURRENT_SOLID_SESSION_KEY) === sessionId) {
      return true
    }
    await new Promise((resolve) => window.setTimeout(resolve, SESSION_CURRENT_KEY_POLL_MS))
  }

  return window.localStorage.getItem(CURRENT_SOLID_SESSION_KEY) === sessionId
}
