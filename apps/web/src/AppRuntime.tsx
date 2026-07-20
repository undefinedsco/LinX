import { RouterProvider } from '@tanstack/react-router'
import { SolidSessionProvider } from './providers/solid-session-provider'
import { SolidDatabaseProvider } from './providers/solid-database-provider'
import { PodCollectionsBootstrap } from './providers/pod-collections-bootstrap'
import { TelemetryProvider } from './lib/telemetry/telemetry-context'
import { router } from './router'

export function AppRuntime() {
  const isDesktopRuntime = typeof window !== 'undefined' && Boolean(window.xpodDesktop)
  const shouldRestoreInProvider =
    typeof window !== 'undefined'
    && window.location.protocol !== 'file:'
    // Inrupt restores a browser session through a hidden iframe. Desktop uses
    // loopback callbacks, and an identity provider may require interaction;
    // that iframe redirect is rejected by Chromium and leaves the app blank.
    && !isDesktopRuntime

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
