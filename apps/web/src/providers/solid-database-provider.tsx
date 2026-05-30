import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { EVENTS } from '@inrupt/solid-client-authn-browser'
import { useSession } from '@inrupt/solid-ui-react'
import { useLoginStore } from '@linx/stores/login'
import type { SolidDatabase } from '@undefineds.co/models'
import { LINX_CLOUD_IDENTITY_ORIGIN } from '@undefineds.co/models/client'
import { createLinxSolidDatabase } from '@/lib/data/linx-solid-database'
import { isLocalAccessUrl } from '@/lib/local-access-url'
import {
  hasLocalAccessRouteSource,
  installLocalAccessRoute,
  resolveBestLocalAccessRoute,
} from '@/lib/local-access-route'
import { getPendingLoginAttempt } from '@/modules/login/login-utils'
import {
  fetchProfileStorageUrl,
  isStorageUrlWithinProviderBase,
} from '@/modules/login/storage-reconciliation'

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
    const podContextResolution = webId ? resolveLoginPodContext(webId, storedAccount) : { context: null }
    const databasePodKey = getDatabasePodKey(podContextResolution)
    const databaseKey = sessionKey ? getDatabaseKey(sessionKey, databasePodKey) : null

    if (sessionKey && podContextResolution.error) {
      initGenerationRef.current += 1
      inFlightSessionKeyRef.current = null
      installLocalAccessRoute(null)
      dbInstanceRef.current = null
      initializedSessionKeyRef.current = null
      publishValue({ db: null, status: 'error', error: podContextResolution.error })
      return
    }

    if (!databaseKey) {
      initGenerationRef.current += 1
      inFlightSessionKeyRef.current = null
      installLocalAccessRoute(null)
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

        const runtimePodContext = await resolveRuntimePodContext(webId ?? '', podContextResolution)
        if (runtimePodContext.error) {
          throw runtimePodContext.error
        }
        const podContext = runtimePodContext.context
        const podUrl = podContext?.podUrl ?? null

        const accessRoute = hasLocalAccessRouteSource()
          ? await resolveBestLocalAccessRoute({
              canonicalPodUrl: podUrl,
              storageProviderLabel: podContext?.storageProviderLabel,
              storageProviderUrl: podContext?.storageProviderUrl,
            })
          : null
        if (!isCurrentSession(session.info, sessionKey, generation, initGenerationRef.current)) {
          return
        }
        installLocalAccessRoute(accessRoute)

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

function getDatabasePodKey(resolution: LoginPodContextResolution): string | null {
  if (resolution.context) {
    return resolution.context.podUrl
  }

  if (resolution.profileStorageProvider) {
    return `profile-storage:${normalizePodUrl(resolution.profileStorageProvider.storageProviderUrl) ?? resolution.profileStorageProvider.storageProviderUrl}`
  }

  return null
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

interface LoginPodContext {
  podUrl: string
  storageProviderUrl: string
  storageProviderLabel?: string
}

interface LoginPodContextResolution {
  context: LoginPodContext | null
  error?: Error
  profileStorageProvider?: {
    storageProviderUrl: string
    storageProviderLabel?: string
  }
}

function resolveLoginPodContext(
  webId: string,
  storedAccount: { storageProviderUrl?: string; storageProviderLabel?: string; issuerUrl?: string; issuerLabel?: string } | null,
): LoginPodContextResolution {
  const pendingLoginAttempt = getPendingLoginAttempt()
  if (pendingLoginAttempt) {
    return resolveCandidatePodContext(
      webId,
      {
        storageProviderUrl: pendingLoginAttempt.storageProviderUrl,
        storageProviderLabel: pendingLoginAttempt.storageProviderLabel,
        issuerUrl: pendingLoginAttempt.issuerUrl,
      },
    )
  }

  return resolveCandidatePodContext(
    webId,
    {
      storageProviderUrl: storedAccount?.storageProviderUrl,
      storageProviderLabel: storedAccount?.storageProviderLabel,
      issuerUrl: storedAccount?.issuerUrl,
    },
  )
}

async function resolveRuntimePodContext(
  webId: string,
  resolution: LoginPodContextResolution,
): Promise<LoginPodContextResolution> {
  if (!resolution.profileStorageProvider) {
    return resolution
  }

  const profileStorageUrl = await fetchProfileStorageUrl(webId)
  const providerBaseUrl = normalizePodUrl(resolution.profileStorageProvider.storageProviderUrl)
  if (!profileStorageUrl || !providerBaseUrl) {
    return {
      context: null,
      error: new Error('Custom provider profile 缺少 solid:storage，已阻止进入，避免写入错误空间。'),
    }
  }

  if (!isStorageUrlWithinProviderBase(profileStorageUrl, providerBaseUrl)) {
    return {
      context: null,
      error: new Error('Custom provider profile 的 solid:storage 不在当前 provider 下，已阻止进入。'),
    }
  }

  const podUrl = normalizePodUrl(profileStorageUrl)
  if (!podUrl) {
    return {
      context: null,
      error: new Error('Custom provider storage URL 无法解析，已阻止进入，避免写入错误空间。'),
    }
  }

  return {
    context: {
      podUrl,
      storageProviderUrl: resolution.profileStorageProvider.storageProviderUrl,
      storageProviderLabel: resolution.profileStorageProvider.storageProviderLabel,
    },
  }
}

function resolveCandidatePodContext(
  webId: string,
  candidate: { storageProviderUrl?: string; storageProviderLabel?: string; issuerUrl?: string },
): LoginPodContextResolution {
  const classification = classifyStorageProvider(candidate.storageProviderUrl, candidate.issuerUrl, webId, candidate.storageProviderLabel)
  if (classification.kind === 'default') {
    if (shouldUseProfileStorageForProvider(candidate)) {
      return {
        context: null,
        profileStorageProvider: {
          storageProviderUrl: candidate.storageProviderUrl ?? '',
          storageProviderLabel: candidate.storageProviderLabel,
        },
      }
    }
    return { context: null }
  }

  if (classification.kind === 'invalid') {
    return {
      context: null,
      error: new Error(classification.message),
    }
  }

  const normalized = resolveProviderPodUrl(candidate.storageProviderUrl, webId)
  if (!normalized) {
    return {
      context: null,
      error: new Error('Local storage URL 无法解析，已阻止进入，避免写入错误空间。'),
    }
  }

  return {
    context: {
      podUrl: normalized,
      storageProviderUrl: candidate.storageProviderUrl ?? normalized,
      storageProviderLabel: candidate.storageProviderLabel,
    },
  }
}

function shouldUseProfileStorageForProvider(
  candidate: { storageProviderUrl?: string; storageProviderLabel?: string; issuerUrl?: string },
): boolean {
  if (typeof candidate.storageProviderUrl !== 'string' || !candidate.storageProviderUrl.trim()) {
    return false
  }

  if (isLocalAccessUrl(candidate.storageProviderUrl)) {
    return false
  }

  const normalizedLabel = candidate.storageProviderLabel?.trim().toLowerCase()
  if (normalizedLabel === 'cloud' || normalizedLabel === 'local' || normalizedLabel === 'standalone') {
    return false
  }
  if (!normalizedLabel) {
    const providerOrigin = normalizeOrigin(candidate.storageProviderUrl)
    const issuerOrigin = normalizeOrigin(candidate.issuerUrl)
    const cloudOrigin = normalizeOrigin(LINX_CLOUD_IDENTITY_ORIGIN)
    return Boolean(providerOrigin && issuerOrigin && providerOrigin === issuerOrigin && providerOrigin !== cloudOrigin)
  }

  return true
}

function resolveProviderPodUrl(storageProviderUrl: string | undefined, webId: string): string | null {
  try {
    if (typeof storageProviderUrl !== 'string' || !storageProviderUrl.trim()) {
      return null
    }

    const provider = new URL(storageProviderUrl)
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

function classifyStorageProvider(
  storageProviderUrl: string | undefined,
  issuerUrl: string | undefined,
  _webId: string,
  storageProviderLabel?: string,
): { kind: 'default' } | { kind: 'selected' } | { kind: 'invalid'; message: string } {
  if (typeof storageProviderUrl !== 'string' || !storageProviderUrl.trim()) {
    return { kind: 'default' }
  }

  const normalizedLabel = storageProviderLabel?.trim().toLowerCase()
  const providerOrigin = normalizeOrigin(storageProviderUrl)
  if (!providerOrigin) {
    return normalizedLabel === 'local' || normalizedLabel === 'standalone'
      ? { kind: 'invalid', message: 'Local storage URL 无法解析，已阻止进入，避免写入错误空间。' }
      : { kind: 'default' }
  }

  const issuerOrigin = normalizeOrigin(issuerUrl)
  const providerIsAccessRoute = isLocalAccessUrl(storageProviderUrl)
  const issuerIsAccessRoute = isLocalAccessUrl(issuerUrl)
  const explicitlyLocal = normalizedLabel === 'local'
  const explicitlyStandalone = normalizedLabel === 'standalone'

  if (explicitlyStandalone) {
    return { kind: 'selected' }
  }

  if (explicitlyLocal && issuerOrigin && providerOrigin === issuerOrigin) {
    return issuerIsAccessRoute
      ? { kind: 'default' }
      : {
          kind: 'invalid',
          message: 'Local storage URL 必须指向 selected Local SP，不能等于 OIDC issuer。',
        }
  }

  const splitByOrigin = Boolean(issuerOrigin && providerOrigin !== issuerOrigin)
  if (!explicitlyLocal && !splitByOrigin) {
    return { kind: 'default' }
  }

  if (providerIsAccessRoute) {
    return {
      kind: 'invalid',
      message: 'Local storage URL 必须是 canonical 域名，不能使用 localhost 或局域网访问地址。',
    }
  }

  return { kind: 'selected' }
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

function normalizeOrigin(url?: string): string | null {
  if (typeof url !== 'string' || !url.trim()) {
    return null
  }

  try {
    return new URL(url).origin
  } catch {
    return null
  }
}
