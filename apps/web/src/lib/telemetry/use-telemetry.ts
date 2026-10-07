import { useContext } from 'react'
import { TelemetryContext } from './telemetry-context'

export function useTelemetry() {
  const context = useContext(TelemetryContext)
  if (!context) {
    // Return a dummy implementation if used outside provider.
    return { track: () => {} }
  }
  return context
}
