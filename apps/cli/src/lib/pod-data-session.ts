import type { Session } from '@inrupt/solid-client-authn-node'
import {
  getClientCredentialId,
  getClientCredentialKey,
  getClientCredentials,
  loadCredentials,
  type StoredCredentials,
} from './credentials-store.js'
import { getOidcAccessToken } from './oidc-auth.js'
import { authenticate, authenticatedFetch } from './solid-auth.js'
import type { PodFetch } from './pi-adapter/pod-native.js'

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
  fetch: PodFetch
  solidSession: SolidSessionLike
  getRuntimeAuthToken(): Promise<string>
  close(): Promise<void>
}

export interface PodDataSessionRuntime {
  loadCredentials(): StoredCredentials | null
  getClientCredentials(credentials: StoredCredentials): ReturnType<typeof getClientCredentials>
  getOidcAccessToken(credentials: StoredCredentials): Promise<string | null>
  authenticate(clientId: string, clientSecret: string, oidcIssuer: string): Promise<{ session: Session; apiKey: string }>
  authenticatedFetch(url: string, token: string, init?: RequestInit): Promise<Response>
}

const defaultRuntime: PodDataSessionRuntime = {
  loadCredentials,
  getClientCredentials,
  getOidcAccessToken,
  authenticate,
  authenticatedFetch,
}

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
    const { session, apiKey } = await runtime.authenticate(
      getClientCredentialId(clientCredentials),
      getClientCredentialKey(clientCredentials),
      credentials.url,
    )
    const webId = session.info.webId ?? credentials.webId
    if (!webId) {
      await session.logout().catch(() => undefined)
      throw new Error('Pod authentication succeeded without a WebID.')
    }

    return {
      credentials,
      webId,
      solidSession: session,
      fetch: (url, init) => session.fetch(url, init),
      getRuntimeAuthToken: async () => apiKey,
      close: () => session.logout().catch(() => undefined),
    }
  }

  if (credentials.authType === 'oidc_oauth' && credentials.webId) {
    const authFetch: PodFetch = async (url, init) => {
      const accessToken = await runtime.getOidcAccessToken(credentials)
      if (!accessToken) {
        throw new Error('Failed to restore OIDC access token for Pod data access.')
      }
      return runtime.authenticatedFetch(url, accessToken, init)
    }
    const solidSession = createInlineSolidSession({
      webId: credentials.webId,
      fetcher: authFetch,
      sessionId: 'linx-cli-oidc',
    })

    return {
      credentials,
      webId: credentials.webId,
      solidSession,
      fetch: authFetch,
      getRuntimeAuthToken: async () => {
        const accessToken = await runtime.getOidcAccessToken(credentials)
        if (!accessToken) {
          throw new Error('Failed to restore OIDC access token for Pod data access.')
        }
        return accessToken
      },
      close: async () => {},
    }
  }

  return null
}

function createInlineSolidSession(options: {
  webId: string
  fetcher: PodFetch
  sessionId: string
}): SolidSessionLike {
  return {
    info: {
      isLoggedIn: true,
      webId: options.webId,
      sessionId: options.sessionId,
    },
    fetch: (input, init) => options.fetcher(requestInputToUrl(input), init),
    login: async () => {},
    logout: async () => {},
    handleIncomingRedirect: async (_url: string) => {},
  }
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
