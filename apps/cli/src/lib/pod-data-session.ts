import type { Session } from '@inrupt/solid-client-authn-node'
import { LINX_CLOUD_RUNTIME_API_BASE_URL, resolveLinxPodUrl } from '@undefineds.co/models/client'
import { loadAccountSession } from './account-session.js'
import {
  getClientCredentialId,
  getClientCredentialKey,
  getClientCredentials,
  loadCredentials,
  getOidcOAuthSecrets,
  type StoredCredentials,
} from './credentials-store.js'
import { getOidcAccessToken, restoreStoredOidcSession } from './oidc-auth.js'
import { authenticate } from './solid-auth.js'
import { normalizeMisclassifiedCloudCompletionPodTimeoutMessage } from './linx-cloud-errors.js'

export type PodFetch = (url: string, init?: RequestInit) => Promise<Response>

export interface SolidSessionLike {
  info: {
    isLoggedIn: boolean
    webId?: string
    sessionId?: string
    podUrl?: string
  }
  fetch: typeof fetch
  login?: () => Promise<void>
  logout: () => Promise<void>
  handleIncomingRedirect?: (url: string) => Promise<unknown>
}

export interface PodDataSession {
  credentials: StoredCredentials
  webId: string
  podUrl: string
  fetch: PodFetch
  solidSession: SolidSessionLike
  runtimeFetch: PodFetch
  getRuntimeAuthToken(): Promise<string>
  close(): Promise<void>
}

export interface PodDataSessionRuntime {
  loadCredentials(): StoredCredentials | null
  getClientCredentials(credentials: StoredCredentials): ReturnType<typeof getClientCredentials>
  restoreStoredOidcSession(credentials: StoredCredentials, options?: { forceRefresh?: boolean }): Promise<Session | null>
  getOidcAccessToken(credentials: Pick<StoredCredentials, 'authType' | 'secrets' | 'webId' | 'url'>, options?: { forceRefresh?: boolean }): ReturnType<typeof getOidcAccessToken>
  authenticate(clientId: string, clientSecret: string, oidcIssuer: string): Promise<{ session: Session }>
  authTimeoutMs?: number
  fetchTimeoutMs?: number
}

const defaultRuntime: PodDataSessionRuntime = {
  loadCredentials,
  getClientCredentials,
  restoreStoredOidcSession,
  getOidcAccessToken,
  authenticate,
}

const DEFAULT_POD_DATA_AUTH_TIMEOUT_MS = 15_000
const DEFAULT_POD_DATA_FETCH_TIMEOUT_MS = 30_000

let defaultSessionPromise: Promise<PodDataSession | null> | null = null
let defaultSessionCredentialKey: string | null = null

export function clearDefaultPodDataSession(): void {
  const existing = defaultSessionPromise
  defaultSessionPromise = null
  defaultSessionCredentialKey = null
  void existing?.then((session) => session?.close()).catch(() => undefined)
}

export async function getDefaultPodDataSession(): Promise<PodDataSession | null> {
  const credentials = defaultRuntime.loadCredentials()
  const credentialKey = createPodDataSessionCacheKey(credentials)
  if (!credentialKey) {
    clearDefaultPodDataSession()
    return null
  }

  if (!defaultSessionPromise || defaultSessionCredentialKey !== credentialKey) {
    clearDefaultPodDataSession()
    defaultSessionCredentialKey = credentialKey
    defaultSessionPromise = createPodDataSession(defaultRuntime)
      .then((session) => {
        if (!session) {
          defaultSessionPromise = null
          defaultSessionCredentialKey = null
        }
        return session
      })
      .catch((error) => {
        defaultSessionPromise = null
        defaultSessionCredentialKey = null
        throw error
      })
  }

  return defaultSessionPromise
}

function createPodDataSessionCacheKey(credentials: StoredCredentials | null): string | null {
  if (!credentials) {
    return null
  }

  const base = [
    credentials.sourceDir,
    credentials.url,
    credentials.webId,
    credentials.authType,
  ]

  const clientCredentials = getClientCredentials(credentials)
  if (clientCredentials) {
    return JSON.stringify([
      ...base,
      getClientCredentialId(clientCredentials),
      getClientCredentialKey(clientCredentials),
    ])
  }

  const oidcSecrets = getOidcOAuthSecrets(credentials)
  if (oidcSecrets) {
    return JSON.stringify([
      ...base,
      oidcSecrets.oidcClientId ?? '',
      oidcSecrets.oidcRefreshToken,
    ])
  }

  return JSON.stringify([...base, credentials.secrets])
}

