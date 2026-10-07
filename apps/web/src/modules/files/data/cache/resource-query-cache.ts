import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { FilesEntry, FilesRawTextResource } from '../../domain/resource/resource-model'

export function restoreQuerySnapshot<T>(
  cacheClient: QueryClient,
  snapshot?: Array<[QueryKey, T | undefined]>,
) {
  for (const [queryKey, value] of snapshot ?? []) {
    if (value === undefined) {
      cacheClient.removeQueries({ queryKey, exact: true })
      continue
    }
    cacheClient.setQueryData(queryKey, value)
  }
}

export function setCachedEntryLists(
  cacheClient: QueryClient,
  entriesQueryRoot: QueryKey,
  updater: (current: FilesEntry[]) => FilesEntry[],
) {
  cacheClient.setQueriesData<FilesEntry[]>({ queryKey: entriesQueryRoot }, (current) => {
    if (!current) return current
    return updater(current)
  })
}

export function rawTextQueryKey(rawTextQueryRoot: QueryKey, resourceUri: string): QueryKey {
  return [...rawTextQueryRoot, resourceUri]
}

export function rawTextCacheSnapshot(
  cacheClient: QueryClient,
  rawTextQueryRoot: QueryKey,
  resourceUri: string,
): Array<[QueryKey, FilesRawTextResource | undefined]> {
  const queryKey = rawTextQueryKey(rawTextQueryRoot, resourceUri)
  return [[
    queryKey,
    cacheClient.getQueryData<FilesRawTextResource>(queryKey),
  ]]
}

export function writeRawTextCache(
  cacheClient: QueryClient,
  rawTextQueryRoot: QueryKey,
  input: {
    uri: string
    mimeType: string
    content: string
    etag?: string | null
    headers?: Record<string, string>
  },
) {
  const queryKey = rawTextQueryKey(rawTextQueryRoot, input.uri)
  const current = cacheClient.getQueryData<FilesRawTextResource>(queryKey)
  cacheClient.setQueryData<FilesRawTextResource>(queryKey, {
    uri: input.uri,
    mimeType: input.mimeType,
    etag: input.etag ?? current?.etag ?? null,
    headers: input.headers ?? current?.headers ?? {},
    content: input.content,
  })
}

export type FilesRawTextCreateEntryCacheCollection<TEntrySnapshot> = {
  stageResourceCreate(
    cacheClient: QueryClient,
    input: {
      uri: string
      kind: FilesEntry['kind']
      mimeType: string | null
      size?: number | null
      parentUri?: string | null
      podRootUri?: string | null
    },
  ): Promise<TEntrySnapshot>
  commitResourceCreate(
    cacheClient: QueryClient,
    input: {
      uri: string
      kind: FilesEntry['kind']
      mimeType: string | null
      size?: number | null
      parentUri?: string | null
      podRootUri?: string | null
    },
  ): void
  restore(cacheClient: QueryClient, snapshot?: TEntrySnapshot): void
  invalidateResourceCreate(
    cacheClient: QueryClient,
    resourceUri: string,
    options?: { includeRawText?: boolean },
  ): Promise<void>
}

export async function createRawTextResourceWithCache<TEntrySnapshot>(input: {
  cacheClient: QueryClient
  rawTextQueryRoot: QueryKey
  entryCacheCollection: FilesRawTextCreateEntryCacheCollection<TEntrySnapshot>
  podRootUri?: string | null
  resource: Pick<FilesRawTextResource, 'uri' | 'mimeType'>
  content: string
  create: () => Promise<FilesRawTextResource>
}): Promise<FilesRawTextResource> {
  await input.cacheClient.cancelQueries({
    queryKey: rawTextQueryKey(input.rawTextQueryRoot, input.resource.uri),
  })
  const entriesSnapshot = await input.entryCacheCollection.stageResourceCreate(input.cacheClient, {
    uri: input.resource.uri,
    kind: 'resource',
    mimeType: input.resource.mimeType,
    podRootUri: input.podRootUri,
    size: input.content.length,
  })
  const rawTextSnapshot = rawTextCacheSnapshot(
    input.cacheClient,
    input.rawTextQueryRoot,
    input.resource.uri,
  )
  writeRawTextCache(input.cacheClient, input.rawTextQueryRoot, {
    uri: input.resource.uri,
    mimeType: input.resource.mimeType,
    content: input.content,
  })

  try {
    const created = await input.create()
    input.entryCacheCollection.commitResourceCreate(input.cacheClient, {
      uri: created.uri,
      kind: 'resource',
      mimeType: created.mimeType,
      podRootUri: input.podRootUri,
      size: created.content.length || input.content.length,
    })
    writeRawTextCache(input.cacheClient, input.rawTextQueryRoot, created)
    return created
  } catch (error) {
    input.entryCacheCollection.restore(input.cacheClient, entriesSnapshot)
    restoreQuerySnapshot(input.cacheClient, rawTextSnapshot)
    throw error
  } finally {
    await input.entryCacheCollection.invalidateResourceCreate(
      input.cacheClient,
      input.resource.uri,
      { includeRawText: true },
    )
  }
}
