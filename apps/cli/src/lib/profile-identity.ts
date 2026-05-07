import { extractProfileUsernameFromWebId } from '@undefineds.co/models/client'
import { resolveSolidProfileIdentityFromWebIdDocument, type SolidProfileIdentity } from '@undefineds.co/models/profile'
import { getDefaultPodDataSession, type PodDataSession } from './pod-data-session.js'

export interface ProfileIdentityRuntime {
  getPodDataSession(): Promise<PodDataSession | null>
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
  return resolveSolidProfileIdentityFromWebIdDocument(session as never, { webId })
}

const defaultRuntime: ProfileIdentityRuntime = {
  getPodDataSession: getDefaultPodDataSession,
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
  const session = await runtime.getPodDataSession()
  if (!session) {
    return null
  }

  return await withTimeout(
    readProfileDisplayName(session, runtime).catch(() => null),
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
  session: PodDataSession,
  runtime: ProfileIdentityRuntime,
): Promise<string | null> {
  const resource = await getOrCreateProfileResource(session, runtime)
  return resource.identity?.displayName ?? null
}

async function getOrCreateProfileResource(
  session: PodDataSession,
  runtime: ProfileIdentityRuntime,
): Promise<ProfileIdentityResource> {
  const cacheKey = buildProfileResourceCacheKey(session)
  const cached = runtime.getCachedResource?.(cacheKey)
  if (cached) {
    return cached
  }

  const resolveIdentity = runtime.resolveProfileIdentity ?? defaultResolveProfileIdentity
  const resource = {
    session,
    identity: await resolveIdentity(session.solidSession ?? session, session.webId),
  }
  runtime.setCachedResource?.(cacheKey, resource)
  return resource
}

function buildProfileResourceCacheKey(session: PodDataSession): string {
  return [
    session.credentials.authType,
    session.credentials.url,
    session.webId,
  ].join('\n')
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
