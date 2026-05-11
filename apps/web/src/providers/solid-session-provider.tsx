import {
  EVENTS,
} from '@inrupt/solid-client-authn-browser'
import {
  SessionContext,
  SessionProvider as InruptSessionProvider,
  useSession,
} from '@inrupt/solid-ui-react'
import type { ReactNode } from 'react'
import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { capturePendingCallbackError } from '@/modules/login/login-utils'

interface SolidSessionProviderProps {
  children: ReactNode
  sessionId?: string
  restorePreviousSession?: boolean
  onError?: (error: Error) => void
  onSessionRestore?: (url: string) => void
}

export function SolidSessionProvider({
  children,
  sessionId,
  restorePreviousSession = true,
  onError,
  onSessionRestore,
}: SolidSessionProviderProps) {
  capturePendingCallbackError()

  return (
    <InruptSessionProvider
      sessionId={sessionId}
      restorePreviousSession={restorePreviousSession}
      skipLoadingProfile
      onError={onError}
      onSessionRestore={onSessionRestore}
    >
      <SessionEventBridge onError={onError}>
        {children}
      </SessionEventBridge>
    </InruptSessionProvider>
  )
}

function SessionEventBridge({
  children,
  onError,
}: {
  children: ReactNode
  onError?: (error: Error) => void
}) {
  const context = useContext(SessionContext)
  const { session, setSessionRequestInProgress } = context
  const [version, setVersion] = useState(0)
  const bumpVersion = useCallback(() => setVersion((current) => current + 1), [])

  useEffect(() => {
    const handleLogin = () => {
      setSessionRequestInProgress?.(false)
      bumpVersion()
    }
    const handleLogout = () => {
      setSessionRequestInProgress?.(false)
      bumpVersion()
    }
    const handleError = (code: unknown, error?: unknown) => {
      setSessionRequestInProgress?.(false)
      bumpVersion()
      console.warn('[solid-session] auth error', code, error)
      if (error instanceof Error) {
        onError?.(error)
        return
      }
      if (typeof error === 'string') {
        onError?.(new Error(error))
        return
      }
      if (typeof code === 'string') {
        onError?.(new Error(code))
      }
    }

    session.events.on(EVENTS.LOGIN, handleLogin)
    session.events.on(EVENTS.LOGOUT, handleLogout)
    session.events.on(EVENTS.SESSION_RESTORED, handleLogin)
    session.events.on(EVENTS.ERROR, handleError)

    return () => {
      session.events.off(EVENTS.LOGIN, handleLogin)
      session.events.off(EVENTS.LOGOUT, handleLogout)
      session.events.off(EVENTS.SESSION_RESTORED, handleLogin)
      session.events.off(EVENTS.ERROR, handleError)
    }
  }, [bumpVersion, onError, session.events, setSessionRequestInProgress])

  const value = useMemo(() => ({ ...context }), [context, version])

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  )
}

export { useSession }
