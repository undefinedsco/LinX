import { Suspense, StrictMode, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryProvider } from './providers/query-provider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Toaster } from './Toaster'
import './index.css'

const AppRuntime = lazy(() => import('./AppRuntime'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryProvider>
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <AppRuntime />
        </Suspense>
      </QueryProvider>
      <Toaster />
    </ErrorBoundary>
  </StrictMode>,
)
