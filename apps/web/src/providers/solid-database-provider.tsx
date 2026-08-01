import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { EVENTS } from '@inrupt/solid-client-authn-browser'
import { useSession } from './solid-session-context'
import type { SolidDatabase } from '@undefineds.co/models'
import { LINX_CLOUD_IDENTITY_ORIGIN } from '@undefineds.co/models/client'
import { useLoginStore, type StoredAccount } from '@linx/stores/login'
import { createLinxSolidDatabase } from '@/lib/data/linx-solid-database'
import { isLocalAccessUrl } from '@/lib/local-access-url'
import {
  hasLocalAccessRouteSource,
  installLocalAccessRoute,
  resolveBestLocalAccessRoute,
} from '@/lib/local-access-route'
import {
  getPendingLoginAttempt,
  getPendingLoginTransaction,
} from '@/modules/login/login-utils'
import type { LoginRoute } from '@/modules/login/login-transaction'
import { createUserFacingLoginError } from '@/modules/login/error-messages'
import {
  fetchProfileStorageUrl,
  isStorageUrlWithinProviderBase,
} from '@/modules/login/storage-reconciliation'

interface SolidDatabaseState {
  db: SolidDatabase | null
  status: 'idle' | 'initializing' | 'ready' | 'error'
  error: Error | null
  scopeKey: string
}

interface SolidDatabaseContextValue extends SolidDatabaseState {
  retry: () => void
}

