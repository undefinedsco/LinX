import React, { createContext, useContext, useCallback } from 'react'
import { TelemetryEventType, TelemetryContextType } from './types'

const TelemetryContext = createContext<TelemetryContextType | null>(null)

export function useTelemetry() {
  const context = useContext(TelemetryContext)
  if (!context) {
    // Return a dummy implementation if used outside provider
    return { track: () => {} }
  }
  return context
}

export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  const track = useCallback((type: TelemetryEventType, payload: Record<string, any> = {}) => {
    // MVP: Log to console
    console.log(`[Telemetry] ${type}`, payload)
    
    // TODO: Persist to Solid Pod (e.g., /private/telemetry/yyyy-mm-dd.ttl)
    // const event = {
    //   type,
    //   payload,
    //   timestamp: Date.now(),
    //   sessionId: session.info.sessionId
    // }
    // appendToLog(event)
  }, [])

  return (
    <TelemetryContext.Provider value={{ track }}>
      {children}
    </TelemetryContext.Provider>
  )
}
