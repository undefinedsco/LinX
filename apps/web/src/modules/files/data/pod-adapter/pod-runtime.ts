import type { SolidDatabase } from '@undefineds.co/models'

import { normalizeContainerUri } from '../../domain/resource/resource-semantics'

type PodDialectLike = {
  getPodUrl?: () => string
  getAuthenticatedFetch?: () => typeof fetch
  listContainerResources?: (containerUrl: string) => Promise<string[]>
  sparqlExecutor?: { invalidateHttpCache?: (url?: string) => Promise<void> }
}

function getDialect(db: SolidDatabase | null | undefined): PodDialectLike | null {
  return (db as any)?.getDialect?.() ?? null
}

export function getPodRootUri(db: SolidDatabase): string {
  const podUrl = getDialect(db)?.getPodUrl?.()
  if (typeof podUrl !== 'string' || podUrl.trim().length === 0) {
    throw new Error('Pod 根路径不可用。')
  }
  return normalizeContainerUri(podUrl)
}

export function getAuthenticatedFetch(db: SolidDatabase): typeof fetch {
  const authFetch = getDialect(db)?.getAuthenticatedFetch?.()
  if (typeof authFetch !== 'function') {
    throw new Error('认证 fetch 不可用。')
  }
  return authFetch
}

export function getContainerLister(db: SolidDatabase): (containerUrl: string) => Promise<string[]> {
  const dialect = getDialect(db)
  const listContainerResources = dialect?.listContainerResources
  if (typeof listContainerResources !== 'function') {
    throw new Error('drizzle-solid 当前未暴露容器列举能力。')
  }
  return listContainerResources.bind(dialect)
}

/**
 * Container listings go through drizzle-solid's query engine, which keeps fetched documents in an
 * HTTP cache. Files writes (create, make folder, remove, move) use the authenticated fetch directly
 * and bypass it, so a listing taken right after a write would still miss the new resource.
 * drizzle-solid drops that cache itself after its own writes; this does the same after Files' raw writes.
 */
export async function invalidateContainerListingCache(db: SolidDatabase, containerUri?: string): Promise<void> {
  try {
    await getDialect(db)?.sparqlExecutor?.invalidateHttpCache?.(containerUri)
  } catch (error) {
    console.warn('[files] 容器列表缓存清理失败', error)
  }
}
