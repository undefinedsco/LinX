import { useCallback, useEffect, useRef } from 'react'
import { EVENTS } from '@inrupt/solid-client-authn-browser'
import { useSession } from '@/providers/solid-session-context'
import { useLoginStore } from '@linx/stores/login'

import { getPendingLoginAttempt } from '../login-utils'
import { useEmbeddedAuthorizationState } from './use-embedded-authorization-state'
import { useOidcConnect } from './use-oidc-connect'

const PROBE_INTERVAL_MS = 60_000
const PROBE_EXPIRY_LEEWAY_MS = 30_000
const PROBE_RETRY_DELAY_MS = 5_000
const RECOVERY_GUARD_TIMEOUT_MS = 5 * 60_000

function isAuthCallbackRoute(): boolean {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/auth/callback')
}

function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.xpodDesktop)
}

/**
 * Keeps the Solid session token chain alive. The Inrupt SDK only refreshes
 * proactively on a timer and never retries a failed refresh, so sleep or
 * offline periods permanently kill the chain (every request then 401s).
 * This hook watches for a dead chain and re-authenticates interactively,
 * which the IdP account cookie usually completes without a password prompt.
 */
export function useSessionTokenMaintenance() {
  const { session, sessionRequestInProgress } = useSession()
  const oidc = useOidcConnect()
  const embeddedAuthorization = useEmbeddedAuthorizationState()
  const recoveryInProgressRef = useRef(false)
  const recoveryGuardTimerRef = useRef<number | null>(null)

  const clearRecoveryGuard = useCallback(() => {
    recoveryInProgressRef.current = false
    if (recoveryGuardTimerRef.current !== null) {
      window.clearTimeout(recoveryGuardTimerRef.current)
      recoveryGuardTimerRef.current = null
    }
  }, [])

  const recover = useCallback(async (reason: string) => {
    if (recoveryInProgressRef.current) return
    if (sessionRequestInProgress) return
    if (!session.info.isLoggedIn) return
    if (embeddedAuthorization.open) return
    if (isAuthCallbackRoute()) return

    const attempt = getPendingLoginAttempt()
    const storedAccount = useLoginStore.getState().storedAccount
    const issuerUrl = attempt?.issuerUrl ?? storedAccount?.issuerUrl
    if (!issuerUrl) return

    recoveryInProgressRef.current = true
    console.warn('[token-maintenance] starting interactive re-authentication', { reason, issuerUrl })
    recoveryGuardTimerRef.current = window.setTimeout(() => {
      recoveryInProgressRef.current = false
      recoveryGuardTimerRef.current = null
    }, RECOVERY_GUARD_TIMEOUT_MS)

    try {
      await oidc.connect(issuerUrl, {
        authorizationSurface: attempt?.authorizationSurface ?? (isDesktopRuntime() ? 'embedded' : 'window'),
        returnToAppletId: attempt?.returnToAppletId,
        accountIssuerLabel: attempt?.accountIssuerLabel ?? storedAccount?.issuerLabel,
        storageProviderUrl: attempt?.storageProviderUrl ?? storedAccount?.storageProviderUrl,
        storageProviderLabel: attempt?.storageProviderLabel ?? storedAccount?.storageProviderLabel,
        authorizationQuery: attempt?.authorizationQuery,
        strictDiscovery: attempt?.strictDiscovery,
      })
    } catch (error) {
      console.warn('[token-maintenance] re-authentication setup failed', error)
      clearRecoveryGuard()
    }
  }, [clearRecoveryGuard, embeddedAuthorization.open, oidc, session.info.isLoggedIn, sessionRequestInProgress])

  useEffect(() => {
    const onSessionExpired = () => { void recover('session-expired') }
    const onSessionSettled = () => clearRecoveryGuard()

    session.events.on(EVENTS.SESSION_EXPIRED, onSessionExpired)
    session.events.on(EVENTS.LOGIN, onSessionSettled)
    session.events.on(EVENTS.LOGOUT, onSessionSettled)

    return () => {
      session.events.off(EVENTS.SESSION_EXPIRED, onSessionExpired)
      session.events.off(EVENTS.LOGIN, onSessionSettled)
      session.events.off(EVENTS.LOGOUT, onSessionSettled)
    }
  }, [clearRecoveryGuard, recover, session.events])

  const probeTokenChain = useCallback(async () => {
    if (recoveryInProgressRef.current) return
    if (sessionRequestInProgress) return
    if (!session.info.isLoggedIn || !session.info.webId) return

    const expiration = session.info.expirationDate
    if (!expiration || expiration - Date.now() > PROBE_EXPIRY_LEEWAY_MS) return

    const probeOnce = async (): Promise<boolean> => {
      try {
        const response = await session.fetch(session.info.webId as string, { method: 'HEAD' })
        return response.status === 401
      } catch {
        return false
      }
    }

    if (!(await probeOnce())) return
    // Give the SDK's own proactive timer a chance to recover before
    // concluding the chain is dead.
    await new Promise((resolve) => window.setTimeout(resolve, PROBE_RETRY_DELAY_MS))
    if (recoveryInProgressRef.current) return
    if (await probeOnce()) {
      void recover('probe-401')
    }
  }, [recover, session, sessionRequestInProgress])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void probeTokenChain()
    }
    const onOnline = () => { void probeTokenChain() }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)
    const intervalId = window.setInterval(() => { void probeTokenChain() }, PROBE_INTERVAL_MS)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onOnline)
      window.clearInterval(intervalId)
    }
  }, [probeTokenChain])
}
