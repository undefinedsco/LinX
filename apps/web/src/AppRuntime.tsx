import { RouterProvider } from '@tanstack/react-router'
import { SolidSessionProvider } from './providers/solid-session-provider'
import { SolidDatabaseProvider } from './providers/solid-database-provider'
import { PodCollectionsBootstrap } from './providers/pod-collections-bootstrap'
import { TelemetryProvider } from './lib/telemetry/telemetry-context'
import { router } from './router'
import { cleanupExpiredLoginTransaction } from './modules/login/login-utils'

export function AppRuntime() {
  const isDesktop = typeof window !== 'undefined' && Boolean(window.xpodDesktop?.auth)
  const isAuthCallback = typeof window !== 'undefined'
    && window.location.pathname.startsWith('/auth/callback')

  // Callback processing still needs the oidc.* state/PKCE/sessionId mapping.
  // Never run auth maintenance before AuthCallback has consumed it.
  if (!isAuthCallback) {
    cleanupExpiredLoginTransaction()
  }

  return (
    <SolidSessionProvider
      restorePreviousSession={!isDesktop && !isAuthCallback}
      onError={(error) => console.warn('🔴 SessionProvider error (ignored):', error)}
    >
      <SolidDatabaseProvider>
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
