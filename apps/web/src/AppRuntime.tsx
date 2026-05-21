import { RouterProvider } from '@tanstack/react-router'
import { SolidSessionProvider } from './providers/solid-session-provider'
import { SolidDatabaseProvider } from './providers/solid-database-provider'
import { PodCollectionsBootstrap } from './providers/pod-collections-bootstrap'
import { TelemetryProvider } from './lib/telemetry/telemetry-context'
import { router } from './router'

export function AppRuntime() {
  const isDesktopRuntime =
    typeof window !== 'undefined' && Boolean(window.xpodDesktop?.auth)
  const isAuthCallback =
    typeof window !== 'undefined'
    && window.location.pathname === '/auth/callback'
    && new URLSearchParams(window.location.search).has('code')
  const shouldRestoreInProvider =
    typeof window !== 'undefined'
    && window.location.protocol !== 'file:'
    && (!isDesktopRuntime || isAuthCallback)

  return (
    <SolidSessionProvider
      restorePreviousSession={shouldRestoreInProvider}
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
