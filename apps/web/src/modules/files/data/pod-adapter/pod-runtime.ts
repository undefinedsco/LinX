import type { SolidDatabase } from '@undefineds.co/models'

import { normalizeContainerUri } from '../../domain/resource/resource-semantics'

type PodDialectLike = {
  getPodUrl?: () => string
  getAuthenticatedFetch?: () => typeof fetch
  listContainerResources?: (containerUrl: string) => Promise<string[]>
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
