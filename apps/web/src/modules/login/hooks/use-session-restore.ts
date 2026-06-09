import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import {
  getStoredSolidSession,
} from '../login-utils'
import {
  getCurrentLocationCallbackRedirectUrl,
  normalizeDesktopAuthRedirectUrl,
} from '../desktop-auth-redirect'

const CALLBACK_RESTORE_TIMEOUT = 15000

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
  const [isRestoring, setIsRestoring] = useState(false)
  const [restoreComplete, setRestoreComplete] = useState(false)
  const [restoreFailed, setRestoreFailed] = useState(false)
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
    return normalizeDesktopAuthRedirectUrl(redirectUrl)
  }, [desktopApi])

  const routeDesktopRedirectToCallback = useCallback((redirectUrl: string) => {
    setIsRestoring(true)
    setRestoreFailed(false)

    if (redirectUrl === window.location.href) {
      return
    }

    window.history.pushState({}, '', redirectUrl)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, [])

  // Auto-restore on mount
  useEffect(() => {
    if (attemptedRef.current) return
    if (session.info.isLoggedIn) return
    attemptedRef.current = true

    // Desktop cold starts cannot safely run Inrupt's silent restore: it may
    // navigate the app window to the IdP using a stale loopback redirect URL.
    // Only actual callback payloads from Electron's loopback bridge are handled here.
    // If the Desktop renderer itself is on /auth/callback, SolidSessionProvider
    // owns that restore so there is never a second consumer for the same OAuth code.
    if (desktopApi?.auth) {
      void consumeDesktopRedirect().then((redirectUrl) => {
        if (redirectUrl) {
          routeDesktopRedirectToCallback(redirectUrl)
        } else if (shouldAttemptCurrentLocationRestore()) {
          setIsRestoring(true)
        } else {
          setIsRestoring(false)
          setRestoreFailed(false)
        }
      }).catch(() => {
        setIsRestoring(false)
        setRestoreFailed(false)
      })
      return
    }

    // Web: SolidSessionProvider handles handleIncomingRedirect.
    // We just need to wait for it to finish.
    const isCallbackUrl = shouldAttemptCurrentLocationRestore()
    if (isCallbackUrl || hasStoredSession) {
      setIsRestoring(true)
    } else {
      setRestoreFailed(true)
    }
  }, [session.info.isLoggedIn, desktopApi, consumeDesktopRedirect, routeDesktopRedirectToCallback, hasStoredSession])

  // Listen for Desktop redirect events
  useEffect(() => {
    if (!desktopApi?.auth) return
    return desktopApi.auth.onRedirect(() => {
      void consumeDesktopRedirect().then((redirectUrl) => {
        if (redirectUrl) {
          routeDesktopRedirectToCallback(redirectUrl)
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
      setRestoreComplete(true)
      setRestoreFailed(false)
      setIsRestoring(false)
    }
  }, [session.info.isLoggedIn])

  // When SolidSessionProvider finishes before the mutable session object updates,
  // keep the callback restore alive for the same timeout as direct Desktop restores.
  useEffect(() => {
    if (sessionRequestInProgress) return
    if (session.info.isLoggedIn) return
    if (!isRestoring) return
    if (providerFailureTimerRef.current !== null) return

    providerFailureTimerRef.current = window.setTimeout(() => {
      providerFailureTimerRef.current = null
      if (session.info.isLoggedIn) {
        setRestoreComplete(true)
        setRestoreFailed(false)
        setIsRestoring(false)
        return
      }

      setIsRestoring(false)
      setRestoreFailed(true)
    }, CALLBACK_RESTORE_TIMEOUT)

    return () => {
      if (providerFailureTimerRef.current !== null) {
        window.clearTimeout(providerFailureTimerRef.current)
        providerFailureTimerRef.current = null
      }
    }
  }, [sessionRequestInProgress, session.info.isLoggedIn, isRestoring])

  return {
    isRestoring,
    restoreComplete,
    restoreFailed,
    hasStoredSession: desktopApi?.auth
      ? shouldAttemptCurrentLocationRestore()
      : hasStoredSession || shouldAttemptCurrentLocationRestore(),
  }
}

function shouldAttemptCurrentLocationRestore() {
  return getCurrentLocationCallbackRedirectUrl() !== null
}
