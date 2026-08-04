import type { FilesEntryScope } from '../../domain/list/entry-scope'
import type { FilesDetail } from '../../domain/resource/resource-model'

export const FILES_COLLECTION_QUERY_KEYS = {
  roots: ['files', 'roots'] as const,
  containerEntries: ['files', 'container-entries'] as const,
  children: ['files', 'children'] as const,
  entries: ['files', 'entries'] as const,
  treeSearch: ['files', 'tree-search'] as const,
  detail: ['files', 'detail'] as const,
  accessBasics: ['files', 'access-basics'] as const,
  metaSidecar: ['files', 'meta-sidecar'] as const,
  rawText: ['files', 'raw-text'] as const,
  blob: ['files', 'blob'] as const,
  structuredCellProposals: ['files', 'structured-cell-proposals'] as const,
  sourceUpdateProposals: ['files', 'source-update-proposals'] as const,
  accessPolicyProposals: ['files', 'access-policy-proposals'] as const,
  vocabTermProposals: ['files', 'vocab-term-proposals'] as const,
  aiChangeProposals: ['files', 'ai-change-proposals'] as const,
  vocabDiscovery: ['files', 'vocab-discovery'] as const,
}

export const filesResourceQueryKeys = {
  roots(workspaceUri?: string | null) {
    return [...FILES_COLLECTION_QUERY_KEYS.roots, workspaceUri ?? ''] as const
  },

  containerEntries(containerUri?: string | null) {
    return [...FILES_COLLECTION_QUERY_KEYS.containerEntries, containerUri ?? ''] as const
  },

  children(parentId?: string | null, containerUri?: string | null) {
    return [...FILES_COLLECTION_QUERY_KEYS.children, parentId ?? '', containerUri ?? ''] as const
  },

  entries(input: {
    entryScope: FilesEntryScope
    selectedTreeNodeId: string
    workspaceUri?: string | null
    containerUri?: string | null
    localPath?: string | null
    chatPodRootUri?: string | null
    chatFileFingerprint?: string | null
  }) {
    return [
      ...FILES_COLLECTION_QUERY_KEYS.entries,
      input.entryScope,
      input.selectedTreeNodeId,
      input.workspaceUri ?? '',
      input.containerUri ?? '',
      input.localPath ?? '',
      input.chatPodRootUri ?? '',
      input.chatFileFingerprint ?? '',
    ] as const
  },

  detail(resourceUri?: string | null) {
    return [...FILES_COLLECTION_QUERY_KEYS.detail, resourceUri ?? ''] as const
  },

  treeSearch(workspaceUri?: string | null) {
    return [...FILES_COLLECTION_QUERY_KEYS.treeSearch, workspaceUri ?? ''] as const
  },

  rawText(resourceUri?: string | null) {
    return [...FILES_COLLECTION_QUERY_KEYS.rawText, resourceUri ?? ''] as const
  },

  blob(resourceUri?: string | null) {
    return [...FILES_COLLECTION_QUERY_KEYS.blob, resourceUri ?? ''] as const
  },

  accessBasics(file?: Pick<FilesDetail, 'uri' | 'kind'> | null) {
    return [...FILES_COLLECTION_QUERY_KEYS.accessBasics, file?.uri ?? '', file?.kind ?? ''] as const
  },

  metaSidecar(file?: Pick<FilesDetail, 'uri' | 'kind'> | null) {
    return [...FILES_COLLECTION_QUERY_KEYS.metaSidecar, file?.uri ?? '', file?.kind ?? ''] as const
  },

  vocabDiscovery(webId?: string | null, registryClassUri?: string | null, localVocabUri?: string | null) {
    return [
      ...FILES_COLLECTION_QUERY_KEYS.vocabDiscovery,
      webId ?? '',
      registryClassUri ?? '',
      localVocabUri ?? '',
    ] as const
  },
}
