import {
  Session,
  EVENTS,
} from '@inrupt/solid-client-authn-browser'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { capturePendingCallbackError } from '@/modules/login/login-utils'
import { getPersistentBrowserStorage, PersistentSessionStorage } from './persistent-session-storage'
import { SessionContext, useSession } from './solid-session-context'

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

  const browserStorage = useMemo(() => getPersistentBrowserStorage(), [])
  const session = useMemo(() => new Session({
    secureStorage: new PersistentSessionStorage(browserStorage, 'secure'),
    insecureStorage: new PersistentSessionStorage(browserStorage, 'insecure'),
  }, sessionId), [browserStorage, sessionId])
  const restoreSession = restorePreviousSession || typeof onSessionRestore !== 'undefined'
  const [sessionRequestInProgress, setSessionRequestInProgress] = useState(
    !session.info.isLoggedIn,
  )
  const [profile, setProfile] = useState<undefined>(undefined)

  useEffect(() => {
    const handleSessionRestore = (url: string) => onSessionRestore?.(url)
    session.events.on(EVENTS.SESSION_RESTORED, handleSessionRestore)

    void session.handleIncomingRedirect({
      url: window.location.href,
      restorePreviousSession: restoreSession,
    })
      .catch((error) => {
        onError?.(error instanceof Error ? error : new Error(String(error)))
      })
      .finally(() => {
        setSessionRequestInProgress(false)
      })

    return () => {
      session.events.off(EVENTS.SESSION_RESTORED, handleSessionRestore)
    }
  }, [onError, onSessionRestore, restoreSession, session])

  const login = useCallback(async (options: Parameters<Session['login']>[0]) => {
    setSessionRequestInProgress(true)
    try {
      await session.login(options)
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)))
    } finally {
      setSessionRequestInProgress(false)
    }
  }, [onError, session])

  const logout = useCallback(async (options?: Parameters<Session['logout']>[0]) => {
    try {
      await session.logout(options)
      setProfile(undefined)
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)))
    }
  }, [onError, session])

  const contextValue = useMemo(() => ({
    session,
    login,
    logout,
    sessionRequestInProgress,
    setSessionRequestInProgress,
    fetch: session.fetch,
    profile,
  }), [login, logout, profile, session, sessionRequestInProgress])

  return (
    <SessionContext.Provider value={contextValue}>
      <SessionEventBridge onError={onError}>
        {children}
      </SessionEventBridge>
    </SessionContext.Provider>
  )
}

function SessionEventBridge({
  children,
  onError,
}: {
  children: ReactNode
  onError?: (error: Error) => void
}) {
  const context = useSession()
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

  const value = useMemo(() => {
    void version
    return { ...context }
  }, [context, version])

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  )
}

export { useSession }
