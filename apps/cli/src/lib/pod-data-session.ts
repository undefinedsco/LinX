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

export interface PodDataSession {
  credentials: StoredCredentials
  webId: string
  fetch: PodFetch
  solidSession?: Session
  close(): Promise<void>
}

export interface PodDataSessionRuntime {
  loadCredentials(): StoredCredentials | null
  getClientCredentials(credentials: StoredCredentials): ReturnType<typeof getClientCredentials>
  getOidcAccessToken(credentials: StoredCredentials): Promise<string | null>
  authenticate(clientId: string, clientSecret: string, oidcIssuer: string): Promise<{ session: Session }>
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
    const { session } = await runtime.authenticate(
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
      close: () => session.logout().catch(() => undefined),
    }
  }

  if (credentials.authType === 'oidc_oauth' && credentials.webId) {
    return {
      credentials,
      webId: credentials.webId,
      async fetch(url, init) {
        const accessToken = await runtime.getOidcAccessToken(credentials)
        if (!accessToken) {
          throw new Error('Failed to restore OIDC access token for Pod data access.')
        }
        return runtime.authenticatedFetch(url, accessToken, init)
      },
      close: async () => {},
    }
  }

  return null
}
