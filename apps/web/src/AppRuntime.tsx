import { RouterProvider } from '@tanstack/react-router'
import { SolidSessionProvider } from './providers/solid-session-provider'
import { SolidDatabaseProvider } from './providers/solid-database-provider'
import { PodCollectionsBootstrap } from './providers/pod-collections-bootstrap'
import { TelemetryProvider } from './lib/telemetry/telemetry-context'
import { useSessionTokenMaintenance } from './modules/login/hooks/use-session-token-maintenance'
import {
  cleanupExpiredLoginTransaction,
} from './modules/login/login-utils'
import { router } from './router'

function SessionTokenMaintenance() {
  useSessionTokenMaintenance()
  return null
}

export function AppRuntime() {
  const isDesktopRuntime = typeof window !== 'undefined' && Boolean(window.xpodDesktop?.auth)
  const isAuthCallback = typeof window !== 'undefined'
    && window.location.pathname.startsWith('/auth/callback')

  // Callback processing still needs the oidc.* state/PKCE/sessionId mapping.
  // Never run auth maintenance before AuthCallback has consumed it.
  if (!isAuthCallback) {
    cleanupExpiredLoginTransaction()
  }

  const shouldRestoreInProvider =
    typeof window !== 'undefined'
    && window.location.protocol !== 'file:'
    // Inrupt restores a browser session through a hidden iframe. Desktop uses
    // loopback callbacks, and an identity provider may require interaction;
    // that iframe redirect is rejected by Chromium and leaves the app blank.
    && !isDesktopRuntime
    // AuthCallback owns the code exchange on callback routes; restoring a
    // previous session here would race it for the same OAuth payload.
    && !isAuthCallback

  return (
    <SolidSessionProvider
      restorePreviousSession={shouldRestoreInProvider}
      onError={(error) => console.warn('🔴 SessionProvider error (ignored):', error)}
    >
      <SolidDatabaseProvider>
        <SessionTokenMaintenance />
        <PodCollectionsBootstrap>
          <TelemetryProvider>
            <RouterProvider router={router} />
          </TelemetryProvider>
        </PodCollectionsBootstrap>
      </SolidDatabaseProvider>
    </SolidSessionProvider>
  )
}

export default AppRuntime
