import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '@/providers/solid-session-context'
import {
  ensurePendingPostLoginMicroAppId,
  getStoredSolidSession,
  resolvePostLoginMicroAppId,
} from '../login-utils'
import {
  getCurrentLocationCallbackRedirectUrl,
  rememberDesktopAuthRedirectUrl,
} from '../desktop-auth-redirect'

const CALLBACK_RESTORE_TIMEOUT = 15000

export type SessionRestoreStatus = 'idle' | 'restoring' | 'complete' | 'failed'

/**
 * useSessionRestore — observes session state managed by SolidSessionProvider.
 *
 * SolidSessionProvider already calls handleIncomingRedirect on mount for web.
 * This hook only calls handleIncomingRedirect for Desktop callback URLs, where
 * the OAuth response arrives through Electron's loopback bridge instead of the
 * current renderer location.
 * It only:
 *   1. Waits for session.info.isLoggedIn to become true (or timeout)
 *   2. For Desktop: consumes pending redirect URLs and routes the renderer to /auth/callback
 *   3. Reports restoreComplete / restoreFailed to the login controller
 *
 * Desktop deliberately does not call handleIncomingRedirect from an arbitrary
 * app route. Inrupt mutates browser history during callback processing; doing
 * that from /chat can leave the renderer on /auth/callback without code/state.
 * The callback page is the only route that should finish the OIDC response.
 */
export function useSessionRestore() {
  const { session, sessionRequestInProgress } = useSession()
  const [status, setStatus] = useState<SessionRestoreStatus>('idle')
  const isRestoring = status === 'restoring'
  const attemptedRef = useRef(false)
  const providerFailureTimerRef = useRef<number | null>(null)
  const desktopApi = typeof window !== 'undefined' ? window.xpodDesktop : undefined
  const storedSession = getStoredSolidSession()
  const hasStoredSession = !!storedSession

  // Desktop: consume pending redirect and call handleIncomingRedirect for it
  const consumeDesktopRedirect = useCallback(async (): Promise<string | null> => {
    if (!desktopApi?.auth) return null
    const redirectUrl = await desktopApi.auth.consumePendingRedirect()
    if (!redirectUrl) return null
    rememberDesktopAuthRedirectUrl(redirectUrl)
    return redirectUrl
  }, [desktopApi])

  const routeDesktopRedirectToCallback = useCallback(() => {
    setStatus('restoring')

    const callbackRoute = `${window.location.origin}/auth/callback`
    if (callbackRoute === window.location.href) {
      return
    }

    // Do not put the original loopback callback query into the renderer URL.
    // Inrupt's SessionProvider automatically processes renderer callbacks on
    // mount; that competes with the desktop-only exchange, which must retain
    // the original loopback redirect URI stored in sessionStorage.
    window.history.pushState({}, '', callbackRoute)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, [])

  // Auto-restore on mount
  useEffect(() => {
    if (attemptedRef.current) return
    const isCallbackUrl = shouldAttemptCurrentLocationRestore()
    if (session.info.isLoggedIn) {
      if (hasStoredSession && !isCallbackUrl) {
        ensurePendingPostLoginMicroAppId(resolvePostLoginMicroAppId())
      }
      return
    }
    attemptedRef.current = true

    // Desktop cannot use SolidSessionProvider's iframe-based silent restore:
    // its loopback callback is a top-level navigation. This branch only
    // consumes a new callback delivered by Electron.
    if (desktopApi?.auth) {
      void consumeDesktopRedirect().then((redirectUrl) => {
        if (redirectUrl) {
          routeDesktopRedirectToCallback()
        } else if (shouldAttemptCurrentLocationRestore()) {
          setStatus('restoring')
        } else {
          setStatus('idle')
        }
      }).catch(() => {
        setStatus('idle')
      })
      return
    }

    // Web: SolidSessionProvider handles handleIncomingRedirect.
    // We just need to wait for it to finish. When a stored-session restore
    // starts from a real app route, remember that route before the auth library
    // can navigate through /auth/callback.
    if (isCallbackUrl || hasStoredSession) {
      if (hasStoredSession && !isCallbackUrl) {
        ensurePendingPostLoginMicroAppId(resolvePostLoginMicroAppId())
      }
      setStatus('restoring')
    } else {
      setStatus('failed')
    }
  }, [session, session.info.isLoggedIn, desktopApi, consumeDesktopRedirect, routeDesktopRedirectToCallback, hasStoredSession])

  // Listen for Desktop redirect events
  useEffect(() => {
    if (!desktopApi?.auth) return
    return desktopApi.auth.onRedirect(() => {
      void consumeDesktopRedirect().then((redirectUrl) => {
        if (redirectUrl) {
          routeDesktopRedirectToCallback()
        }
      })
    })
  }, [desktopApi, consumeDesktopRedirect, routeDesktopRedirectToCallback])

  // Watch for session state changes from SolidSessionProvider
  useEffect(() => {
    if (session.info.isLoggedIn) {
      if (providerFailureTimerRef.current !== null) {
        window.clearTimeout(providerFailureTimerRef.current)
        providerFailureTimerRef.current = null
      }
      setStatus('complete')
    }
  }, [session.info.isLoggedIn])

  // Bound every restore attempt, including a provider request that never settles.
  // The provider can remain "in progress" forever when discovery/token refresh is
  // interrupted, so waiting for that flag to turn false before starting the timer
  // leaves the login modal permanently stuck on its restoring state.
  useEffect(() => {
    if (session.info.isLoggedIn) return
    if (!isRestoring) return
    if (providerFailureTimerRef.current !== null) return

    providerFailureTimerRef.current = window.setTimeout(() => {
      providerFailureTimerRef.current = null
      if (session.info.isLoggedIn) {
        setStatus('complete')
        return
      }

      setStatus('failed')
    }, CALLBACK_RESTORE_TIMEOUT)

    return () => {
      if (providerFailureTimerRef.current !== null) {
        window.clearTimeout(providerFailureTimerRef.current)
        providerFailureTimerRef.current = null
      }
    }
  }, [sessionRequestInProgress, session.info.isLoggedIn, isRestoring])

  return {
    status,
    isRestoring,
    restoreComplete: status === 'complete',
    restoreFailed: status === 'failed',
    hasStoredSession: desktopApi?.auth
      ? shouldAttemptCurrentLocationRestore()
      : hasStoredSession || shouldAttemptCurrentLocationRestore(),
  }
}

function shouldAttemptCurrentLocationRestore() {
  return getCurrentLocationCallbackRedirectUrl() !== null
}
