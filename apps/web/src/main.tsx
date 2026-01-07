import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { QueryProvider } from './providers/query-provider'
import { SolidSessionProvider } from './shared/auth/solid-session-provider'
import { SolidDatabaseProvider } from './providers/solid-database-provider'
import { TelemetryProvider } from './lib/telemetry/telemetry-context' // Import TelemetryProvider
import { ErrorBoundary } from './components/ErrorBoundary'
import { router } from './router'
import { Toaster } from './Toaster' // Import Toaster
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryProvider>
        <SolidSessionProvider>
          <SolidDatabaseProvider>
            <TelemetryProvider> {/* Wrap with TelemetryProvider */}
              <RouterProvider router={router} />
            </TelemetryProvider>
          </SolidDatabaseProvider>
        </SolidSessionProvider>
      </QueryProvider>
      <Toaster /> {/* Render Toaster */}
    </ErrorBoundary>
  </StrictMode>,
)
