import { createContext } from 'react'
import type { TelemetryContextType } from './types'

export const TelemetryContext = createContext<TelemetryContextType | null>(null)