const SolidDatabaseContext = createContext<SolidDatabaseContextValue>({
  db: null,
  status: 'idle',
  error: null,
  scopeKey: 'logged-out',
  retry: () => undefined,
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

  const [value, setValue] = useState<SolidDatabaseState>({
    db: null,
    status: 'idle',
    error: null,
    scopeKey: 'logged-out',
  })

  const publishValue = (nextValue: SolidDatabaseState) => {
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
    const isLoggedIn = session.info.isLoggedIn
    const webId = session.info.webId

    // Redirect progress can remain stale after a restored session is already
    // usable. Only wait when the provider has not resolved an identity yet.
    if (sessionRequestInProgress && !(isLoggedIn && webId)) return

    const sessionKey = isLoggedIn && webId ? getSessionKey(session.info.sessionId, webId) : null
    const podContextResolution = webId ? resolveLoginPodContext(webId, storedAccount) : { context: null }
    const databasePodKey = getDatabasePodKey(podContextResolution)
    const databaseKey = sessionKey ? getDatabaseKey(sessionKey, databasePodKey) : null
    const databaseScopeKey = databaseKey ?? 'logged-out'

    if (sessionKey && podContextResolution.error) {
      initGenerationRef.current += 1
      inFlightSessionKeyRef.current = null
      installLocalAccessRoute(null)
      dbInstanceRef.current = null
      initializedSessionKeyRef.current = null
      publishValue({ db: null, status: 'error', error: podContextResolution.error, scopeKey: databaseScopeKey })
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
      publishValue({ db: null, status: 'idle', error: null, scopeKey: databaseScopeKey })
      return
    }

    // Reuse existing instance for same session
    if (dbInstanceRef.current && initializedSessionKeyRef.current === databaseKey) {
      setValue((current) => {
        if (
          current.status === 'ready'
          && current.db === dbInstanceRef.current
          && current.scopeKey === databaseScopeKey
        ) {
          return current
        }
        const nextValue = {
          db: dbInstanceRef.current,
          status: 'ready' as const,
          error: null,
          scopeKey: databaseScopeKey,
        }
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
        if (current.status === 'initializing' && current.scopeKey === databaseScopeKey) {
          return current
        }
        const nextValue = {
          db: null,
          status: 'initializing' as const,
          error: null,
          scopeKey: databaseScopeKey,
        }
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
        publishValue({ db: null, status: 'initializing', error: null, scopeKey: databaseScopeKey })

        const runtimePodContext = await resolveRuntimePodContext(
          webId ?? '',
          podContextResolution,
          session.fetch,
        )
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
        const transportUrlRewrite = resolveDatabaseTransportRewrite(accessRoute)
        const instance = await createLinxSolidDatabase(session, {
          ...(initTimeoutMs === undefined ? {} : { initTimeoutMs }),
          ...(transportUrlRewrite ? { transportUrlRewrite } : {}),
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
        publishValue({ db: instance, status: 'ready', error: null, scopeKey: databaseScopeKey })
      } catch (error) {
        if (!isCurrentSession(session.info, sessionKey, generation, initGenerationRef.current)) {
          return
        }

        dbInstanceRef.current = null
        initializedSessionKeyRef.current = null
        publishValue({
          db: null,
          status: 'error',
          error: createUserFacingLoginError(error, '登录后初始化失败。请重新登录后重试。'),
          scopeKey: databaseScopeKey,
        })
      } finally {
        if (inFlightSessionKeyRef.current === databaseKey && initGenerationRef.current === generation) {
          inFlightSessionKeyRef.current = null
        }
      }
    }

    initDatabase()
  }, [sessionRequestInProgress, sessionVersion, session, storedAccount])

  const retry = useCallback(() => {
    setSessionVersion((current) => current + 1)
  }, [])
  const activeScopeKey = getActiveDatabaseScopeKey(session.info, storedAccount)
  const contextValue = useMemo(() => {
    const scopedValue = value.scopeKey === activeScopeKey
      ? value
      : {
          db: null,
          status: activeScopeKey === 'logged-out' ? 'idle' as const : 'initializing' as const,
          error: null,
          scopeKey: activeScopeKey,
        }

    return { ...scopedValue, retry }
  }, [activeScopeKey, retry, value])

  return (
    <SolidDatabaseContext.Provider value={contextValue}>
      {children}
    </SolidDatabaseContext.Provider>
  )
}

export function useSolidDatabase() {
  return useContext(SolidDatabaseContext)
}

function resolveDatabaseTransportRewrite(
  accessRoute: {
    canonicalBaseUrl: string
    accessBaseUrl: string
  } | null,
): { fromBaseUrl: string; toBaseUrl: string } | null {
  if (!accessRoute || accessRoute.canonicalBaseUrl === accessRoute.accessBaseUrl) {
    return null
  }

  if (!canRewriteSignedPodTransport(accessRoute.canonicalBaseUrl, accessRoute.accessBaseUrl)) {
    return null
  }

  return {
    fromBaseUrl: accessRoute.canonicalBaseUrl,
    toBaseUrl: accessRoute.accessBaseUrl,
  }
}

function canRewriteSignedPodTransport(canonicalBaseUrl: string, accessBaseUrl: string): boolean {
  try {
    const canonical = new URL(canonicalBaseUrl)
    const access = new URL(accessBaseUrl)

    // DPoP-authenticated Solid requests are bound to the canonical issuer/SP
    // origin. Rewriting an HTTPS managed SP to a plain localhost transport
    // changes the request URL seen by CSS and is rejected as unauthorized.
    return !(canonical.protocol === 'https:' && access.protocol !== 'https:')
  } catch {
    return false
  }
}

function getSessionKey(sessionId: string | undefined, webId: string): string {
  return `${sessionId ?? 'no-session-id'}:${webId}`
}

function getDatabaseKey(sessionKey: string, podUrl: string | null): string {
  return `${sessionKey}:pod=${podUrl ?? 'default'}`
}

function getActiveDatabaseScopeKey(
  info: { isLoggedIn: boolean; sessionId?: string; webId?: string },
  storedAccount: StoredAccount | null,
): string {
  if (!info.isLoggedIn || !info.webId) return 'logged-out'
  const podContextResolution = resolveLoginPodContext(info.webId, storedAccount)
  return getDatabaseKey(
    getSessionKey(info.sessionId, info.webId),
    getDatabasePodKey(podContextResolution),
  )
}

function getDatabasePodKey(resolution: LoginPodContextResolution): string | null {
  if (resolution.context) {
    return resolution.context.podUrl
  }

  if (resolution.profileStorageProvider) {
    const storageProviderUrl = resolution.profileStorageProvider.storageProviderUrl ?? undefined
    return storageProviderUrl
      ? `profile-storage:${normalizePodUrl(storageProviderUrl) ?? storageProviderUrl}`
      : 'profile-storage:auto'
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
  storageProviderUrl?: string
  storageProviderLabel?: string
}

interface LoginPodContextResolution {
  context: LoginPodContext | null
  error?: Error
  profileStorageProvider?: {
    storageProviderUrl?: string | null
    storageProviderLabel?: string
    enforceProviderBase?: boolean
  }
}

function resolveLoginPodContext(
  webId: string,
  storedAccount: StoredAccount | null,
): LoginPodContextResolution {
  const pendingTransaction = getPendingLoginTransaction()
  if (pendingTransaction) {
    const resolved = resolveCandidatePodContext(
      webId,
      {
        route: pendingTransaction.route,
        storageProviderUrl: pendingTransaction.storageProviderUrl,
        storageProviderLabel: pendingTransaction.storageProviderLabel,
        issuerUrl: pendingTransaction.accountIssuerUrl,
      },
    )
    if (pendingTransaction.route !== 'local') {
      return resolved
    }
    if (!pendingTransaction.authorizationQuery?.provisionCode) {
      return {
        context: null,
        error: new Error('本机空间还没有完成准备。请回到登录方式页，再点一次“本机空间”。'),
      }
    }
    return resolved
  }

  const pendingLoginAttempt = getPendingLoginAttempt()
  if (pendingLoginAttempt) {
    const resolved = resolveCandidatePodContext(
      webId,
      {
        route: undefined,
        storageProviderUrl: pendingLoginAttempt.storageProviderUrl,
        storageProviderLabel: pendingLoginAttempt.storageProviderLabel,
        issuerUrl: pendingLoginAttempt.accountIssuerUrl ?? pendingLoginAttempt.issuerUrl,
      },
    )
    if (isPendingSplitLocalLoginAttempt(pendingLoginAttempt) && !pendingLoginAttempt.authorizationQuery?.provisionCode) {
      return {
        context: null,
        error: new Error('本机空间还没有完成准备。请回到登录方式页，再点一次“本机空间”。'),
      }
    }
    return resolved
  }

  if (storedAccount && matchesStoredAccountWebId(storedAccount, webId)) {
    const restored = resolveCandidatePodContext(
      webId,
      {
        storageProviderUrl: storedAccount.storageProviderUrl,
        storageProviderLabel: storedAccount.storageProviderLabel,
        issuerUrl: storedAccount.issuerUrl,
      },
    )
    if (restored.context || restored.error || restored.profileStorageProvider) {
      return restored
    }
  }

  return {
    context: null,
    profileStorageProvider: {
      enforceProviderBase: false,
    },
  }
}

function matchesStoredAccountWebId(storedAccount: StoredAccount, webId: string): boolean {
  return !storedAccount.webId || storedAccount.webId === webId
}

async function resolveRuntimePodContext(
  webId: string,
  resolution: LoginPodContextResolution,
  fetcher: typeof fetch,
): Promise<LoginPodContextResolution> {
  if (!resolution.profileStorageProvider) {
    return resolution
  }

  const profileStorageUrl = await fetchProfileStorageUrl(webId, fetcher, {
    storageProviderUrl: resolution.profileStorageProvider.storageProviderUrl,
  })
  const providerBaseUrl = normalizePodUrl(resolution.profileStorageProvider.storageProviderUrl ?? undefined)
  if (!profileStorageUrl) {
    return {
      context: null,
      error: new Error('LinX 还不能把数据保存到当前空间。请换一个空间；如果这是本机空间，请先完成空间创建。'),
    }
  }

  if (
    resolution.profileStorageProvider.enforceProviderBase !== false
    && (!providerBaseUrl || !isStorageUrlWithinProviderBase(profileStorageUrl, providerBaseUrl))
  ) {
    return {
      context: null,
      error: new Error('账号和当前空间不匹配。请换账号或换空间后重试。'),
    }
  }

  const podUrl = normalizePodUrl(profileStorageUrl)
  if (!podUrl) {
    return {
      context: null,
      error: new Error('当前空间不可用。请换一个空间，或联系空间管理员。'),
    }
  }

  return {
    context: {
      podUrl,
      ...(providerBaseUrl ? { storageProviderUrl: providerBaseUrl } : {}),
      storageProviderLabel: resolution.profileStorageProvider.storageProviderLabel,
    },
  }
}

function resolveCandidatePodContext(
  webId: string,
  candidate: { route?: LoginRoute; storageProviderUrl?: string; storageProviderLabel?: string; issuerUrl?: string },
): LoginPodContextResolution {
  const classification = classifyStorageProvider(candidate.storageProviderUrl, candidate.issuerUrl, webId, candidate.storageProviderLabel, candidate.route)
  if (classification.kind === 'default') {
    if (shouldUseProfileStorageForProvider(candidate)) {
      return {
        context: null,
        profileStorageProvider: {
          storageProviderUrl: candidate.storageProviderUrl ?? '',
          storageProviderLabel: candidate.storageProviderLabel,
          enforceProviderBase: true,
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

  if (shouldUseProfileStorageForSelectedProvider(candidate)) {
    return {
      context: null,
      profileStorageProvider: {
        storageProviderUrl: candidate.storageProviderUrl ?? '',
        storageProviderLabel: candidate.storageProviderLabel,
        enforceProviderBase: true,
      },
    }
  }

  const normalized = resolveProviderPodUrl(candidate.storageProviderUrl, webId)
  if (!normalized) {
    return {
      context: null,
      error: new Error('本机空间不可用。请返回登录方式页，重新选择“本地”。'),
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
  candidate: { route?: LoginRoute; storageProviderUrl?: string; storageProviderLabel?: string; issuerUrl?: string },
): boolean {
  if (typeof candidate.storageProviderUrl !== 'string' || !candidate.storageProviderUrl.trim()) {
    return false
  }

  if (isLocalAccessUrl(candidate.storageProviderUrl)) {
    return false
  }

  const normalizedLabel = candidate.storageProviderLabel?.trim().toLowerCase()
  if (candidate.route === 'cloud' || candidate.route === 'local' || candidate.route === 'standalone') {
    return false
  }
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

function shouldUseProfileStorageForSelectedProvider(
  candidate: { route?: LoginRoute; storageProviderUrl?: string; storageProviderLabel?: string; issuerUrl?: string },
): boolean {
  if (typeof candidate.storageProviderUrl !== 'string' || !candidate.storageProviderUrl.trim()) {
    return false
  }

  if (isLocalAccessUrl(candidate.storageProviderUrl)) {
    return false
  }

  const normalizedLabel = candidate.storageProviderLabel?.trim().toLowerCase()
  if (candidate.route === 'standalone' || normalizedLabel === 'standalone') {
    return false
  }

  if (candidate.route === 'cloud' || normalizedLabel === 'cloud') {
    return false
  }

  return true
}

function isPendingSplitLocalLoginAttempt(attempt: {
  issuerUrl?: string
  accountIssuerUrl?: string
  storageProviderUrl?: string
  storageProviderLabel?: string
}): boolean {
  const normalizedLabel = attempt.storageProviderLabel?.trim().toLowerCase()
  if (normalizedLabel === 'standalone' || normalizedLabel === 'cloud') {
    return false
  }

  if (normalizedLabel === 'local') {
    return true
  }

  const providerOrigin = normalizeOrigin(attempt.storageProviderUrl)
  const issuerOrigin = normalizeOrigin(attempt.accountIssuerUrl ?? attempt.issuerUrl)
  return Boolean(providerOrigin && issuerOrigin && providerOrigin !== issuerOrigin && !isLocalAccessUrl(attempt.accountIssuerUrl ?? attempt.issuerUrl))
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
  route?: LoginRoute,
): { kind: 'default' } | { kind: 'selected' } | { kind: 'invalid'; message: string } {
  if (typeof storageProviderUrl !== 'string' || !storageProviderUrl.trim()) {
    return { kind: 'default' }
  }

  const normalizedLabel = storageProviderLabel?.trim().toLowerCase()
  const providerOrigin = normalizeOrigin(storageProviderUrl)
  if (!providerOrigin) {
    return normalizedLabel === 'local' || normalizedLabel === 'standalone'
      ? { kind: 'invalid', message: '本机空间不可用。请返回登录方式页，重新选择“本地”。' }
      : { kind: 'default' }
  }

  const issuerOrigin = normalizeOrigin(issuerUrl)
  const providerIsAccessRoute = isLocalAccessUrl(storageProviderUrl)
  const issuerIsAccessRoute = isLocalAccessUrl(issuerUrl)
  const explicitlyLocal = route === 'local' || normalizedLabel === 'local'
  const explicitlyStandalone = route === 'standalone' || normalizedLabel === 'standalone'

  if (explicitlyStandalone) {
    return { kind: 'selected' }
  }

  if (explicitlyLocal && issuerOrigin && providerOrigin === issuerOrigin) {
    return issuerIsAccessRoute
      ? { kind: 'default' }
      : {
          kind: 'invalid',
          message: '本机空间还没有完成准备。请回到登录方式页，再点一次“本机空间”。',
        }
  }

  const splitByOrigin = Boolean(issuerOrigin && providerOrigin !== issuerOrigin)
  if (!explicitlyLocal && !splitByOrigin) {
    return { kind: 'default' }
  }

  if (providerIsAccessRoute) {
    return {
      kind: 'invalid',
      message: '本机空间还没完成登录准备。请返回登录方式页，重新选择“本地”。',
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
