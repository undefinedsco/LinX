import type { QueryClient, QueryKey } from '@tanstack/react-query'

export type FilesQueryInvalidationRoots = {
  roots: QueryKey
  containerEntries: QueryKey
  children: QueryKey
  entries: QueryKey
  detail: QueryKey
  accessBasics: QueryKey
  metaSidecar: QueryKey
  rawText: QueryKey
  blob: QueryKey
  structuredCellProposals: QueryKey
  sourceUpdateProposals: QueryKey
  accessPolicyProposals: QueryKey
  vocabTermProposals: QueryKey
  aiChangeProposals: QueryKey
  vocabDiscovery: QueryKey
}

export type FilesAccessBasicsInvalidationTarget = {
  uri: string
  kind: 'container' | 'resource'
}

export type FilesProposalCreateInvalidationInput = {
  proposalResourceUri?: string
  proposalQueryKey?: QueryKey
  rawTextResourceUris?: string[]
  detailResourceUris?: string[]
  accessBasicsTargets?: FilesAccessBasicsInvalidationTarget[]
  includeInbox?: boolean
}

export type FilesProposalListInvalidationInput = {
  proposalQueryKey: QueryKey
  includeInbox?: boolean
}

export type FilesSourceIngestCreateInvalidationInput = {
  targetResourceUri: string
  bodyResourceUri: string
  sourceIngestManifestUri: string
  sourceProposalResourceUri: string
  sourceProposalQueryKey: QueryKey
}

export type FilesSourceIngestRefreshInvalidationInput = {
  targetResourceUri: string
  sourceIngestManifestUri: string
  sourceProposalResourceUri?: string
  sourceProposalQueryKey?: QueryKey
}

export type FilesSourceIngestManifestInvalidationInput = {
  sourceIngestManifestUri: string
}

export type FilesVocabApprovalInvalidationInput = {
  termsResourceUri: string
  shapesResourceUri: string
  namespacesResourceUri: string
}

export async function invalidateInboxQueryRoots(cacheClient: QueryClient) {
  await Promise.all([
    cacheClient.invalidateQueries({ queryKey: ['inbox'] }),
    cacheClient.invalidateQueries({ queryKey: ['inbox', 'approvals'] }),
    cacheClient.invalidateQueries({ queryKey: ['inbox', 'audit'] }),
    cacheClient.invalidateQueries({ queryKey: ['inbox', 'notifications'] }),
    cacheClient.invalidateQueries({ queryKey: ['inbox', 'items'] }),
  ])
}

