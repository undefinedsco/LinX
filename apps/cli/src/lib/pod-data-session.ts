import type { Session } from '@inrupt/solid-client-authn-node'
import { resolveLinxPodUrl } from '@undefineds.co/models/client'
import { loadAccountSession } from './account-session.js'
import {
  getClientCredentialId,
  getClientCredentialKey,
  getClientCredentials,
  loadCredentials,
  type StoredCredentials,
} from './credentials-store.js'
import { getOidcAccessToken, restoreStoredOidcSession } from './oidc-auth.js'
import { authenticate, authenticatedFetch } from './solid-auth.js'

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
  getRuntimeAuthToken(): Promise<string>
  close(): Promise<void>
}

export interface PodDataSessionRuntime {
  loadCredentials(): StoredCredentials | null
  getClientCredentials(credentials: StoredCredentials): ReturnType<typeof getClientCredentials>
  getOidcAccessToken(credentials: StoredCredentials): Promise<string | null>
  restoreStoredOidcSession(credentials: StoredCredentials, options?: { forceRefresh?: boolean }): Promise<Session | null>
  authenticate(clientId: string, clientSecret: string, oidcIssuer: string): Promise<{ session: Session; apiKey: string }>
  authenticatedFetch(url: string, token: string, init?: RequestInit): Promise<Response>
  authTimeoutMs?: number
  fetchTimeoutMs?: number
}

const defaultRuntime: PodDataSessionRuntime = {
  loadCredentials,
  getClientCredentials,
  getOidcAccessToken,
  restoreStoredOidcSession,
  authenticate,
  authenticatedFetch,
}

const DEFAULT_POD_DATA_AUTH_TIMEOUT_MS = 15_000
const DEFAULT_POD_DATA_FETCH_TIMEOUT_MS = 30_000

let defaultSessionPromise: Promise<PodDataSession | null> | null = null

export function clearDefaultPodDataSession(): void {
  const existing = defaultSessionPromise
  defaultSessionPromise = null
  void existing?.then((session) => session?.close()).catch(() => undefined)
}

export async function getDefaultPodDataSession(): Promise<PodDataSession | null> {
  if (!defaultSessionPromise) {
    defaultSessionPromise = createPodDataSession(defaultRuntime)
      .then((session) => {
        if (!session) {
          defaultSessionPromise = null
        }
        return session
      })
      .catch((error) => {
        defaultSessionPromise = null
        throw error
      })
  }

  return defaultSessionPromise
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
    const { session, apiKey } = await withTimeout(
      runtime.authenticate(
        getClientCredentialId(clientCredentials),
        getClientCredentialKey(clientCredentials),
        credentials.url,
      ),
      runtime.authTimeoutMs ?? DEFAULT_POD_DATA_AUTH_TIMEOUT_MS,
      'LinX Pod client credentials authentication timed out.',
    )
    const webId = session.info.webId ?? credentials.webId
    if (!webId) {
      await session.logout().catch(() => undefined)
      throw new Error('Pod authentication succeeded without a WebID.')
    }
    const podUrl = resolvePodDataSessionUrl(webId)

    const fetchWithTimeout: PodFetch = (url, init) => withFetchTimeout(
      (requestUrl, requestInit) => session.fetch(requestUrl, requestInit),
      url,
      init,
      runtime.fetchTimeoutMs ?? DEFAULT_POD_DATA_FETCH_TIMEOUT_MS,
    )

    return {
      credentials,
      webId,
      podUrl,
      solidSession: createSessionLikeFromSolidSession(session, fetchWithTimeout, podUrl),
      fetch: fetchWithTimeout,
      getRuntimeAuthToken: async () => apiKey,
      close: () => session.logout().catch(() => undefined),
    }
  }

  if (credentials.authType === 'oidc_oauth' && credentials.webId) {
    const podUrl = resolvePodDataSessionUrl(credentials.webId)
    const webId = credentials.webId

    const fetchWithTimeout: PodFetch = async (url, init) => {
      const accessToken = await withTimeout(
        runtime.getOidcAccessToken(credentials),
        runtime.authTimeoutMs ?? DEFAULT_POD_DATA_AUTH_TIMEOUT_MS,
        'LinX Pod OIDC token refresh timed out.',
      )
      if (!accessToken) {
        throw new Error('Failed to restore OIDC access token for Pod data access. Run `linx login` again.')
      }

      return withFetchTimeout(
        (requestUrl, requestInit) => runtime.authenticatedFetch(requestUrl, accessToken, requestInit),
        url,
        init,
        runtime.fetchTimeoutMs ?? DEFAULT_POD_DATA_FETCH_TIMEOUT_MS,
      )
    }

    return {
      credentials,
      webId,
      podUrl,
      solidSession: createTokenBackedSessionLike(webId, fetchWithTimeout, podUrl),
      fetch: fetchWithTimeout,
      getRuntimeAuthToken: async () => {
        const accessToken = await withTimeout(
          runtime.getOidcAccessToken(credentials),
          runtime.authTimeoutMs ?? DEFAULT_POD_DATA_AUTH_TIMEOUT_MS,
          'LinX Pod OIDC token refresh timed out.',
        )
        if (!accessToken) {
          throw new Error('Failed to restore OIDC access token for Pod data access.')
        }
        return accessToken
      },
      // OIDC browser-login storage is the user's LinX login state. Data access
      // uses per-request Bearer fetches, so close has no storage or timer work.
      close: async () => {},
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

function createTokenBackedSessionLike(webId: string, fetcher: PodFetch, podUrl: string): SolidSessionLike {
  return {
    info: {
      isLoggedIn: true,
      webId,
      podUrl,
    },
    fetch: (input, init) => fetcher(requestInputToUrl(input), init),
    logout: async () => {},
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
  timeoutMs: number,
): Promise<Response> {
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