export async function createPodDataSession(
  runtime: PodDataSessionRuntime = defaultRuntime,
): Promise<PodDataSession | null> {
  const credentials = runtime.loadCredentials()
  if (!credentials) {
    return null
  }

  const clientCredentials = runtime.getClientCredentials(credentials)
  if (clientCredentials) {
    const clientId = getClientCredentialId(clientCredentials)
    const clientSecret = getClientCredentialKey(clientCredentials)
    const { session } = await withTimeout(
      runtime.authenticate(clientId, clientSecret, credentials.url),
      runtime.authTimeoutMs ?? DEFAULT_POD_DATA_AUTH_TIMEOUT_MS,
      'LinX Pod client credentials authentication timed out.',
    )
    const webId = session.info.webId ?? credentials.webId
    if (!webId) {
      await session.logout().catch(() => undefined)
      throw new Error('Pod client credentials login succeeded without a WebID. Run `linx login` again.')
    }
    const podUrl = resolvePodDataSessionUrl(webId)

    const sessionFetch = createSanitizedSessionFetch(session)
    const fetchWithTimeout: PodFetch = (url, init) => withFetchTimeout(
      sessionFetch,
      url,
      init,
      podUrl,
      runtime.fetchTimeoutMs ?? DEFAULT_POD_DATA_FETCH_TIMEOUT_MS,
    )
    const runtimeFetch = createRuntimeFetch(sessionFetch)

    return {
      credentials,
      webId,
      podUrl,
      solidSession: createSessionLikeFromSolidSession(session, fetchWithTimeout, podUrl),
      fetch: fetchWithTimeout,
      runtimeFetch,
      async getRuntimeAuthToken() {
        throw new Error('LinX runtime auth is session-managed. Use runtimeFetch instead of requesting a raw token.')
      },
      close: () => session.logout().catch(() => undefined),
    }
  }

  if (credentials.authType === 'oidc_oauth' && credentials.webId) {
    const session = await withTimeout(
      runtime.restoreStoredOidcSession(credentials, { forceRefresh: true }),
      runtime.authTimeoutMs ?? DEFAULT_POD_DATA_AUTH_TIMEOUT_MS,
      'LinX Pod OIDC session restoration timed out.',
    )
    if (!session) {
      throw new Error('Failed to restore OIDC session for Pod data access. Run `linx login` again.')
    }

    const webId = session.info.webId ?? credentials.webId
    const podUrl = resolvePodDataSessionUrl(webId)
    const sessionFetch = createSanitizedSessionFetch(session)
    const fetchWithTimeout: PodFetch = (url, init) => withFetchTimeout(
      sessionFetch,
      url,
      init,
      podUrl,
      runtime.fetchTimeoutMs ?? DEFAULT_POD_DATA_FETCH_TIMEOUT_MS,
    )
    const runtimeFetch = createRuntimeFetch(sessionFetch)

    return {
      credentials,
      webId,
      podUrl,
      solidSession: createSessionLikeFromSolidSession(session, fetchWithTimeout, podUrl),
      fetch: fetchWithTimeout,
      runtimeFetch,
      async getRuntimeAuthToken() {
        const accessToken = await withTimeout(
          runtime.getOidcAccessToken(credentials, { forceRefresh: true }),
          runtime.authTimeoutMs ?? DEFAULT_POD_DATA_AUTH_TIMEOUT_MS,
          'LinX Pod OIDC token refresh timed out.',
        )
        if (!accessToken) {
          throw new Error('Failed to restore OIDC access token for Pod data access.')
        }
        return accessToken
      },
      close: () => closeRestoredOidcSession(session),
    }
  }

  return null
}

