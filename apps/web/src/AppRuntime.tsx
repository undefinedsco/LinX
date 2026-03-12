import { RouterProvider } from '@tanstack/react-router'
import { SolidSessionProvider } from './providers/solid-session-provider'
import { SolidDatabaseProvider } from './providers/solid-database-provider'
import { PodCollectionsBootstrap } from './providers/pod-collections-bootstrap'
import { TelemetryProvider } from './lib/telemetry/telemetry-context'
import { router } from './router'

export function AppRuntime() {
  return (
    <SolidSessionProvider
      restorePreviousSession
      onError={(error) => console.warn('🔴 SessionProvider error (ignored):', error)}
    >
      <SolidDatabaseProvider>
        <PodCollectionsBootstrap />
        <TelemetryProvider>
          <RouterProvider router={router} />
        </TelemetryProvider>
      </SolidDatabaseProvider>
    </SolidSessionProvider>
  )
}

export default AppRuntime
