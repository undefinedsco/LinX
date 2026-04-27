import {
  getClientCredentials,
  loadCredentials,
  type StoredCredentials,
} from './credentials-store.js'
import { extractProfileUsernameFromWebId } from '@undefineds.co/models/client'
import { resolveSolidProfileIdentity, type SolidProfileIdentity } from '@undefineds.co/models/profile'
import { getOidcAccessToken } from './oidc-auth.js'
import { authenticate } from './solid-auth.js'

export interface ProfileIdentityRuntime {
  loadCredentials(): StoredCredentials | null
  getClientCredentials(credentials: StoredCredentials): ReturnType<typeof getClientCredentials>
  getOidcAccessToken(credentials: StoredCredentials): Promise<string | null>
  authenticate(clientId: string, clientSecret: string, oidcIssuer: string): Promise<{ session: unknown }>
  resolveProfileIdentity?(session: unknown, webId: string): Promise<SolidProfileIdentity | null>
  getCachedResource?(key: string): ProfileIdentityResource | null
  setCachedResource?(key: string, resource: ProfileIdentityResource): void
}

export interface ProfileIdentityResource {
  session: unknown
  identity: SolidProfileIdentity | null
}

const resourceCache = new Map<string, ProfileIdentityResource>()

const defaultResolveProfileIdentity = (session: unknown, webId: string): Promise<SolidProfileIdentity | null> => {
  return resolveSolidProfileIdentity(session as never, { webId })
}

const defaultRuntime: ProfileIdentityRuntime = {
  loadCredentials,
  getClientCredentials,
  getOidcAccessToken,
  authenticate,
  resolveProfileIdentity: defaultResolveProfileIdentity,
  getCachedResource(key) {
    return resourceCache.get(key) ?? null
  },
  setCachedResource(key, resource) {
    resourceCache.set(key, resource)
  },
}

export async function resolveProfileDisplayName(options: {
  runtime?: ProfileIdentityRuntime
  timeoutMs?: number
} = {}): Promise<string | null> {
  const runtime = options.runtime ?? defaultRuntime
  const credentials = runtime.loadCredentials()
  if (!credentials) {
    return null
  }

  return await withTimeout(
    readProfileDisplayName(credentials, runtime).catch(() => null),
    options.timeoutMs ?? 5_000,
  )
}

export function extractUsernameFromWebId(webId: string): string {
  return extractProfileUsernameFromWebId(webId)
}

export function clearProfileIdentityResourceCache(): void {
  resourceCache.clear()
}

async function readProfileDisplayName(
  credentials: StoredCredentials,
  runtime: ProfileIdentityRuntime,
): Promise<string | null> {
  const resource = await getOrCreateProfileResource(credentials, runtime)
  return resource.identity?.displayName ?? null
}

async function getOrCreateProfileResource(
  credentials: StoredCredentials,
  runtime: ProfileIdentityRuntime,
): Promise<ProfileIdentityResource> {
  const cacheKey = buildProfileResourceCacheKey(credentials)
  const cached = runtime.getCachedResource?.(cacheKey)
  if (cached) {
    return cached
  }

  const session = await createProfileSession(credentials, runtime)
  const resolveIdentity = runtime.resolveProfileIdentity ?? defaultResolveProfileIdentity
  const resource = {
    session,
    identity: await resolveIdentity(session, credentials.webId),
  }
  runtime.setCachedResource?.(cacheKey, resource)
  return resource
}

async function createProfileSession(
  credentials: StoredCredentials,
  runtime: ProfileIdentityRuntime,
): Promise<unknown> {
  const clientCredentials = runtime.getClientCredentials(credentials)
  if (clientCredentials) {
    const { session } = await runtime.authenticate(
      clientCredentials.clientId,
      clientCredentials.clientSecret,
      credentials.url,
    )
    return session
  }

  if (credentials.authType === 'oidc_oauth') {
    const accessToken = await runtime.getOidcAccessToken(credentials)
    if (!accessToken) {
      throw new Error('Failed to restore OIDC access token for profile lookup')
    }
    return createOidcSessionLike(credentials, accessToken)
  }

  throw new Error('Unsupported credential type for profile lookup')
}

function buildProfileResourceCacheKey(credentials: StoredCredentials): string {
  const clientCredentials = getClientCredentials(credentials)
  const secretVersion = clientCredentials
    ? clientCredentials.clientId
    : 'oidcRefreshToken' in credentials.secrets
      ? credentials.secrets.oidcRefreshToken
      : ''
  return [
    credentials.authType,
    credentials.url,
    credentials.webId,
    secretVersion,
  ].join('\n')
}

function createOidcSessionLike(credentials: StoredCredentials, accessToken: string): unknown {
  const podUrl = credentials.webId.replace('/card#me', '').replace(/\/?$/, '/')
  return {
    info: {
      isLoggedIn: true,
      webId: credentials.webId,
      podUrl,
    },
    async logout(): Promise<void> {},
    fetch(url: string, init?: RequestInit): Promise<Response> {
      const headers = new Headers(init?.headers)
      headers.set('Authorization', `Bearer ${accessToken}`)
      return fetch(url, { ...init, headers })
    },
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs)
    timer.unref?.()
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}