function createSessionLikeFromSolidSession(session: Session, fetcher: PodFetch, podUrl: string): SolidSessionLike {
  return {
    info: { ...session.info, podUrl },
    fetch: (input, init) => fetcher(requestInputToUrl(input), init),
    login: (...args: Parameters<Session['login']>) => session.login(...args),
    logout: () => session.logout(),
    handleIncomingRedirect: (url: string) => session.handleIncomingRedirect(url),
  }
}

function createSanitizedSessionFetch(session: Pick<Session, 'fetch'>): PodFetch {
  return (url, init) => session.fetch(url, sanitizeFetchInit(init))
}

function sanitizeFetchInit(init: RequestInit | undefined): RequestInit | undefined {
  if (!init?.headers) {
    return init
  }

  const headers = new Headers(init.headers)
  if (!headers.has('content-length')) {
    return init
  }

  headers.delete('content-length')
  return {
    ...init,
    headers,
  }
}

async function closeRestoredOidcSession(session: Session): Promise<void> {
  const timeoutHandle = (session as unknown as { lastTimeoutHandle?: ReturnType<typeof setTimeout> | number }).lastTimeoutHandle
  if (timeoutHandle) {
    clearTimeout(timeoutHandle as ReturnType<typeof setTimeout>)
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

async function withFetchTimeout(
  fetcher: PodFetch,
  url: string,
  init: RequestInit | undefined,
  podUrl: string,
  timeoutMs: number,
): Promise<Response> {
  if (!isPodStorageRequest(url, podUrl)) {
    return fetcher(url, init)
  }

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const signal = init?.signal
    ? combineAbortSignals(init.signal, controller.signal)
    : controller.signal

  try {
    return await Promise.race([
      fetcher(url, { ...init, signal }),
      new Promise<Response>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => {
          if (timedOut) {
            const method = init?.method ?? 'GET'
            reject(new Error(`LinX Pod request timed out after ${Math.round(timeoutMs / 1000)}s: ${method} ${url}`))
          }
        }, { once: true })
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

function createRuntimeFetch(fetcher: PodFetch): PodFetch {
  return async (url, init) => {
    try {
      return await fetcher(url, init)
    } catch (error) {
      const normalized = normalizeMisclassifiedCloudCompletionPodTimeoutMessage(error)
      if (normalized) {
        const rewritten = new Error(normalized)
        ;(rewritten as { cause?: unknown }).cause = error
        throw rewritten
      }
      throw error
    }
  }
}

function isPodStorageRequest(url: string, podUrl: string): boolean {
  try {
    const target = new URL(url)
    const storage = new URL(podUrl)
    if (isRuntimeApiRequest(target)) {
      return false
    }
    return target.origin === storage.origin
      && normalizePathname(target.pathname).startsWith(normalizePathname(storage.pathname))
  } catch {
    return true
  }
}

function isRuntimeApiRequest(target: URL): boolean {
  if (isChatCompletionRuntimeEndpoint(target)) {
    return true
  }

  const cloudRuntime = new URL(LINX_CLOUD_RUNTIME_API_BASE_URL)
  return target.origin === cloudRuntime.origin
    && normalizePathname(target.pathname).startsWith(normalizePathname(cloudRuntime.pathname))
}

function isChatCompletionRuntimeEndpoint(target: URL): boolean {
  const segments = normalizePathname(target.pathname).split('/').filter(Boolean)
  return segments.length >= 3
    && /^v\d+$/.test(segments.at(-3) ?? '')
    && segments.at(-2) === 'chat'
    && segments.at(-1) === 'completions'
}

function normalizePathname(pathname: string): string {
  const normalized = pathname.endsWith('/') ? pathname : `${pathname}/`
  return normalized.replace(/\/{2,}/g, '/')
}

function combineAbortSignals(left: AbortSignal, right: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([left, right])
  }
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (left.aborted || right.aborted) {
    abort()
    return controller.signal
  }
  left.addEventListener('abort', abort, { once: true })
  right.addEventListener('abort', abort, { once: true })
  return controller.signal
}

function resolvePodDataSessionUrl(webId: string): string {
  const account = loadAccountSession()
  return (account?.webId === webId ? account.podUrl : undefined) || resolveLinxPodUrl(webId)
}

function requestInputToUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') {
    return input
  }
  if (input instanceof URL) {
    return input.toString()
  }
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.url
  }
  return String(input)
}
