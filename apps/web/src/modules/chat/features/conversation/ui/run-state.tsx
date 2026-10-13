import { createContext, useContext } from 'react'

/** Whether a stop was asked for and not yet confirmed by the run ending. */
export const StopStateContext = createContext<'idle' | 'stopping'>('idle')

export function useStopState(): 'idle' | 'stopping' {
  return useContext(StopStateContext)
}
