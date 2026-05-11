import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { EVENTS } from '@inrupt/solid-client-authn-browser'
import { useSession } from '@inrupt/solid-ui-react'
import { useLoginStore } from '@linx/stores/login'
import type { SolidDatabase } from '@undefineds.co/models'
import { createLinxSolidDatabase } from '@/lib/data/linx-solid-database'
import { getPendingLoginAttempt } from '@/modules/login/login-utils'

interface SolidDatabaseContextValue {
  db: SolidDatabase | null
  status: 'idle' | 'initializing' | 'ready' | 'error'
  error: Error | null
}

const SolidDatabaseContext = createContext<SolidDatabaseContextValue>({
  db: null,
  status: 'idle',
  error: null,
})

export function SolidDatabaseProvider({ children }: { children: ReactNode }) {
  const { session, sessionRequestInProgress } = useSession()
  const storedAccount = useLoginStore((state) => state.storedAccount)
  const [sessionVersion, setSessionVersion] = useState(0)

  const dbInstanceRef = useRef<SolidDatabase | null>(null)
  const initializedSessionKeyRef = useRef<string | null>(null)
  const initGenerationRef = useRef(0)
  const inFlightSessionKeyRef = useRef<string | null>(null)
  const observedSessionKeyRef = useRef<string | null>(null)
  const resolvedLocalPodUrlRef = useRef<string | null>(null)

  const [value, setValue] = useState<SolidDatabaseContextValue>({
    db: null,
    status: 'idle',
    error: null,
  })

  const publishValue = (nextValue: SolidDatabaseContextValue) => {
    if (typeof window !== 'undefined') {
      (window as any).__SOLID_DB_STATUS__ = nextValue.status
      ;(window as any).__SOLID_DB_ERROR__ = nextValue.error?.message ?? null
      ;(window as any).__SOLID_DB_POD_URL__ = resolveDatabasePodUrl(nextValue.db)
    }
    setValue(nextValue)
  }

  useEffect(() => {
    const bumpSessionVersion = () => setSessionVersion((current) => current + 1)

    session.events.on(EVENTS.LOGIN, bumpSessionVersion)
    session.events.on(EVENTS.SESSION_RESTORED, bumpSessionVersion)
    session.events.on(EVENTS.LOGOUT, bumpSessionVersion)
    session.events.on(EVENTS.ERROR, bumpSessionVersion)

    return () => {
      session.events.off(EVENTS.LOGIN, bumpSessionVersion)
      session.events.off(EVENTS.SESSION_RESTORED, bumpSessionVersion)
      session.events.off(EVENTS.LOGOUT, bumpSessionVersion)
      session.events.off(EVENTS.ERROR, bumpSessionVersion)
    }
  }, [session.events])

  useEffect(() => {
    const observeSessionKey = () => {
      const nextSessionKey = session.info.isLoggedIn && session.info.webId
        ? getSessionKey(session.info.sessionId, session.info.webId)
        : 'logged-out'

      if (observedSessionKeyRef.current === nextSessionKey) {
        return
      }

      observedSessionKeyRef.current = nextSessionKey
      setSessionVersion((current) => current + 1)
    }

    observeSessionKey()
    const intervalId = window.setInterval(observeSessionKey, 250)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [session])

  // sessionRequestInProgress is a React state in SolidSessionProvider.
  // When it transitions false → we know handleIncomingRedirect completed
  // and session.info.isLoggedIn is up to date.
  // session.info.isLoggedIn is NOT React state — it's a mutable property
  // on a stable object reference, so we can't use it as an effect dependency.
  useEffect(() => {
    // Still waiting for session provider to finish
    if (sessionRequestInProgress) return

    const isLoggedIn = session.info.isLoggedIn
    const webId = session.info.webId
    const sessionKey = isLoggedIn && webId ? getSessionKey(session.info.sessionId, webId) : null
    const podUrl = webId
      ? resolveLoginPodUrl(webId, storedAccount, resolvedLocalPodUrlRef.current)
      : resolvedLocalPodUrlRef.current
    if (podUrl) {
      resolvedLocalPodUrlRef.current = podUrl
    }
    const databaseKey = sessionKey ? getDatabaseKey(sessionKey, podUrl) : null

    if (!databaseKey) {
      initGenerationRef.current += 1
      inFlightSessionKeyRef.current = null
      if (dbInstanceRef.current) {
        dbInstanceRef.current = null
        initializedSessionKeyRef.current = null
      }
      publishValue({ db: null, status: 'idle', error: null })
      return
    }

    // Reuse existing instance for same session
    if (dbInstanceRef.current && initializedSessionKeyRef.current === databaseKey) {
      setValue((current) => {
        if (current.status === 'ready' && current.db === dbInstanceRef.current) {
          return current
        }
        const nextValue = { db: dbInstanceRef.current, status: 'ready' as const, error: null }
        if (typeof window !== 'undefined') {
          (window as any).__SOLID_DB_STATUS__ = nextValue.status
          ;(window as any).__SOLID_DB_ERROR__ = null
          ;(window as any).__SOLID_DB_POD_URL__ = resolveDatabasePodUrl(nextValue.db)
        }
        return nextValue
      })
      return
    }

    if (inFlightSessionKeyRef.current === databaseKey) {
      setValue((current) => {
        if (current.status === 'initializing') {
          return current
        }
        const nextValue = { db: null, status: 'initializing' as const, error: null }
        if (typeof window !== 'undefined') {
          (window as any).__SOLID_DB_STATUS__ = nextValue.status
          ;(window as any).__SOLID_DB_ERROR__ = null
          ;(window as any).__SOLID_DB_POD_URL__ = null
        }
        return nextValue
      })
      return
    }

    const generation = initGenerationRef.current + 1
    initGenerationRef.current = generation
    inFlightSessionKeyRef.current = databaseKey
    const initDatabase = async () => {
      try {
        publishValue({ db: null, status: 'initializing', error: null })

        const initTimeoutMs = resolveDatabaseInitTimeoutMs(podUrl)
        const instance = await createLinxSolidDatabase(session, {
          ...(initTimeoutMs === undefined ? {} : { initTimeoutMs }),
          podUrl,
        })

        if (!isCurrentSession(session.info, sessionKey, generation, initGenerationRef.current)) {
          return
        }

        dbInstanceRef.current = instance
        initializedSessionKeyRef.current = databaseKey
        if (typeof window !== 'undefined') {
          (window as any).__SOLID_DB__ = instance
        }
        publishValue({ db: instance, status: 'ready', error: null })
      } catch (error) {
        if (!isCurrentSession(session.info, sessionKey, generation, initGenerationRef.current)) {
          return
        }

        dbInstanceRef.current = null
        initializedSessionKeyRef.current = null
        publishValue({
          db: null,
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        })
      } finally {
        if (inFlightSessionKeyRef.current === databaseKey && initGenerationRef.current === generation) {
          inFlightSessionKeyRef.current = null
        }
      }
    }

    initDatabase()
  }, [sessionRequestInProgress, sessionVersion, session, storedAccount])

  const contextValue = useMemo(() => value, [value])

  return (
    <SolidDatabaseContext.Provider value={contextValue}>
      {children}
    </SolidDatabaseContext.Provider>
  )
}

export function useSolidDatabase() {
  return useContext(SolidDatabaseContext)
}

function getSessionKey(sessionId: string | undefined, webId: string): string {
  return `${sessionId ?? 'no-session-id'}:${webId}`
}

function getDatabaseKey(sessionKey: string, podUrl: string | null): string {
  return `${sessionKey}:pod=${podUrl ?? 'default'}`
}

function resolveDatabasePodUrl(db: SolidDatabase | null): string | null {
  const podUrl = (db as any)?.getDialect?.()?.getPodUrl?.()
  return typeof podUrl === 'string' && podUrl.trim() ? normalizePodUrl(podUrl) : null
}

function isCurrentSession(
  info: { isLoggedIn: boolean; sessionId?: string; webId?: string },
  expectedSessionKey: string | null,
  expectedGeneration: number,
  currentGeneration: number,
): boolean {
  return Boolean(
    info.isLoggedIn
    && info.webId
    && getSessionKey(info.sessionId, info.webId) === expectedSessionKey
    && expectedGeneration === currentGeneration,
  )
}

function resolveLoginPodUrl(
  webId: string,
  storedAccount: { providerUrl?: string; providerLabel?: string; issuerUrl?: string; issuerLabel?: string } | null,
  fallbackPodUrl: string | null = null,
): string | null {
  const pendingLoginAttempt = getPendingLoginAttempt()
  const candidates: Array<{ providerUrl?: string; providerLabel?: string; issuerUrl?: string }> = [
    {
      providerUrl: pendingLoginAttempt?.providerUrl,
      providerLabel: pendingLoginAttempt?.providerLabel,
      issuerUrl: pendingLoginAttempt?.issuerUrl,
    },
    {
      providerUrl: storedAccount?.providerUrl,
      providerLabel: storedAccount?.providerLabel,
      issuerUrl: storedAccount?.issuerUrl,
    },
  ]

  for (const candidate of candidates) {
    if (candidate.providerLabel?.trim().toLowerCase() !== 'local') {
      continue
    }

    const normalized = resolveProviderPodUrl(candidate.providerUrl, webId)
    if (normalized) {
      return normalized
    }
  }

  return fallbackPodUrl
}

function resolveProviderPodUrl(providerUrl: string | undefined, webId: string): string | null {
  try {
    if (typeof providerUrl !== 'string' || !providerUrl.trim()) {
      return null
    }

    const provider = new URL(providerUrl)
    const webIdUrl = new URL(webId)
    const podName = webIdUrl.pathname.match(/^\/([^/]+)\/profile\/card\/?$/)?.[1]
    if (!podName) {
      return normalizePodUrl(provider.toString())
    }

    provider.pathname = `/${podName}/`
    provider.search = ''
    provider.hash = ''
    return normalizePodUrl(provider.toString())
  } catch {
    return null
  }
}

function resolveDatabaseInitTimeoutMs(podUrl: string | null): number | undefined {
  if (!podUrl) {
    return undefined
  }

  try {
    const { hostname, protocol } = new URL(podUrl)
    const isLoopback =
      hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '[::1]'

    if (protocol === 'https:' && !isLoopback) {
      return 90_000
    }
  } catch {
    return undefined
  }

  return undefined
}

function normalizePodUrl(url?: string): string | null {
  if (typeof url !== 'string') {
    return null
  }

  const trimmed = url.trim()
  if (!trimmed) {
    return null
  }

  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}
