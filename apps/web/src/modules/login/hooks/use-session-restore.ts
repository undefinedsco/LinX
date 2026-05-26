import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import {
  capturePendingCallbackError,
  getPendingLoginAttempt,
  getStoredSolidSession,
  clearStoredSolidSession,
} from '../login-utils'

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
 *   2. For Desktop: consumes pending redirect URLs and calls handleIncomingRedirect for those
 *   3. Reports restoreComplete / restoreFailed to the login controller
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
    return normalizeIncomingRedirectUrl(redirectUrl)
  }, [desktopApi])

  // Handle Desktop redirect — this is the only case where we call handleIncomingRedirect
  const restoreDesktopRedirect = useCallback(async (redirectUrl: string) => {
    setIsRestoring(true)
    setRestoreFailed(false)
    const timeoutMs = CALLBACK_RESTORE_TIMEOUT

    try {
      if (isSilentAuthFailureRedirect(redirectUrl)) {
        capturePendingCallbackError(redirectUrl)
        setRestoreFailed(true)
        return
      }

      const restored = await Promise.race<any>([
        session.handleIncomingRedirect({
          url: redirectUrl,
          restorePreviousSession: true,
        }),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), timeoutMs),
        ),
      ])

      if (restored?.isLoggedIn || session.info.isLoggedIn) {
        setRestoreComplete(true)
      } else {
        clearStoredSolidSession()
        setRestoreFailed(true)
      }
    } catch {
      if (!session.info.isLoggedIn) {
        clearStoredSolidSession()
        setRestoreFailed(true)
      } else {
        setRestoreComplete(true)
      }
    } finally {
      setIsRestoring(false)
    }
  }, [session])

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
          void restoreDesktopRedirect(redirectUrl)
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
  }, [session.info.isLoggedIn, desktopApi, consumeDesktopRedirect, restoreDesktopRedirect, hasStoredSession])

  // Listen for Desktop redirect events
  useEffect(() => {
    if (!desktopApi?.auth) return
    return desktopApi.auth.onRedirect(() => {
      void consumeDesktopRedirect().then((redirectUrl) => {
        if (redirectUrl) {
          void restoreDesktopRedirect(redirectUrl)
        }
      })
    })
  }, [desktopApi, consumeDesktopRedirect, restoreDesktopRedirect])

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

function isSilentAuthFailureRedirect(url: string): boolean {
  const pendingAttempt = getPendingLoginAttempt()
  if (pendingAttempt?.prompt !== 'none') {
    return false
  }

  try {
    const error = new URL(url).searchParams.get('error')
    return error === 'login_required'
      || error === 'interaction_required'
      || error === 'consent_required'
      || error === 'account_selection_required'
  } catch {
    return false
  }
}

function normalizeIncomingRedirectUrl(url: string): string {
  if (typeof window === 'undefined') return url

  try {
    const parsed = new URL(url)
    const isLoopback =
      (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
      && parsed.pathname === '/auth/callback'
    const isLinxProtocol =
      parsed.protocol === 'linx:'
      && parsed.hostname === 'auth'
      && parsed.pathname === '/callback'

    if (isLoopback || isLinxProtocol) {
      if (window.location.protocol === 'file:') {
        return buildCurrentDocumentRedirectUrl(parsed.search)
      }
      return `${window.location.origin}/auth/callback${parsed.search}`
    }

    return url
  } catch {
    return url
  }
}

function buildCurrentDocumentRedirectUrl(search: string): string {
  const currentUrl = new URL(window.location.href)
  currentUrl.search = search
  return currentUrl.toString()
}

function shouldAttemptCurrentLocationRestore() {
  return getCurrentLocationCallbackRedirectUrl() !== null
}

function getCurrentLocationCallbackRedirectUrl(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const parsed = new URL(window.location.href)
    return parsed.pathname === '/auth/callback' && parsed.searchParams.has('code')
      ? window.location.href
      : null
  } catch {
    return null
  }
}