export function createFilesResourceCacheInvalidationCollection(
  queryKeys: FilesQueryInvalidationRoots,
  defaultCacheClient: QueryClient,
) {
  const resolveCacheClient = (cacheClient?: QueryClient) => cacheClient ?? defaultCacheClient
  const uniqueUris = (uris: Array<string | undefined>) => Array.from(new Set(uris.filter((uri): uri is string => !!uri)))

  async function invalidateAllProposalRoots(cacheClient?: QueryClient) {
    const client = resolveCacheClient(cacheClient)
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.structuredCellProposals }),
      client.invalidateQueries({ queryKey: queryKeys.sourceUpdateProposals }),
      client.invalidateQueries({ queryKey: queryKeys.accessPolicyProposals }),
      client.invalidateQueries({ queryKey: queryKeys.vocabTermProposals }),
      client.invalidateQueries({ queryKey: queryKeys.aiChangeProposals }),
    ])
  }

  async function invalidateAllResourceRoots(cacheClient?: QueryClient) {
    const client = resolveCacheClient(cacheClient)
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.roots }),
      client.invalidateQueries({ queryKey: queryKeys.containerEntries }),
      client.invalidateQueries({ queryKey: queryKeys.children }),
      client.invalidateQueries({
        queryKey: queryKeys.entries,
        refetchType: 'inactive',
      }),
      client.invalidateQueries({ queryKey: queryKeys.detail }),
      client.invalidateQueries({ queryKey: queryKeys.rawText }),
      client.invalidateQueries({ queryKey: queryKeys.blob }),
      client.invalidateQueries({ queryKey: queryKeys.accessBasics }),
      client.invalidateQueries({ queryKey: queryKeys.metaSidecar }),
      client.invalidateQueries({ queryKey: queryKeys.vocabDiscovery }),
    ])
  }

  async function invalidateAllFilesRoots(cacheClient?: QueryClient) {
    await Promise.all([
      invalidateAllResourceRoots(cacheClient),
      invalidateAllProposalRoots(cacheClient),
    ])
  }

  async function invalidateProposalList(
    cacheClient: QueryClient,
    input: FilesProposalListInvalidationInput,
  ) {
    const invalidations: Array<Promise<unknown>> = [
      cacheClient.invalidateQueries({ queryKey: input.proposalQueryKey }),
    ]
    if (input.includeInbox ?? true) {
      invalidations.push(invalidateInboxQueryRoots(cacheClient))
    }
    await Promise.all(invalidations)
  }

  async function invalidateProposalCreate(
    cacheClient: QueryClient,
    input: FilesProposalCreateInvalidationInput,
  ) {
    const rawTextResourceUris = uniqueUris([
      input.proposalResourceUri,
      ...(input.rawTextResourceUris ?? []),
    ])
    const detailResourceUris = uniqueUris(input.detailResourceUris ?? [])
    const invalidations: Array<Promise<unknown>> = [
      ...rawTextResourceUris.map((uri) => (
        cacheClient.invalidateQueries({ queryKey: [...queryKeys.rawText, uri] })
      )),
      ...detailResourceUris.map((uri) => (
        cacheClient.invalidateQueries({ queryKey: [...queryKeys.detail, uri] })
      )),
      ...(input.accessBasicsTargets ?? []).map((target) => (
        cacheClient.invalidateQueries({ queryKey: [...queryKeys.accessBasics, target.uri, target.kind] })
      )),
    ]

    if (input.proposalQueryKey) {
      invalidations.push(cacheClient.invalidateQueries({ queryKey: input.proposalQueryKey }))
    }

    if (input.includeInbox ?? true) {
      invalidations.push(invalidateInboxQueryRoots(cacheClient))
    }

    await Promise.all(invalidations)
  }

  async function invalidateSourceIngestCreate(
    cacheClient: QueryClient,
    input: FilesSourceIngestCreateInvalidationInput,
  ) {
    await Promise.all([
      cacheClient.invalidateQueries({ queryKey: queryKeys.entries }),
      cacheClient.invalidateQueries({ queryKey: queryKeys.containerEntries }),
      cacheClient.invalidateQueries({ queryKey: queryKeys.children }),
      cacheClient.invalidateQueries({ queryKey: [...queryKeys.detail, input.targetResourceUri] }),
      cacheClient.invalidateQueries({ queryKey: [...queryKeys.rawText, input.targetResourceUri] }),
      cacheClient.invalidateQueries({ queryKey: [...queryKeys.detail, input.bodyResourceUri] }),
      cacheClient.invalidateQueries({ queryKey: [...queryKeys.rawText, input.bodyResourceUri] }),
      cacheClient.invalidateQueries({ queryKey: [...queryKeys.rawText, input.sourceIngestManifestUri] }),
      cacheClient.invalidateQueries({ queryKey: [...queryKeys.rawText, input.sourceProposalResourceUri] }),
      cacheClient.invalidateQueries({ queryKey: input.sourceProposalQueryKey }),
      invalidateInboxQueryRoots(cacheClient),
    ])
  }

  async function invalidateSourceIngestRefresh(
    cacheClient: QueryClient,
    input: FilesSourceIngestRefreshInvalidationInput,
  ) {
    const invalidations: Array<Promise<unknown>> = [
      cacheClient.invalidateQueries({ queryKey: [...queryKeys.rawText, input.sourceIngestManifestUri] }),
      cacheClient.invalidateQueries({ queryKey: [...queryKeys.detail, input.targetResourceUri] }),
      cacheClient.invalidateQueries({ queryKey: [...queryKeys.rawText, input.targetResourceUri] }),
    ]

    if (input.sourceProposalResourceUri && input.sourceProposalQueryKey) {
      invalidations.push(
        cacheClient.invalidateQueries({ queryKey: [...queryKeys.rawText, input.sourceProposalResourceUri] }),
        cacheClient.invalidateQueries({ queryKey: input.sourceProposalQueryKey }),
        invalidateInboxQueryRoots(cacheClient),
      )
    }

    await Promise.all(invalidations)
  }

  async function invalidateSourceIngestManifest(
    cacheClient: QueryClient,
    input: FilesSourceIngestManifestInvalidationInput,
  ) {
    await cacheClient.invalidateQueries({ queryKey: [...queryKeys.rawText, input.sourceIngestManifestUri] })
  }

  async function invalidateVocabApproval(
    cacheClient: QueryClient,
    input: FilesVocabApprovalInvalidationInput,
  ) {
    await Promise.all([
      cacheClient.invalidateQueries({ queryKey: queryKeys.entries }),
      cacheClient.invalidateQueries({ queryKey: queryKeys.containerEntries }),
      cacheClient.invalidateQueries({ queryKey: queryKeys.children }),
      cacheClient.invalidateQueries({ queryKey: [...queryKeys.rawText, input.termsResourceUri] }),
      cacheClient.invalidateQueries({ queryKey: [...queryKeys.detail, input.termsResourceUri] }),
      cacheClient.invalidateQueries({ queryKey: [...queryKeys.rawText, input.shapesResourceUri] }),
      cacheClient.invalidateQueries({ queryKey: [...queryKeys.detail, input.shapesResourceUri] }),
      cacheClient.invalidateQueries({ queryKey: [...queryKeys.rawText, input.namespacesResourceUri] }),
      cacheClient.invalidateQueries({ queryKey: [...queryKeys.detail, input.namespacesResourceUri] }),
    ])
  }

  return {
    invalidateAllResourceRoots,
    invalidateAllProposalRoots,
    invalidateAllFilesRoots,
    invalidateProposalList,
    invalidateProposalCreate,
    invalidateSourceIngestCreate,
    invalidateSourceIngestRefresh,
    invalidateSourceIngestManifest,
    invalidateVocabApproval,
  }
}
