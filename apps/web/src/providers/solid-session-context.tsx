import type { Session } from '@inrupt/solid-client-authn-browser'
import { createContext, useContext } from 'react'

export interface SolidSessionContextValue {
  session: Session
  login: (options: Parameters<Session['login']>[0]) => Promise<void>
  logout: (options?: Parameters<Session['logout']>[0]) => Promise<void>
  sessionRequestInProgress: boolean
  setSessionRequestInProgress: (inProgress: boolean) => void
  fetch: Session['fetch']
  profile: undefined
}

export const SessionContext = createContext<SolidSessionContextValue | null>(null)

export function useSession(): SolidSessionContextValue {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession must be used inside SolidSessionProvider')
  }
  return context
}
