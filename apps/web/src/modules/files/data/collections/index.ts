import type { SolidDatabase } from '@undefineds.co/models'
import { queryClient } from '@/providers/query-provider'
import { createConfirmedEntryTransferOverlayStore } from '../cache/entry-transfer-overlays'
import {
  createFilesEntryCacheCollection,
} from '../cache/files-entry-cache'
import {
  createFilesResourceCacheInvalidationCollection,
} from '../cache/files-query-invalidation'
import {
  createSourceIngestCacheCollections,
} from '../cache/source-ingest-cache'
import {
  createStructuredViewMetadataCacheCollection,
} from '../cache/structured-view-metadata-cache'
import { fetchFilesInboxApprovals } from './inbox-approval-source'
import { createProposalCollections } from './proposal-collections'
import { createResourceCollection } from './resource-collection'
import { createResourceMutationCollection } from './resource-mutation-collection'
import {
  createResourceQueryCollection,
} from './resource-query-collection'
import { FILES_COLLECTION_QUERY_KEYS, filesResourceQueryKeys } from './query-keys'
import { createFilesDatabaseRuntime } from './runtime'
import { createSidecarMutationCollection } from './sidecar-mutation-collection'
import { createSidecarQueryCollection } from './sidecar-query-collection'
import { createSourceIngestCollection } from './source-ingest-collection'
import { createFilesSubscriptionCollection } from './subscription-collection'
import {
  createVocabDiscoveryCollections,
} from './vocab-discovery-collection'
export {
  FILES_VOCAB_REGISTRY_CLASS_URI,
  type FilesVocabDiscoveryResult,
} from './vocab-discovery-collection'
export {
  FILES_COLLECTION_QUERY_KEYS,
  filesResourceQueryKeys,
} from './query-keys'
export type {
  FilesChatMessageProjectionInput,
  FilesEntryListInput,
  FilesResourceQueryOptions,
  FilesSelectedLocation,
} from './resource-query-collection'

export {
  type FilesEntryCacheSnapshot,
} from '../cache/files-entry-cache'

export {
  createFilesProposalWithCache,
  createScopedFilesProposalCacheCollection,
  filesProposalCacheCollection,
  type FilesProposalCacheSnapshot,
} from '../cache/proposal-query-cache'

export {
  type SourceIngestCreateCacheSnapshot,
  type SourceIngestRefreshCacheSnapshot,
} from '../cache/source-ingest-cache'

export {
  type FilesStructuredViewMetadataCacheSnapshot,
} from '../cache/structured-view-metadata-cache'

const filesDatabaseRuntime = createFilesDatabaseRuntime()

export const setFilesDatabaseGetter = filesDatabaseRuntime.setFilesDatabaseGetter
const getDb = filesDatabaseRuntime.getDb

const confirmedEntryTransferOverlays = createConfirmedEntryTransferOverlayStore()

const filesEntryCacheCollection = createFilesEntryCacheCollection(
  FILES_COLLECTION_QUERY_KEYS,
  confirmedEntryTransferOverlays,
)

export { filesEntryCacheCollection }

export const filesResourceCacheInvalidationCollection =
  createFilesResourceCacheInvalidationCollection(FILES_COLLECTION_QUERY_KEYS, queryClient)

const {
  structuredCellProposalCollection,
  structuredCellProposalCacheCollection,
  vocabTermProposalCollection,
  accessPolicyProposalCollection,
  sourceUpdateProposalCollection,
  filesProposalQueryCollection,
  aiChangeProposalCollection,
} = createProposalCollections({
  getDb,
  queryClient,
  queryKeys: FILES_COLLECTION_QUERY_KEYS,
  filesResourceCacheInvalidationCollection,
  fetchApprovals: fetchFilesInboxApprovals,
})

export {
  structuredCellProposalCollection,
  structuredCellProposalCacheCollection,
  vocabTermProposalCollection,
  accessPolicyProposalCollection,
  sourceUpdateProposalCollection,
  filesProposalQueryCollection,
  aiChangeProposalCollection,
}

const {
  sourceIngestManifestCacheCollection,
  sourceIngestCreateCacheCollection,
  sourceIngestRefreshCacheCollection,
} = createSourceIngestCacheCollections({
  rawTextQueryRoot: FILES_COLLECTION_QUERY_KEYS.rawText,
  filesEntryCacheCollection,
  sourceProposalQueryKey: (documentUri) => sourceUpdateProposalCollection.queryKey(documentUri),
})

const filesStructuredViewMetadataCacheCollection = createStructuredViewMetadataCacheCollection({
  structuredViewMetadata: FILES_COLLECTION_QUERY_KEYS.structuredViewMetadata,
  metaSidecar: FILES_COLLECTION_QUERY_KEYS.metaSidecar,
})

export { filesStructuredViewMetadataCacheCollection }

const filesResourceCollection = createResourceCollection({
  getDb,
  confirmedEntryTransferOverlays,
})

export { filesResourceCollection }

const filesResourceQueryCollection = createResourceQueryCollection({
  filesResourceCollection,
  filesResourceQueryKeys,
})

export { filesResourceQueryCollection }

const filesSidecarQueryCollection = createSidecarQueryCollection({
  filesResourceQueryKeys,
})

export { filesSidecarQueryCollection }

const filesResourceMutationCollection = createResourceMutationCollection({
  rawTextQueryRoot: FILES_COLLECTION_QUERY_KEYS.rawText,
  filesResourceCollection,
  filesEntryCacheCollection,
})

export { filesResourceMutationCollection }

const filesSidecarMutationCollection = createSidecarMutationCollection({
  filesStructuredViewMetadataCacheCollection,
})

export { filesSidecarMutationCollection }

const {
  filesVocabDiscoveryCollection,
  filesVocabDiscoveryQueryCollection,
} = createVocabDiscoveryCollections({
  resolveCurrentPodRootUri: filesResourceCollection.resolveCurrentPodRootUri,
  vocabDiscoveryQueryKey: filesResourceQueryKeys.vocabDiscovery,
})

export {
  filesVocabDiscoveryCollection,
  filesVocabDiscoveryQueryCollection,
}

export const sourceIngestCollection = createSourceIngestCollection({
  getDb,
  resolveCurrentPodRootUri: filesResourceCollection.resolveCurrentPodRootUri,
  sourceUpdateProposalQueryKey: (documentUri) => sourceUpdateProposalCollection.queryKey(documentUri),
  filesResourceCacheInvalidationCollection,
  sourceIngestManifestCacheCollection,
  sourceIngestCreateCacheCollection,
  sourceIngestRefreshCacheCollection,
})

export function initializeFilesCollections(db: SolidDatabase | null) {
  confirmedEntryTransferOverlays.clear()
  setFilesDatabaseGetter(() => db)
}

export const filesOps = createFilesSubscriptionCollection({
  getDb,
  filesResourceCacheInvalidationCollection,
})
