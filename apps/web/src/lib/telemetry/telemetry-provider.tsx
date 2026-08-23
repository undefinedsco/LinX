import { useCallback } from 'react'
import type { ReactNode } from 'react'
import { TelemetryContext } from './telemetry-context'
import type { TelemetryEventType } from './types'

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const track = useCallback((type: TelemetryEventType, payload: Record<string, unknown> = {}) => {
    // Telemetry is intentionally silent in normal development and production.
    // Large payloads here can contain message/tool data and are not useful in
    // the browser console. Enable this only when diagnosing telemetry itself.
    if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_TELEMETRY === 'true') {
      console.debug('[telemetry]', type, payload)
    }

    // Persistence is intentionally deferred until the Pod telemetry contract
    // is defined; tracking must not create a second, non-authoritative store.
  }, [])

  return (
    <TelemetryContext.Provider value={{ track }}>
      {children}
    </TelemetryContext.Provider>
  )
}
