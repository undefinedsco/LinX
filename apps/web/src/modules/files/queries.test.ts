import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAiChangeProposal } from './ai-change-approval'
import { createAccessPolicyProposal, renderAccessPolicyProposalTurtle } from './access-approval'
import {
  resolveSelectedFilesNode,
  useCopyFileResource,
  useCreateBlobResource,
  useCreateAiChangeProposal,
  useCreateFolderResource,
  useCreateRawTextResource,
  useCreateSourceUpdateProposal,
  useCreateVocabTermProposalInboxApproval,
  useCreateAccessPolicyProposal,
  useDeleteFileResource,
  useCreateSourceIngest,
  useCreateStructuredCellChangeProposal,
  useFilesEntries,
  useMarkSourceIngestRangeIngested,
  useMoveFileResource,
  usePendingAccessPolicyProposals,
  usePendingVocabTermProposals,
  usePendingSourceUpdateProposals,
  usePendingStructuredCellChangeProposals,
  useRefreshSourceLinkedCard,
  useRequestSourceIngestRange,
  useSaveRawTextResource,
  useFilesVocabRegistryDiscovery,
} from './queries'
import { createContainerNodeId, type FilesEntry, type FilesRootData } from './browser'
import {
  createSourceIndexManifest,
  createSourceIngestManifest,
  renderSourceIndexManifestTurtle,
  renderSourceIngestManifestTurtle,
} from './domain/source/source-ingest-manifest'
import { createSourceUpdateProposal, renderSourceUpdateProposalTurtle } from './source-approval'
import { createStructuredCellChangeProposal } from './structured-cell-approval'
import { createVocabTermProposal, renderVocabTermProposalTurtle } from './structured-table'
import { createSourceIngestPlan } from './domain/source/source-ingest'

const mocks = vi.hoisted(() => ({
  chatState: {
    selectedChatId: 'chat-1',
    selectedThreadId: 'thread-1',
  },
  threads: [
    {
      id: 'thread-1',
      title: 'Current thread',
      workspace: 'https://pod.example/public/',
    },
  ],
  messages: [
    {
      id: 'message-1',
      createdAt: '2026-06-18T08:00:00.000Z',
      richContent: JSON.stringify({
        items: [
          {
            type: 'file',
            fileName: 'chat-report.md',
            fileUrl: 'https://pod.example/public/chat-report.md',
            fileSize: 32,
            mimeType: 'text/markdown',
          },
        ],
      }),
    },
  ],
  createRawTextResource: vi.fn(),
  createBlobResource: vi.fn(),
  readRawTextResource: vi.fn(),
  saveRawTextResource: vi.fn(),
  buildRootNodes: vi.fn(),
  copyFileResource: vi.fn(),
  deleteFileResource: vi.fn(),
  createFolderResource: vi.fn(),
  listAllBrowsableEntries: vi.fn(),
  listContainerEntries: vi.fn(),
  moveFileResource: vi.fn(),
  createAiChangeProposalInboxApproval: vi.fn(),
  createSourceUpdateProposalInboxApproval: vi.fn(),
  filesBuildRoots: vi.fn(),
  filesResolveCurrentPodRootUri: vi.fn(),
  filesListChildTreeNodes: vi.fn(),
  filesListEntries: vi.fn(),
  filesListAllEntries: vi.fn(),
  filesListContainerEntries: vi.fn(),
  filesReadDetail: vi.fn(),
  filesReadRawText: vi.fn(),
  filesReadBlob: vi.fn(),
  filesReadAccessBasics: vi.fn(),
  filesReadMetaSidecar: vi.fn(),
  filesResourceQueryResolveCurrentPodRootUri: vi.fn(),
  filesResourceQueryRoots: vi.fn(),
  filesResourceQueryChildren: vi.fn(),
  filesResourceQueryContainerEntries: vi.fn(),
  filesResourceQueryEntries: vi.fn(),
  filesResourceQueryDetail: vi.fn(),
  filesResourceQueryRawText: vi.fn(),
  filesResourceQueryBlob: vi.fn(),
  filesSidecarQueryAccessBasics: vi.fn(),
  filesSidecarQueryMetaSidecar: vi.fn(),
  filesSaveRawText: vi.fn(),
  filesCreateRawText: vi.fn(),
  filesCreateBlob: vi.fn(),
  filesCopy: vi.fn(),
  filesMove: vi.fn(),
  filesDelete: vi.fn(),
  filesCreateFolder: vi.fn(),
  filesGetParentContainerUri: vi.fn(),
  fetchApprovals: vi.fn(),
  sessionFetch: vi.fn(),
  createSolidTypeIndexResourceTextReader: vi.fn(),
  discoverSolidTypeIndexRegistrationsFromWebId: vi.fn(),
  filesVocabResolveLocalVocabUri: vi.fn(),
  filesVocabDiscoveryQueryKey: vi.fn(),
  filesVocabDiscoveryDiscover: vi.fn(),
  filesVocabDiscoveryQueryResolveLocalVocabUri: vi.fn(),
  filesVocabDiscoveryQueryDiscovery: vi.fn(),
  filesProposalQueryPendingStructuredCellChanges: vi.fn(),
  filesProposalQueryPendingVocabTerms: vi.fn(),
  filesProposalQueryPendingSourceUpdates: vi.fn(),
  filesProposalQueryPendingAccessPolicies: vi.fn(),
  structuredCellProposalFetchByDocument: vi.fn(),
  structuredCellProposalCreate: vi.fn(),
  structuredCellProposalQueryKey: vi.fn((documentUri: string) => ['files', 'structured-cell-proposals', documentUri] as const),
  structuredCellProposalInvalidate: vi.fn(),
  structuredCellProposalInvalidateCreate: vi.fn(),
  structuredCellProposalCacheStageCreate: vi.fn(),
  structuredCellProposalCacheStage: vi.fn(),
  structuredCellProposalCacheRestore: vi.fn(),
  vocabTermProposalFetchByDocument: vi.fn(),
  vocabTermProposalCreate: vi.fn(),
  vocabTermProposalApprove: vi.fn(),
  vocabTermProposalInvalidateApproval: vi.fn(),
  vocabTermProposalInvalidateCreate: vi.fn(),
  vocabTermProposalQueryKey: vi.fn((documentUri: string) => ['files', 'vocab-term-proposals', documentUri] as const),
  accessPolicyProposalFetchByOwner: vi.fn(),
  accessPolicyProposalCreate: vi.fn(),
  accessPolicyProposalInvalidateCreate: vi.fn(),
  accessPolicyProposalQueryKey: vi.fn((ownerUri: string) => ['files', 'access-policy-proposals', ownerUri] as const),
  sourceUpdateProposalFetchByDocument: vi.fn(),
  sourceUpdateProposalCreate: vi.fn(),
  sourceUpdateProposalInvalidateCreate: vi.fn(),
  sourceUpdateProposalQueryKey: vi.fn((documentUri: string) => ['files', 'source-update-proposals', documentUri] as const),
  sourceIngestCreate: vi.fn(),
  sourceIngestRefresh: vi.fn(),
  sourceIngestRequestRange: vi.fn(),
  sourceIngestMarkRangeIngested: vi.fn(),
  sourceIngestInvalidateCreate: vi.fn(),
  sourceIngestInvalidateRefresh: vi.fn(),
  sourceIngestInvalidateManifest: vi.fn(),
  aiChangeProposalCreate: vi.fn(),
  aiChangeProposalInvalidateCreate: vi.fn(),
  webId: 'https://pod.example/profile#me' as string | null,
}))

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => ({ db: { id: 'db' } }),
}))

vi.mock('@/providers/solid-session-context', () => ({
  useSession: () => ({
    session: {
      info: { webId: mocks.webId },
      fetch: mocks.sessionFetch,
    },
  }),
}))

vi.mock('@/modules/chat/store', () => ({
  useChatStore: (selector: (state: { selectedChatId: string | null; selectedThreadId: string | null }) => unknown) => selector(mocks.chatState),
}))

vi.mock('@/modules/chat/collections', () => ({
  useThreadList: () => ({
    data: mocks.threads,
  }),
  useMessageList: () => ({
    data: mocks.messages,
    isSuccess: true,
  }),
}))

vi.mock('./data/pod-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/pod-adapter')>()
  return {
    ...actual,
    buildRootNodes: mocks.buildRootNodes,
    copyFileResource: mocks.copyFileResource,
    createBlobResource: mocks.createBlobResource,
    deleteFileResource: mocks.deleteFileResource,
    createFolderResource: mocks.createFolderResource,
    listAllBrowsableEntries: mocks.listAllBrowsableEntries,
    listContainerEntries: mocks.listContainerEntries,
    moveFileResource: mocks.moveFileResource,
    createRawTextResource: mocks.createRawTextResource,
    readRawTextResource: mocks.readRawTextResource,
    saveRawTextResource: mocks.saveRawTextResource,
  }
})

vi.mock('./data/proposal/source-approval-commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/proposal/source-approval-commands')>()
  return {
    ...actual,
    createSourceUpdateProposalInboxApproval: mocks.createSourceUpdateProposalInboxApproval,
  }
})

vi.mock('./data/proposal/ai-change-approval-commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/proposal/ai-change-approval-commands')>()
  return {
    ...actual,
    createAiChangeProposalInboxApproval: mocks.createAiChangeProposalInboxApproval,
  }
})

vi.mock('@/modules/inbox/collections', () => ({
  inboxOps: {
    fetchApprovals: mocks.fetchApprovals,
  },
}))

vi.mock('./data/collections', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/collections')>()
  mocks.sourceIngestCreate.mockImplementation(actual.sourceIngestCollection.create)
  mocks.sourceIngestRefresh.mockImplementation(actual.sourceIngestCollection.refresh)
  mocks.sourceIngestRequestRange.mockImplementation(actual.sourceIngestCollection.requestRange)
  mocks.sourceIngestMarkRangeIngested.mockImplementation(actual.sourceIngestCollection.markRangeIngested)
  const filesResourceMutationCollection = {
    async saveRawText(input: {
      cacheClient: QueryClient
      db?: unknown
      resource: Parameters<typeof mocks.filesSaveRawText>[0]
      content: string
    }) {
      const snapshot = await actual.filesEntryCacheCollection.stageRawTextSave(input.cacheClient, {
        resource: input.resource,
        content: input.content,
      })
      try {
        const resource = await mocks.filesSaveRawText(input.resource, input.content, input.db)
        actual.filesEntryCacheCollection.commitRawTextSave(input.cacheClient, resource)
        await actual.filesEntryCacheCollection.invalidateRawTextResource(input.cacheClient, resource.uri)
        return resource
      } catch (error) {
        actual.filesEntryCacheCollection.restore(input.cacheClient, snapshot)
        throw error
      }
    },

    async createRawText(input: {
      cacheClient: QueryClient
      db?: unknown
      resource: Parameters<typeof mocks.filesCreateRawText>[0]
      content: string
    }) {
      const podRootUri = mocks.filesResolveCurrentPodRootUri(input.db)
      const snapshot = await actual.filesEntryCacheCollection.stageResourceCreate(input.cacheClient, {
        uri: input.resource.uri,
        kind: 'resource',
        mimeType: input.resource.mimeType,
        podRootUri,
        size: input.content.length,
      })
      try {
        const resource = await mocks.filesCreateRawText(input.resource, input.content, input.db)
        actual.filesEntryCacheCollection.commitResourceCreate(input.cacheClient, {
          uri: resource.uri,
          kind: 'resource',
          mimeType: resource.mimeType,
          podRootUri,
          size: resource.content.length || input.content.length,
        })
        return resource
      } catch (error) {
        actual.filesEntryCacheCollection.restore(input.cacheClient, snapshot)
        throw error
      } finally {
        await actual.filesEntryCacheCollection.invalidateResourceCreate(input.cacheClient, input.resource.uri, {
          includeRawText: true,
        })
      }
    },

    async createBlob(input: {
      cacheClient: QueryClient
      db?: unknown
      resource: Parameters<typeof mocks.filesCreateBlob>[0]
      content: Blob
    }) {
      const podRootUri = mocks.filesResolveCurrentPodRootUri(input.db)
      const snapshot = await actual.filesEntryCacheCollection.stageResourceCreate(input.cacheClient, {
        uri: input.resource.uri,
        kind: 'resource',
        mimeType: input.resource.mimeType,
        podRootUri,
        size: input.content.size,
      })
      try {
        const resource = await mocks.filesCreateBlob(input.resource, input.content, input.db)
        actual.filesEntryCacheCollection.commitResourceCreate(input.cacheClient, {
          uri: resource.uri,
          kind: 'resource',
          mimeType: resource.mimeType,
          podRootUri,
          size: resource.size,
        })
        return resource
      } catch (error) {
        actual.filesEntryCacheCollection.restore(input.cacheClient, snapshot)
        throw error
      } finally {
        await actual.filesEntryCacheCollection.invalidateResourceCreate(input.cacheClient, input.resource.uri)
      }
    },

    async copy(input: {
      cacheClient: QueryClient
      db?: unknown
      transfer: Parameters<typeof mocks.filesCopy>[0]
    }) {
      const snapshot = await actual.filesEntryCacheCollection.stageTransfer(input.cacheClient, input.transfer, 'copy')
      try {
        const resource = await mocks.filesCopy(input.transfer, input.db)
        actual.filesEntryCacheCollection.commitTransfer(input.cacheClient, resource, input.transfer, 'copy')
        return resource
      } catch (error) {
        actual.filesEntryCacheCollection.restore(input.cacheClient, snapshot)
        throw error
      } finally {
        await actual.filesEntryCacheCollection.invalidateTransfer(input.cacheClient, input.transfer)
      }
    },

    async move(input: {
      cacheClient: QueryClient
      db?: unknown
      transfer: Parameters<typeof mocks.filesMove>[0]
    }) {
      const snapshot = await actual.filesEntryCacheCollection.stageTransfer(input.cacheClient, input.transfer, 'move')
      try {
        const resource = await mocks.filesMove(input.transfer, input.db)
        actual.filesEntryCacheCollection.commitTransfer(input.cacheClient, resource, input.transfer, 'move')
        return resource
      } catch (error) {
        actual.filesEntryCacheCollection.restore(input.cacheClient, snapshot)
        throw error
      } finally {
        await actual.filesEntryCacheCollection.invalidateTransfer(input.cacheClient, input.transfer)
      }
    },

    async delete(input: {
      cacheClient: QueryClient
      db?: unknown
      resourceUri: string
    }) {
      const snapshot = await actual.filesEntryCacheCollection.stageDelete(input.cacheClient, input.resourceUri)
      try {
        await mocks.filesDelete(input.resourceUri, input.db)
        return input.resourceUri
      } catch (error) {
        actual.filesEntryCacheCollection.restore(input.cacheClient, snapshot)
        throw error
      } finally {
        await actual.filesEntryCacheCollection.invalidateDelete(input.cacheClient, input.resourceUri)
      }
    },

    async createFolder(input: {
      cacheClient: QueryClient
      db?: unknown
      folder: Parameters<typeof mocks.filesCreateFolder>[0]
    }) {
      const podRootUri = mocks.filesResolveCurrentPodRootUri(input.db)
      const snapshot = await actual.filesEntryCacheCollection.stageFolderCreate(
        input.cacheClient,
        input.folder,
        podRootUri,
      )
      let folder: Awaited<ReturnType<typeof mocks.filesCreateFolder>> | null = null
      try {
        folder = await mocks.filesCreateFolder(input.folder, input.db)
        actual.filesEntryCacheCollection.commitFolderCreate(input.cacheClient, folder)
        return folder
      } catch (error) {
        actual.filesEntryCacheCollection.restore(input.cacheClient, snapshot)
        throw error
      } finally {
        await actual.filesEntryCacheCollection.invalidateFolderCreate(input.cacheClient, input.folder, folder)
      }
    },
  }

  return {
    ...actual,
    filesResourceCollection: {
      resolveCurrentPodRootUri: mocks.filesResolveCurrentPodRootUri,
      buildRoots: mocks.filesBuildRoots,
      listChildTreeNodes: mocks.filesListChildTreeNodes,
      listEntries: mocks.filesListEntries,
      listAllEntries: mocks.filesListAllEntries,
      listContainerEntries: mocks.filesListContainerEntries,
      readDetail: mocks.filesReadDetail,
      readRawText: mocks.filesReadRawText,
      readBlob: mocks.filesReadBlob,
      readAccessBasics: mocks.filesReadAccessBasics,
      readMetaSidecar: mocks.filesReadMetaSidecar,
      saveRawText: mocks.filesSaveRawText,
      createRawText: mocks.filesCreateRawText,
      createBlob: mocks.filesCreateBlob,
      copy: mocks.filesCopy,
      move: mocks.filesMove,
      delete: mocks.filesDelete,
      createFolder: mocks.filesCreateFolder,
      getParentContainerUri: mocks.filesGetParentContainerUri,
    },
    filesResourceQueryCollection: {
      resolveCurrentPodRootUri: mocks.filesResourceQueryResolveCurrentPodRootUri,
      roots: mocks.filesResourceQueryRoots,
      children: mocks.filesResourceQueryChildren,
      containerEntries: mocks.filesResourceQueryContainerEntries,
      entries: mocks.filesResourceQueryEntries,
      detail: mocks.filesResourceQueryDetail,
      rawText: mocks.filesResourceQueryRawText,
      blob: mocks.filesResourceQueryBlob,
    },
    filesSidecarQueryCollection: {
      accessBasics: mocks.filesSidecarQueryAccessBasics,
      metaSidecar: mocks.filesSidecarQueryMetaSidecar,
    },
    filesResourceMutationCollection,
    filesVocabDiscoveryCollection: {
      ...actual.filesVocabDiscoveryCollection,
      resolveLocalVocabUri: mocks.filesVocabResolveLocalVocabUri,
      queryKey: mocks.filesVocabDiscoveryQueryKey,
      discover: mocks.filesVocabDiscoveryDiscover,
    },
    filesVocabDiscoveryQueryCollection: {
      resolveLocalVocabUri: mocks.filesVocabDiscoveryQueryResolveLocalVocabUri,
      discovery: mocks.filesVocabDiscoveryQueryDiscovery,
    },
    filesProposalQueryCollection: {
      pendingStructuredCellChanges: mocks.filesProposalQueryPendingStructuredCellChanges,
      pendingVocabTerms: mocks.filesProposalQueryPendingVocabTerms,
      pendingSourceUpdates: mocks.filesProposalQueryPendingSourceUpdates,
      pendingAccessPolicies: mocks.filesProposalQueryPendingAccessPolicies,
    },
    structuredCellProposalCollection: {
      ...actual.structuredCellProposalCollection,
      queryKey: mocks.structuredCellProposalQueryKey,
      fetchByDocument: mocks.structuredCellProposalFetchByDocument,
      create: mocks.structuredCellProposalCreate,
      createWithCache: async (input: {
        cacheClient: QueryClient
        db?: unknown
        actorWebId: string
        proposal: Parameters<typeof mocks.structuredCellProposalCreate>[0]['proposal']
      }) => {
        const snapshot = await mocks.structuredCellProposalCacheStageCreate(input.cacheClient, input.proposal)
        try {
          return await mocks.structuredCellProposalCreate({
            db: input.db,
            actorWebId: input.actorWebId,
            proposal: input.proposal,
          })
        } catch (error) {
          mocks.structuredCellProposalCacheRestore(input.cacheClient, snapshot)
          throw error
        } finally {
          await mocks.structuredCellProposalInvalidateCreate(input.cacheClient, input.proposal)
        }
      },
      invalidate: mocks.structuredCellProposalInvalidate,
      invalidateCreate: mocks.structuredCellProposalInvalidateCreate,
    },
    structuredCellProposalCacheCollection: {
      stageCreate: mocks.structuredCellProposalCacheStageCreate,
      stage: mocks.structuredCellProposalCacheStage,
      restore: mocks.structuredCellProposalCacheRestore,
    },
    vocabTermProposalCollection: {
      ...actual.vocabTermProposalCollection,
      queryKey: mocks.vocabTermProposalQueryKey,
      fetchByDocument: mocks.vocabTermProposalFetchByDocument,
      create: mocks.vocabTermProposalCreate,
      createWithCache: async (input: {
        cacheClient: QueryClient
        db?: unknown
        actorWebId: string
        proposal: Parameters<typeof mocks.vocabTermProposalCreate>[0]['proposal']
      }) => {
        const snapshot = await actual.filesProposalCacheCollection.stageCreate(
          input.cacheClient,
          mocks.vocabTermProposalQueryKey(input.proposal.documentUri),
          input.proposal,
        )
        try {
          return await mocks.vocabTermProposalCreate({
            db: input.db,
            actorWebId: input.actorWebId,
            proposal: input.proposal,
          })
        } catch (error) {
          actual.filesProposalCacheCollection.restore(input.cacheClient, snapshot)
          throw error
        } finally {
          await mocks.vocabTermProposalInvalidateCreate(input.cacheClient, input.proposal)
        }
      },
      approve: mocks.vocabTermProposalApprove,
      approveWithCache: async (input: {
        cacheClient: QueryClient
        db?: unknown
        proposal: Parameters<typeof mocks.vocabTermProposalApprove>[0]
      }) => {
        const resource = await mocks.vocabTermProposalApprove(input.proposal, input.db)
        await mocks.vocabTermProposalInvalidateApproval(input.cacheClient, resource)
        return resource
      },
      invalidateApproval: mocks.vocabTermProposalInvalidateApproval,
      invalidateCreate: mocks.vocabTermProposalInvalidateCreate,
    },
    accessPolicyProposalCollection: {
      ...actual.accessPolicyProposalCollection,
      queryKey: mocks.accessPolicyProposalQueryKey,
      fetchByOwner: mocks.accessPolicyProposalFetchByOwner,
      create: mocks.accessPolicyProposalCreate,
      createWithCache: async (input: {
        cacheClient: QueryClient
        db?: unknown
        actorWebId: string
        proposal: Parameters<typeof mocks.accessPolicyProposalCreate>[0]['proposal']
      }) => {
        const snapshot = await actual.filesProposalCacheCollection.stageCreate(
          input.cacheClient,
          mocks.accessPolicyProposalQueryKey(input.proposal.ownerUri),
          input.proposal,
        )
        try {
          return await mocks.accessPolicyProposalCreate({
            db: input.db,
            actorWebId: input.actorWebId,
            proposal: input.proposal,
          })
        } catch (error) {
          actual.filesProposalCacheCollection.restore(input.cacheClient, snapshot)
          throw error
        } finally {
          await mocks.accessPolicyProposalInvalidateCreate(input.cacheClient, input.proposal)
        }
      },
      invalidateCreate: mocks.accessPolicyProposalInvalidateCreate,
    },
    sourceUpdateProposalCollection: {
      ...actual.sourceUpdateProposalCollection,
      queryKey: mocks.sourceUpdateProposalQueryKey,
      fetchByDocument: mocks.sourceUpdateProposalFetchByDocument,
      create: mocks.sourceUpdateProposalCreate,
      createWithCache: async (input: {
        cacheClient: QueryClient
        db?: unknown
        actorWebId: string
        proposal: Parameters<typeof mocks.sourceUpdateProposalCreate>[0]['proposal']
      }) => {
        const snapshot = await actual.filesProposalCacheCollection.stageCreate(
          input.cacheClient,
          mocks.sourceUpdateProposalQueryKey(input.proposal.documentUri),
          input.proposal,
        )
        try {
          return await mocks.sourceUpdateProposalCreate({
            db: input.db,
            actorWebId: input.actorWebId,
            proposal: input.proposal,
          })
        } catch (error) {
          actual.filesProposalCacheCollection.restore(input.cacheClient, snapshot)
          throw error
        } finally {
          await mocks.sourceUpdateProposalInvalidateCreate(input.cacheClient, input.proposal)
        }
      },
      invalidateCreate: mocks.sourceUpdateProposalInvalidateCreate,
    },
    sourceIngestCollection: {
      ...actual.sourceIngestCollection,
      create: mocks.sourceIngestCreate,
      createWithCache: async (input: Parameters<typeof actual.sourceIngestCollection.createWithCache>[0]) => {
        const plan = await mocks.sourceIngestCreate({
          db: input.db,
          actorWebId: input.actorWebId,
          podRootUri: input.podRootUri,
          fetchSource: input.fetchSource,
          input: input.input,
        })
        await actual.sourceIngestCollection.invalidateCreate(input.cacheClient, plan)
        await mocks.sourceIngestInvalidateCreate(input.cacheClient, plan)
        return plan
      },
      refresh: mocks.sourceIngestRefresh,
      refreshWithCache: async (input: Parameters<typeof actual.sourceIngestCollection.refreshWithCache>[0]) => {
        const plan = await mocks.sourceIngestRefresh({
          db: input.db,
          actorWebId: input.actorWebId,
          podRootUri: input.podRootUri,
          fetchSource: input.fetchSource,
          input: input.input,
        })
        await mocks.sourceIngestInvalidateRefresh(input.cacheClient, plan)
        return plan
      },
      requestRange: mocks.sourceIngestRequestRange,
      requestRangeWithCache: async (input: Parameters<typeof actual.sourceIngestCollection.requestRangeWithCache>[0]) => {
        const result = await mocks.sourceIngestRequestRange({
          db: input.db,
          manifest: input.manifest,
          range: input.range,
          ranges: input.ranges,
          requestedAt: input.requestedAt,
        })
        await mocks.sourceIngestInvalidateManifest(input.cacheClient, result)
        return result
      },
      markRangeIngested: mocks.sourceIngestMarkRangeIngested,
      markRangeIngestedWithCache: async (input: Parameters<typeof actual.sourceIngestCollection.markRangeIngestedWithCache>[0]) => {
        const result = await mocks.sourceIngestMarkRangeIngested({
          db: input.db,
          manifest: input.manifest,
          range: input.range,
          ingestedAt: input.ingestedAt,
        })
        await mocks.sourceIngestInvalidateManifest(input.cacheClient, result)
        return result
      },
      invalidateCreate: mocks.sourceIngestInvalidateCreate,
      invalidateRefresh: mocks.sourceIngestInvalidateRefresh,
      invalidateManifest: mocks.sourceIngestInvalidateManifest,
    },
    aiChangeProposalCollection: {
      ...actual.aiChangeProposalCollection,
      create: mocks.aiChangeProposalCreate,
      createWithCache: async (input: {
        cacheClient: QueryClient
        db?: unknown
        actorWebId: string
        proposal: Parameters<typeof mocks.aiChangeProposalCreate>[0]['proposal']
      }) => {
        const snapshot = await actual.filesProposalCacheCollection.stageCreate(
          input.cacheClient,
          actual.aiChangeProposalCollection.queryKey(input.proposal.targetResourceUri),
          input.proposal,
        )
        try {
          return await mocks.aiChangeProposalCreate({
            db: input.db,
            actorWebId: input.actorWebId,
            proposal: input.proposal,
          })
        } catch (error) {
          actual.filesProposalCacheCollection.restore(input.cacheClient, snapshot)
          throw error
        } finally {
          await mocks.aiChangeProposalInvalidateCreate(input.cacheClient, input.proposal)
        }
      },
      invalidateCreate: mocks.aiChangeProposalInvalidateCreate,
    },
  }
})

vi.mock('./data/vocab/vocab-discovery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/vocab/vocab-discovery')>()
  return {
    ...actual,
    createSolidTypeIndexResourceTextReader: mocks.createSolidTypeIndexResourceTextReader,
    discoverSolidTypeIndexRegistrationsFromWebId: mocks.discoverSolidTypeIndexRegistrationsFromWebId,
  }
})

const rootData: FilesRootData = {
  podRootUri: 'https://pod.example/',
  nodes: [
    {
      id: 'smart-root:workspaces',
      label: 'Workspaces',
      type: 'workspaces-root',
      uri: 'https://pod.example/.data/workspaces/',
    },
    {
      id: 'smart-root:repositories',
      label: 'Repositories',
      type: 'repositories-root',
      uri: 'https://pod.example/.data/repositories/',
    },
  ],
}

function stableSourceHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a-${(hash >>> 0).toString(36).padStart(7, '0')}`
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

const reportEntry: FilesEntry = {
  id: 'https://pod.example/public/report.md',
  uri: 'https://pod.example/public/report.md',
  name: 'report.md',
  kind: 'resource',
  semanticKind: 'file',
  parentUri: 'https://pod.example/public/',
  mimeType: 'text/markdown',
  size: 8,
  modifiedAt: null,
}

describe('files queries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    mocks.chatState.selectedChatId = 'chat-1'
    mocks.chatState.selectedThreadId = 'thread-1'
    mocks.webId = 'https://pod.example/profile#me'
    mocks.threads.splice(0, mocks.threads.length, {
      id: 'thread-1',
      title: 'Current thread',
      workspace: 'https://pod.example/public/',
    })
    mocks.messages.splice(0, mocks.messages.length, {
      id: 'message-1',
      createdAt: '2026-06-18T08:00:00.000Z',
      richContent: JSON.stringify({
        items: [
          {
            type: 'file',
            fileName: 'chat-report.md',
            fileUrl: 'https://pod.example/public/chat-report.md',
            fileSize: 32,
            mimeType: 'text/markdown',
          },
        ],
      }),
    })
    mocks.createRawTextResource.mockResolvedValue({
      uri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
      content: '',
      mimeType: 'text/turtle',
      headers: {},
    })
    mocks.readRawTextResource.mockRejectedValue(new Error('HTTP 404'))
    mocks.fetchApprovals.mockResolvedValue([])
    mocks.sessionFetch.mockReset()
    mocks.sessionFetch.mockResolvedValue(new Response('', { status: 404 }))
    mocks.createSolidTypeIndexResourceTextReader.mockReset()
    mocks.createSolidTypeIndexResourceTextReader.mockReturnValue(async () => null)
    mocks.discoverSolidTypeIndexRegistrationsFromWebId.mockReset()
    mocks.discoverSolidTypeIndexRegistrationsFromWebId.mockResolvedValue({
      publicTypeIndexUri: null,
      privateTypeIndexUri: null,
      public: [],
      private: [],
    })
    mocks.filesVocabResolveLocalVocabUri.mockReset()
    mocks.filesVocabResolveLocalVocabUri.mockImplementation(({ localVocabUri }: { localVocabUri?: string | null }) => (
      localVocabUri ?? 'https://pod.example/.vocab/terms.ttl'
    ))
    mocks.filesVocabDiscoveryQueryKey.mockReset()
    mocks.filesVocabDiscoveryQueryKey.mockImplementation(({ webId, localVocabUri }: { webId?: string | null; localVocabUri?: string | null }) => [
      'files',
      'vocab-discovery',
      webId ?? '',
      'https://undefineds.co/vocab/VocabRegistry',
      localVocabUri ?? '',
    ])
    mocks.filesVocabDiscoveryDiscover.mockReset()
    mocks.filesVocabDiscoveryDiscover.mockResolvedValue({
      publicTypeIndexUri: null,
      privateTypeIndexUri: null,
      public: [],
      private: [],
    })
    mocks.filesVocabDiscoveryQueryResolveLocalVocabUri.mockImplementation(mocks.filesVocabResolveLocalVocabUri)
    mocks.filesVocabDiscoveryQueryDiscovery.mockImplementation((input: {
      webId?: string | null
      authFetch?: typeof fetch | null
      localVocabUri?: string | null
      enabled?: boolean
    }) => ({
      queryKey: mocks.filesVocabDiscoveryQueryKey({
        webId: input.webId,
        localVocabUri: input.localVocabUri,
      }),
      enabled: (input.enabled ?? true) && !!input.webId && !!input.authFetch,
      queryFn: async () => {
        if (!input.webId || !input.authFetch) {
          throw new Error('Cannot discover vocab Type Index without a logged-in WebID.')
        }
        return mocks.filesVocabDiscoveryDiscover({
          webId: input.webId,
          localVocabUri: input.localVocabUri,
          authFetch: input.authFetch,
        })
      },
    }))
    mocks.filesProposalQueryPendingStructuredCellChanges.mockImplementation((input: {
      documentUri?: string | null
      enabled?: boolean
      db?: unknown
    }) => {
      const documentUri = input.documentUri?.trim() ?? ''
      return {
        queryKey: mocks.structuredCellProposalQueryKey(documentUri),
        enabled: (input.enabled ?? true) && !!input.db && documentUri.length > 0,
        queryFn: async () => {
          if (!input.db || !documentUri) return []
          return mocks.structuredCellProposalFetchByDocument(documentUri, input.db)
        },
      }
    })
    mocks.filesProposalQueryPendingVocabTerms.mockImplementation((input: {
      documentUri?: string | null
      enabled?: boolean
      db?: unknown
    }) => {
      const documentUri = input.documentUri?.trim() ?? ''
      return {
        queryKey: mocks.vocabTermProposalQueryKey(documentUri),
        enabled: (input.enabled ?? true) && !!input.db && documentUri.length > 0,
        queryFn: async () => {
          if (!input.db || !documentUri) return []
          return mocks.vocabTermProposalFetchByDocument(documentUri, input.db)
        },
      }
    })
    mocks.filesProposalQueryPendingSourceUpdates.mockImplementation((input: {
      documentUri?: string | null
      enabled?: boolean
      db?: unknown
    }) => {
      const documentUri = input.documentUri?.trim() ?? ''
      return {
        queryKey: mocks.sourceUpdateProposalQueryKey(documentUri),
        enabled: (input.enabled ?? true) && !!input.db && documentUri.length > 0,
        queryFn: async () => {
          if (!input.db || !documentUri) return []
          return mocks.sourceUpdateProposalFetchByDocument(documentUri, input.db)
        },
      }
    })
    mocks.filesProposalQueryPendingAccessPolicies.mockImplementation((input: {
      ownerUri?: string | null
      enabled?: boolean
      db?: unknown
    }) => {
      const ownerUri = input.ownerUri?.trim() ?? ''
      return {
        queryKey: mocks.accessPolicyProposalQueryKey(ownerUri),
        enabled: (input.enabled ?? true) && !!input.db && ownerUri.length > 0,
        queryFn: async () => {
          if (!input.db || !ownerUri) return []
          return mocks.accessPolicyProposalFetchByOwner(ownerUri, input.db)
        },
      }
    })
    mocks.structuredCellProposalFetchByDocument.mockResolvedValue([])
    mocks.structuredCellProposalCreate.mockResolvedValue('https://pod.example/.data/approvals/cell.ttl#approval')
    mocks.structuredCellProposalInvalidate.mockResolvedValue(undefined)
    mocks.structuredCellProposalInvalidateCreate.mockResolvedValue(undefined)
    mocks.structuredCellProposalQueryKey.mockImplementation((documentUri: string) => ['files', 'structured-cell-proposals', documentUri] as const)
    mocks.structuredCellProposalCacheStage.mockImplementation((queryClient: QueryClient, proposal: unknown) => {
      const queryKey = mocks.structuredCellProposalQueryKey((proposal as { documentUri: string }).documentUri)
      const previous = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, (current: unknown[] | undefined) => [...(current ?? []), proposal])
      return { queryKey, previous }
    })
    mocks.structuredCellProposalCacheStageCreate.mockImplementation((queryClient: QueryClient, proposal: unknown) => (
      mocks.structuredCellProposalCacheStage(queryClient, proposal)
    ))
    mocks.structuredCellProposalCacheRestore.mockImplementation((queryClient: QueryClient, snapshot?: { queryKey: readonly unknown[]; previous: unknown }) => {
      if (snapshot) queryClient.setQueryData(snapshot.queryKey, snapshot.previous)
    })
    mocks.vocabTermProposalFetchByDocument.mockResolvedValue([])
    mocks.vocabTermProposalCreate.mockResolvedValue('https://pod.example/.data/approvals/vocab.ttl#approval')
    mocks.vocabTermProposalApprove.mockResolvedValue({
      uri: 'https://pod.example/.vocab/terms.ttl',
      content: '',
      mimeType: 'text/turtle',
      headers: {},
    })
    mocks.vocabTermProposalInvalidateApproval.mockResolvedValue(undefined)
    mocks.vocabTermProposalInvalidateCreate.mockResolvedValue(undefined)
    mocks.vocabTermProposalQueryKey.mockImplementation((documentUri: string) => ['files', 'vocab-term-proposals', documentUri] as const)
    mocks.accessPolicyProposalFetchByOwner.mockResolvedValue([])
    mocks.accessPolicyProposalCreate.mockResolvedValue('https://pod.example/.data/approvals/access.ttl#approval')
    mocks.accessPolicyProposalInvalidateCreate.mockResolvedValue(undefined)
    mocks.accessPolicyProposalQueryKey.mockImplementation((ownerUri: string) => ['files', 'access-policy-proposals', ownerUri] as const)
    mocks.sourceUpdateProposalFetchByDocument.mockResolvedValue([])
    mocks.sourceUpdateProposalCreate.mockResolvedValue('https://pod.example/.data/approvals/source-ingest.ttl#approval')
    mocks.sourceUpdateProposalInvalidateCreate.mockResolvedValue(undefined)
    mocks.sourceUpdateProposalQueryKey.mockImplementation((documentUri: string) => ['files', 'source-update-proposals', documentUri] as const)
    mocks.sourceIngestCreate.mockClear()
    mocks.sourceIngestRefresh.mockClear()
    mocks.sourceIngestRequestRange.mockClear()
    mocks.sourceIngestMarkRangeIngested.mockClear()
    mocks.sourceIngestInvalidateCreate.mockResolvedValue(undefined)
    mocks.sourceIngestInvalidateRefresh.mockResolvedValue(undefined)
    mocks.sourceIngestInvalidateManifest.mockResolvedValue(undefined)
    mocks.aiChangeProposalCreate.mockResolvedValue('https://pod.example/.data/approvals/ai-change.ttl#approval')
    mocks.aiChangeProposalInvalidateCreate.mockResolvedValue(undefined)
    mocks.saveRawTextResource.mockResolvedValue({
      uri: 'https://pod.example/.data/index/sources/example-com-report-01rzlsa/manifest.ttl',
      content: '',
      mimeType: 'text/turtle',
      headers: {},
    })
    mocks.buildRootNodes.mockResolvedValue(rootData)
    mocks.filesBuildRoots.mockResolvedValue(rootData)
    mocks.filesResolveCurrentPodRootUri.mockReturnValue('https://pod.example/')
    mocks.filesResourceQueryResolveCurrentPodRootUri.mockImplementation(mocks.filesResolveCurrentPodRootUri)
    mocks.filesResourceQueryRoots.mockImplementation(({ workspaceUri, db }: { workspaceUri?: string | null; db?: unknown }) => ({
      queryKey: ['files', 'roots', workspaceUri ?? ''],
      enabled: !!db,
      queryFn: async () => {
        if (!db) throw new Error('Database not connected')
        return mocks.filesBuildRoots(workspaceUri, db)
      },
    }))
    mocks.filesResourceQueryChildren.mockImplementation(({ parentNode, podRootUri, db }: {
      parentNode?: { id: string; type: string; uri?: string | null } | null
      podRootUri?: string | null
      db?: unknown
    }) => {
      const containerUri = parentNode?.uri && parentNode.type !== 'local-workspace'
        ? parentNode.uri
        : null
      return {
        queryKey: ['files', 'children', parentNode?.id ?? '', containerUri ?? ''],
        enabled: !!db && !!containerUri && !!parentNode,
        queryFn: async () => {
          if (!db || !containerUri || !parentNode) return []
          return mocks.filesListChildTreeNodes(containerUri, parentNode.id, podRootUri ?? null, db)
        },
      }
    })
    mocks.filesResourceQueryContainerEntries.mockImplementation(({ containerUri, db }: {
      containerUri?: string | null
      db?: unknown
    }) => ({
      queryKey: ['files', 'container-entries', containerUri ?? ''],
      enabled: !!db && !!containerUri,
      queryFn: async () => {
        if (!db || !containerUri) return []
        return mocks.filesListContainerEntries(containerUri, undefined, db)
      },
    }))
    mocks.filesResourceQueryEntries.mockImplementation((input: {
      entryScope: string
      selectedTreeNodeId: string
      selection: { kind: string; containerUri?: string; localPath?: string }
      workspaceUri?: string | null
      threadId?: string | null
      chatPodRootUri?: string | null
      messages?: unknown[]
      chatFileFingerprint?: string | null
      db?: unknown
    }) => ({
      queryKey: [
        'files',
        'entries',
        input.entryScope,
        input.selectedTreeNodeId,
        input.workspaceUri ?? '',
        input.selection.containerUri ?? '',
        input.selection.localPath ?? '',
        input.chatPodRootUri ?? '',
        input.chatFileFingerprint ?? '',
      ],
      enabled: !!input.db && (input.entryScope !== 'chat-files' || !!input.workspaceUri || !!input.chatPodRootUri),
      queryFn: async () => {
        if (!input.db) return []
        return mocks.filesListEntries({
          entryScope: input.entryScope,
          selection: input.selection,
          workspaceUri: input.workspaceUri,
          threadId: input.threadId,
          chatPodRootUri: input.chatPodRootUri,
          messages: input.messages ?? [],
        }, input.db)
      },
    }))
    mocks.filesResourceQueryDetail.mockImplementation(({ fileUri, db }: { fileUri?: string | null; db?: unknown }) => ({
      queryKey: ['files', 'detail', fileUri ?? ''],
      enabled: !!db && !!fileUri,
      queryFn: async () => {
        if (!db || !fileUri) throw new Error('No file selected')
        return mocks.filesReadDetail(fileUri, db)
      },
    }))
    mocks.filesResourceQueryRawText.mockImplementation(({ fileUri, enabled = true, db }: {
      fileUri?: string | null
      enabled?: boolean
      db?: unknown
    }) => ({
      queryKey: ['files', 'raw-text', fileUri ?? ''],
      enabled: !!db && !!fileUri && enabled,
      queryFn: async () => {
        if (!db || !fileUri) throw new Error('No file selected')
        return mocks.filesReadRawText(fileUri, db)
      },
    }))
    mocks.filesResourceQueryBlob.mockImplementation(({ fileUri, enabled = true, db }: {
      fileUri?: string | null
      enabled?: boolean
      db?: unknown
    }) => ({
      queryKey: ['files', 'blob', fileUri ?? ''],
      enabled: !!db && !!fileUri && enabled,
      queryFn: async () => {
        if (!db || !fileUri) throw new Error('No file selected')
        return mocks.filesReadBlob(fileUri, db)
      },
    }))
    mocks.filesSidecarQueryAccessBasics.mockImplementation(({ file, enabled = true, db }: {
      file?: { uri: string; kind: string } | null
      enabled?: boolean
      db?: unknown
    }) => ({
      queryKey: ['files', 'access-basics', file?.uri ?? '', file?.kind ?? ''],
      enabled: !!db && !!file && enabled,
      queryFn: async () => {
        if (!db || !file) throw new Error('No file selected')
        return mocks.filesReadAccessBasics(file, db)
      },
    }))
    mocks.filesSidecarQueryMetaSidecar.mockImplementation(({ file, enabled = true, db }: {
      file?: { uri: string; kind: string } | null
      enabled?: boolean
      db?: unknown
    }) => ({
      queryKey: ['files', 'meta-sidecar', file?.uri ?? '', file?.kind ?? ''],
      enabled: !!db && !!file && enabled,
      queryFn: async () => {
        if (!db || !file) throw new Error('No file selected')
        return mocks.filesReadMetaSidecar(file, db)
      },
    }))
    mocks.copyFileResource.mockResolvedValue({
      uri: 'https://pod.example/public/report copy.md',
      id: 'https://pod.example/public/report copy.md',
      name: 'report copy.md',
      kind: 'resource',
      semanticKind: 'file',
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 12,
      modifiedAt: '2026-06-17T00:00:00.000Z',
      headers: {},
      previewText: '# Report',
    })
    mocks.filesCopy.mockResolvedValue({
      uri: 'https://pod.example/public/report copy.md',
      id: 'https://pod.example/public/report copy.md',
      name: 'report copy.md',
      kind: 'resource',
      semanticKind: 'file',
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 12,
      modifiedAt: '2026-06-17T00:00:00.000Z',
      headers: {},
      previewText: '# Report',
    })
    mocks.createBlobResource.mockResolvedValue({
      uri: 'https://pod.example/public/diagram.png',
      id: 'https://pod.example/public/diagram.png',
      name: 'diagram.png',
      kind: 'resource',
      semanticKind: 'file',
      parentUri: 'https://pod.example/public/',
      mimeType: 'image/png',
      size: 4,
      modifiedAt: '2026-06-17T00:00:00.000Z',
      headers: {},
      previewText: null,
    })
    mocks.filesCreateBlob.mockResolvedValue({
      uri: 'https://pod.example/public/diagram.png',
      id: 'https://pod.example/public/diagram.png',
      name: 'diagram.png',
      kind: 'resource',
      semanticKind: 'file',
      parentUri: 'https://pod.example/public/',
      mimeType: 'image/png',
      size: 4,
      modifiedAt: '2026-06-17T00:00:00.000Z',
      headers: {},
      previewText: null,
    })
    mocks.createFolderResource.mockResolvedValue({
      uri: 'https://pod.example/public/Project%20Notes/',
      id: 'https://pod.example/public/Project%20Notes/',
      name: 'Project Notes',
      kind: 'container',
      semanticKind: 'container',
      parentUri: 'https://pod.example/public/',
      mimeType: 'inode/container',
      size: null,
      modifiedAt: '2026-06-17T00:00:00.000Z',
      headers: {},
      previewText: null,
      childEntries: [],
    })
    mocks.filesCreateFolder.mockResolvedValue({
      uri: 'https://pod.example/public/Project%20Notes/',
      id: 'https://pod.example/public/Project%20Notes/',
      name: 'Project Notes',
      kind: 'container',
      semanticKind: 'container',
      parentUri: 'https://pod.example/public/',
      mimeType: 'inode/container',
      size: null,
      modifiedAt: '2026-06-17T00:00:00.000Z',
      headers: {},
      previewText: null,
      childEntries: [],
    })
    mocks.listAllBrowsableEntries.mockResolvedValue([])
    mocks.listContainerEntries.mockResolvedValue([])
    mocks.filesListEntries.mockResolvedValue([])
    mocks.filesListAllEntries.mockResolvedValue([])
    mocks.filesListContainerEntries.mockResolvedValue([])
    mocks.moveFileResource.mockResolvedValue({
      uri: 'https://pod.example/public/archive/report.md',
      id: 'https://pod.example/public/archive/report.md',
      name: 'report.md',
      kind: 'resource',
      semanticKind: 'file',
      parentUri: 'https://pod.example/public/archive/',
      mimeType: 'text/markdown',
      size: 12,
      modifiedAt: '2026-06-17T00:00:00.000Z',
      headers: {},
      previewText: '# Report',
    })
    mocks.filesMove.mockResolvedValue({
      uri: 'https://pod.example/public/archive/report.md',
      id: 'https://pod.example/public/archive/report.md',
      name: 'report.md',
      kind: 'resource',
      semanticKind: 'file',
      parentUri: 'https://pod.example/public/archive/',
      mimeType: 'text/markdown',
      size: 12,
      modifiedAt: '2026-06-17T00:00:00.000Z',
      headers: {},
      previewText: '# Report',
    })
    mocks.filesDelete.mockResolvedValue(undefined)
    mocks.filesGetParentContainerUri.mockImplementation((uri: string) => {
      if (uri === 'https://pod.example/public/report.md') return 'https://pod.example/public/'
      if (uri === 'https://pod.example/public/notes.md') return 'https://pod.example/public/'
      if (uri === 'https://pod.example/public/diagram.png') return 'https://pod.example/public/'
      try {
        const url = new URL(uri)
        const segments = url.pathname.split('/').filter(Boolean)
        if (segments.length === 0) return null
        url.pathname = segments.length > 1 ? `/${segments.slice(0, -1).join('/')}/` : '/'
        url.search = ''
        url.hash = ''
        return url.toString()
      } catch {
        return null
      }
    })
    mocks.createAiChangeProposalInboxApproval.mockResolvedValue('https://pod.example/.data/approvals/ai-change.ttl#approval')
    mocks.createSourceUpdateProposalInboxApproval.mockResolvedValue('https://pod.example/.data/approvals/source-ingest.ttl#approval')
    mocks.filesCreateRawText.mockResolvedValue({
      uri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
      content: '',
      mimeType: 'text/turtle',
      headers: {},
    })
    mocks.filesReadRawText.mockRejectedValue(new Error('HTTP 404'))
    mocks.filesSaveRawText.mockResolvedValue({
      uri: 'https://pod.example/.data/index/sources/example-com-report-01rzlsa/manifest.ttl',
      content: '',
      mimeType: 'text/turtle',
      headers: {},
    })
  })

  it('resolves path-backed smart roots as container selections', () => {
    expect(resolveSelectedFilesNode('smart-root:recent', rootData)).toEqual({
      kind: 'recent',
    })
    expect(resolveSelectedFilesNode('smart-root:workspaces', rootData)).toEqual({
      kind: 'container',
      containerUri: 'https://pod.example/.data/workspaces/',
    })
    expect(resolveSelectedFilesNode('smart-root:repositories', rootData)).toEqual({
      kind: 'container',
      containerUri: 'https://pod.example/.data/repositories/',
    })
  })

  it('passes entry scope and selected location into the Files resource collection', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )

    const all = renderHook(() => useFilesEntries('all'), { wrapper })
    await waitFor(() => expect(all.result.current.isSuccess).toBe(true))

    expect(mocks.filesListEntries).toHaveBeenLastCalledWith(expect.objectContaining({
      entryScope: 'all',
      selection: { kind: 'all' },
      workspaceUri: 'https://pod.example/public/',
      threadId: 'thread-1',
    }), { id: 'db' })

    mocks.filesListEntries.mockClear()

    const recent = renderHook(() => useFilesEntries('smart-root:recent'), { wrapper })
    await waitFor(() => expect(recent.result.current.isSuccess).toBe(true))

    expect(mocks.filesListEntries).toHaveBeenLastCalledWith(expect.objectContaining({
      entryScope: 'all',
      selection: { kind: 'recent' },
      workspaceUri: 'https://pod.example/public/',
      threadId: 'thread-1',
    }), { id: 'db' })
  })

  it('passes active thread messages into the Files resource collection for chat files', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    mocks.filesListEntries.mockResolvedValue([
      {
        id: 'https://pod.example/public/chat-report.md',
        uri: 'https://pod.example/public/chat-report.md',
        name: 'chat-report.md',
        kind: 'resource',
        semanticKind: 'file',
        parentUri: 'https://pod.example/public/',
        mimeType: 'text/markdown',
        size: 32,
        modifiedAt: '2026-06-18T08:00:00.000Z',
        sourceLabel: '聊天引用',
      },
    ])

    const result = renderHook(() => useFilesEntries('all', 'chat-files'), { wrapper })
    await waitFor(() => expect(result.result.current.isSuccess).toBe(true))

    expect(mocks.filesListEntries).toHaveBeenLastCalledWith(expect.objectContaining({
      entryScope: 'chat-files',
      selection: { kind: 'all' },
      workspaceUri: 'https://pod.example/public/',
      threadId: 'thread-1',
      messages: mocks.messages,
    }), { id: 'db' })
    expect(result.result.current.data).toEqual([
      expect.objectContaining({
        uri: 'https://pod.example/public/chat-report.md',
        name: 'chat-report.md',
        sourceLabel: '聊天引用',
      }),
    ])
  })

  it('does not list Pod root as chat files when no active thread workspace exists', async () => {
    mocks.chatState.selectedThreadId = null
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )

    const result = renderHook(() => useFilesEntries('all', 'chat-files'), { wrapper })
    await waitFor(() => expect(result.result.current.isSuccess).toBe(true))

    expect(result.result.current.data).toEqual([])
    expect(mocks.filesListEntries).toHaveBeenLastCalledWith(expect.objectContaining({
      entryScope: 'chat-files',
      selection: { kind: 'all' },
      workspaceUri: null,
      threadId: null,
      messages: mocks.messages,
    }), { id: 'db' })
  })

  it('passes chat file context even when the active thread has no workspace', async () => {
    mocks.threads.splice(0, mocks.threads.length, {
      id: 'thread-1',
      title: 'Current thread',
      workspace: null,
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    mocks.filesListEntries.mockResolvedValue([
      {
        id: 'https://pod.example/public/chat-report.md',
        uri: 'https://pod.example/public/chat-report.md',
        name: 'chat-report.md',
        kind: 'resource',
        semanticKind: 'file',
        parentUri: 'https://pod.example/public/',
        mimeType: 'text/markdown',
        size: 32,
        modifiedAt: '2026-06-18T08:00:00.000Z',
        sourceLabel: '聊天引用',
      },
    ])

    const result = renderHook(() => useFilesEntries('all', 'chat-files'), { wrapper })
    await waitFor(() => expect(result.result.current.isSuccess).toBe(true))

    expect(result.result.current.data).toEqual([
      expect.objectContaining({
        uri: 'https://pod.example/public/chat-report.md',
        name: 'chat-report.md',
        sourceLabel: '聊天引用',
      }),
    ])
    expect(mocks.filesListEntries).toHaveBeenLastCalledWith(expect.objectContaining({
      entryScope: 'chat-files',
      selection: { kind: 'all' },
      workspaceUri: null,
      threadId: 'thread-1',
      messages: mocks.messages,
    }), { id: 'db' })
  })

  it('discovers vocab type indexes with the authenticated session fetch', async () => {
    const discoveryResult = {
      publicTypeIndexUri: 'https://pod.example/settings/publicTypeIndex.ttl',
      privateTypeIndexUri: 'https://pod.example/settings/privateTypeIndex.ttl',
      public: [{
        source: 'public' as const,
        registrationUri: 'https://pod.example/settings/publicTypeIndex.ttl#files-vocab',
        forClass: 'https://undefineds.co/vocab/VocabRegistry',
        instance: 'https://pod.example/.vocab/terms.ttl',
        instanceContainer: null,
      }],
      private: [{
        source: 'private' as const,
        registrationUri: 'https://pod.example/settings/privateTypeIndex.ttl#private-files-vocab',
        forClass: 'https://undefineds.co/vocab/VocabRegistry',
        instance: 'https://pod.example/private/.vocab/terms.ttl',
        instanceContainer: null,
      }],
    }
    mocks.filesVocabDiscoveryDiscover.mockResolvedValue(discoveryResult)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )

    const result = renderHook(() => useFilesVocabRegistryDiscovery({
      localVocabUri: 'https://pod.example/.vocab/terms.ttl',
    }), { wrapper })
    await waitFor(() => expect(result.result.current.isSuccess).toBe(true))

    expect(result.result.current.data).toEqual(discoveryResult)
    expect(mocks.filesVocabResolveLocalVocabUri).toHaveBeenCalledWith({
      db: { id: 'db' },
      localVocabUri: 'https://pod.example/.vocab/terms.ttl',
    })
    expect(mocks.filesVocabDiscoveryQueryKey).toHaveBeenCalledWith({
      webId: 'https://pod.example/profile#me',
      localVocabUri: 'https://pod.example/.vocab/terms.ttl',
    })
    expect(mocks.filesVocabDiscoveryDiscover).toHaveBeenCalledWith({
      webId: 'https://pod.example/profile#me',
      localVocabUri: 'https://pod.example/.vocab/terms.ttl',
      authFetch: expect.any(Function),
    })
  })

  it('does not run vocab discovery when disabled', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )

    const result = renderHook(() => useFilesVocabRegistryDiscovery({ enabled: false }), { wrapper })

    expect(result.result.current.fetchStatus).toBe('idle')
    expect(mocks.filesVocabDiscoveryDiscover).not.toHaveBeenCalled()
  })

  it('invalidates file queries after copying a resource', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useCopyFileResource(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        sourceUri: 'https://pod.example/public/report.md',
        destinationUri: 'https://pod.example/public/report copy.md',
      })
    })

    expect(mocks.filesCopy).toHaveBeenCalledWith({
      sourceUri: 'https://pod.example/public/report.md',
      destinationUri: 'https://pod.example/public/report copy.md',
    }, { id: 'db' })
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'entries'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'children'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'detail', 'https://pod.example/public/report.md'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'detail', 'https://pod.example/public/report copy.md'] }))
  })

  it('invalidates file queries after moving a resource', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useMoveFileResource(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        sourceUri: 'https://pod.example/public/report.md',
        destinationUri: 'https://pod.example/public/archive/report.md',
      })
    })

    expect(mocks.filesMove).toHaveBeenCalledWith({
      sourceUri: 'https://pod.example/public/report.md',
      destinationUri: 'https://pod.example/public/archive/report.md',
    }, { id: 'db' })
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'entries'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'children'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'detail', 'https://pod.example/public/report.md'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'detail', 'https://pod.example/public/archive/report.md'] }))
  })

  it('optimistically replaces moved resources in cached file entry lists', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    queryClient.setQueryData(['files', 'entries', 'all', 'https://pod.example/public/', '', ''], [
      reportEntry,
    ])
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useMoveFileResource(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        sourceUri: 'https://pod.example/public/report.md',
        destinationUri: 'https://pod.example/public/archive/report.md',
      })
    })

    expect(queryClient.getQueryData(['files', 'entries', 'all', 'https://pod.example/public/', '', ''])).toEqual([
      expect.objectContaining({
        uri: 'https://pod.example/public/archive/report.md',
        name: 'report.md',
      }),
    ])
  })

  it('optimistically adds created raw text resources to cached file entry lists and rolls back failures', async () => {
    const createDeferredResource = createDeferred<{
      uri: string
      content: string
      mimeType: string
      etag: string | null
      headers: Record<string, string>
    }>()
    mocks.filesCreateRawText.mockReturnValueOnce(createDeferredResource.promise)
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const entriesKey = ['files', 'entries', 'all', 'https://pod.example/public/', '', '']
    queryClient.setQueryData(entriesKey, [reportEntry])
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useCreateRawTextResource(), { wrapper })

    let mutation: Promise<unknown>
    act(() => {
      mutation = result.current.mutateAsync({
        resource: {
          uri: 'https://pod.example/public/notes.md',
          mimeType: 'text/markdown',
        },
        content: '# Notes',
      }).catch(() => undefined)
    })

    await waitFor(() => {
      expect(queryClient.getQueryData<FilesEntry[]>(entriesKey)).toEqual([
        reportEntry,
        expect.objectContaining({
          id: 'https://pod.example/public/notes.md',
          uri: 'https://pod.example/public/notes.md',
          name: 'notes.md',
          kind: 'resource',
          semanticKind: 'file',
          parentUri: 'https://pod.example/public/',
          mimeType: 'text/markdown',
          size: '# Notes'.length,
        }),
      ])
    })

    await act(async () => {
      createDeferredResource.reject(new Error('HTTP 500'))
      await mutation!
    })

    expect(queryClient.getQueryData(entriesKey)).toEqual([reportEntry])
  })

  it('optimistically updates saved raw text resources in cached file entry lists and rolls back failures', async () => {
    const saveDeferredResource = createDeferred<{
      uri: string
      content: string
      mimeType: string
      etag: string | null
      headers: Record<string, string>
    }>()
    mocks.filesSaveRawText.mockReturnValueOnce(saveDeferredResource.promise)
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const entriesKey = ['files', 'entries', 'all', 'https://pod.example/public/', '', '']
    queryClient.setQueryData(entriesKey, [reportEntry])
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useSaveRawTextResource(), { wrapper })

    let mutation: Promise<unknown>
    act(() => {
      mutation = result.current.mutateAsync({
        resource: {
          uri: 'https://pod.example/public/report.md',
          mimeType: 'text/markdown',
          etag: '"report-1"',
        },
        content: '# Updated report',
      }).catch(() => undefined)
    })

    await waitFor(() => {
      expect(queryClient.getQueryData<FilesEntry[]>(entriesKey)).toEqual([
        expect.objectContaining({
          id: 'https://pod.example/public/report.md',
          uri: 'https://pod.example/public/report.md',
          name: 'report.md',
          kind: 'resource',
          semanticKind: 'file',
          parentUri: 'https://pod.example/public/',
          mimeType: 'text/markdown',
          size: '# Updated report'.length,
        }),
      ])
    })

    await act(async () => {
      saveDeferredResource.reject(new Error('HTTP 412'))
      await mutation!
    })

    expect(queryClient.getQueryData(entriesKey)).toEqual([reportEntry])
  })

  it('invalidates file list and parent container queries after saving raw text content', async () => {
    mocks.filesSaveRawText.mockResolvedValueOnce({
      uri: 'https://pod.example/public/report.md',
      content: '# Updated report',
      mimeType: 'text/markdown',
      etag: '"report-2"',
      headers: { 'last-modified': 'Tue, 23 Jun 2026 10:00:00 GMT' },
    })
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useSaveRawTextResource(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        resource: {
          uri: 'https://pod.example/public/report.md',
          mimeType: 'text/markdown',
          etag: '"report-1"',
        },
        content: '# Updated report',
      })
    })

    expect(mocks.filesSaveRawText).toHaveBeenCalledWith({
      uri: 'https://pod.example/public/report.md',
      mimeType: 'text/markdown',
      etag: '"report-1"',
    }, '# Updated report', { id: 'db' })
    expect(queryClient.getQueryData(['files', 'raw-text', 'https://pod.example/public/report.md'])).toEqual(
      expect.objectContaining({
        uri: 'https://pod.example/public/report.md',
        content: '# Updated report',
        etag: '"report-2"',
      }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'entries'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'children'] }))
    expect(invalidateSpy).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'raw-text', 'https://pod.example/public/report.md'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'detail', 'https://pod.example/public/report.md'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'detail', 'https://pod.example/public/'] }))
  })

  it('invalidates file and parent container queries after deleting a resource', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useDeleteFileResource(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('https://pod.example/public/report.md')
    })

    expect(mocks.filesDelete).toHaveBeenCalledWith('https://pod.example/public/report.md', { id: 'db' })
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'entries'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'children'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'detail', 'https://pod.example/public/report.md'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'raw-text', 'https://pod.example/public/report.md'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'meta-sidecar', 'https://pod.example/public/report.md', 'resource'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'detail', 'https://pod.example/public/'] }))
  })

  it('optimistically removes deleted resources from cached file entry lists and rolls back failures', async () => {
    const deleteDeferredResource = createDeferred<void>()
    mocks.filesDelete.mockReturnValueOnce(deleteDeferredResource.promise)
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const entriesKey = ['files', 'entries', 'all', 'https://pod.example/public/', '', '']
    const notesEntry: FilesEntry = {
      id: 'https://pod.example/public/notes.md',
      uri: 'https://pod.example/public/notes.md',
      name: 'notes.md',
      kind: 'resource',
      semanticKind: 'file',
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 7,
      modifiedAt: null,
    }
    queryClient.setQueryData(entriesKey, [reportEntry, notesEntry])
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useDeleteFileResource(), { wrapper })

    let mutation: Promise<unknown>
    act(() => {
      mutation = result.current.mutateAsync('https://pod.example/public/report.md')
        .catch(() => undefined)
    })

    await waitFor(() => {
      expect(queryClient.getQueryData(entriesKey)).toEqual([notesEntry])
    })

    await act(async () => {
      deleteDeferredResource.reject(new Error('HTTP 500'))
      await mutation!
    })

    expect(queryClient.getQueryData(entriesKey)).toEqual([reportEntry, notesEntry])
  })

  it('invalidates file queries after creating a folder', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useCreateFolderResource(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        containerUri: 'https://pod.example/public/',
        name: 'Project Notes',
      })
    })

    expect(mocks.filesCreateFolder).toHaveBeenCalledWith({
      containerUri: 'https://pod.example/public/',
      name: 'Project Notes',
    }, { id: 'db' })
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'entries'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'children'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'detail', 'https://pod.example/public/'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'detail'] }))
  })

  it('invalidates parent container queries after creating a raw text resource', async () => {
    mocks.filesCreateRawText.mockResolvedValueOnce({
      uri: 'https://pod.example/public/notes.md',
      content: '# Notes',
      mimeType: 'text/markdown',
      headers: {},
    })
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useCreateRawTextResource(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        resource: {
          uri: 'https://pod.example/public/notes.md',
          mimeType: 'text/markdown',
        },
        content: '# Notes',
      })
    })

    expect(mocks.filesCreateRawText).toHaveBeenCalledWith({
      uri: 'https://pod.example/public/notes.md',
      mimeType: 'text/markdown',
    }, '# Notes', { id: 'db' })
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'entries'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'children'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'detail', 'https://pod.example/public/notes.md'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'raw-text', 'https://pod.example/public/notes.md'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'detail', 'https://pod.example/public/'] }))
  })

  it('invalidates parent container queries after creating a blob resource', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useCreateBlobResource(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        resource: {
          uri: 'https://pod.example/public/diagram.png',
          mimeType: 'image/png',
        },
        content: blob,
      })
    })

    expect(mocks.filesCreateBlob).toHaveBeenCalledWith({
      uri: 'https://pod.example/public/diagram.png',
      mimeType: 'image/png',
    }, blob, { id: 'db' })
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'entries'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'children'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'detail', 'https://pod.example/public/diagram.png'] }))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['files', 'detail', 'https://pod.example/public/'] }))
  })

  it('creates an Ingest card descriptor, manifest, source proposal and inbox approval without writing canonical body', async () => {
    const sourceBytes = new TextEncoder().encode('%PDF source evidence')
    const ingestAdapter = vi.fn().mockResolvedValue({
      markdown: '# Quarterly report\n\nInitial PDF Ingest snapshot.',
      sourceHash: 'sha256-pdf-1',
      mimeType: 'application/pdf',
      totalChunks: 1,
      pendingRanges: [],
      priorityQueue: [],
    })
    mocks.sessionFetch.mockResolvedValueOnce(new Response(sourceBytes, {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useCreateSourceIngest(), { wrapper })

    let createdPlan: Awaited<ReturnType<typeof result.current.mutateAsync>>
    await act(async () => {
      createdPlan = await result.current.mutateAsync({
        containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        sourceUri: 'https://example.com/report.pdf',
        title: 'Quarterly report',
        sourceKind: 'pdf',
        sourceHash: 'sha256-pdf-1',
        ingestAdapter,
      })
    })

    expect(createdPlan!.targetResourceUri).toBe('https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl')
    expect(createdPlan!.bodyResourceUri).toBe('https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md')
    expect(createdPlan!.sourceProposal.targetResourceUri).toBe(createdPlan!.bodyResourceUri)
    expect(createdPlan!.sourceIngestManifestUri).toContain('/.data/ingest/sources/')
    expect(createdPlan!.sourceIngestManifestUri).not.toContain('/.data/index/sources/')
    expect(mocks.createRawTextResource).toHaveBeenCalledTimes(3)
    expect(mocks.createRawTextResource.mock.calls[0]).toEqual([
      { id: 'db' },
      {
        uri: createdPlan!.sourceIngestManifestUri,
        mimeType: 'text/turtle',
      },
      expect.stringMatching(/udfs:SourceIngestManifest[\s\S]*udfs:sourceHash "sha256-pdf-1"[\s\S]*udfs:writesCanonicalContent false/),
    ])
    expect(mocks.createRawTextResource.mock.calls[0][2]).not.toContain('udfs:parserStatus')
    expect(mocks.createRawTextResource.mock.calls[1]).toEqual([
      { id: 'db' },
      {
        uri: createdPlan!.sourceProposal.proposalResourceUri,
        mimeType: 'text/turtle',
      },
      expect.stringMatching(/udfs:SourceUpdateProposal[\s\S]*udfs:targetResource <https:\/\/pod\.example\/\.data\/workspaces\/ws-1\/cards\/quarterly-report\.md>[\s\S]*udfs:ingestManifest <.*manifest\.ttl>[\s\S]*udfs:proposedContent "<!-- linx-source-block id=\\"chunk:1\\" hash=\\"sha256-pdf-1\\" origin=\\"source\\" -->\\n# Quarterly report[\s\S]*udfs:writesCanonicalContent false/),
    ])
    expect(mocks.createRawTextResource.mock.calls[2]).toEqual([
      { id: 'db' },
      {
        uri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
        mimeType: 'text/turtle',
      },
      expect.stringMatching(/udfs:SourceLinkedCard[\s\S]*dcterms:source <https:\/\/example\.com\/report\.pdf>[\s\S]*udfs:bodyResource <https:\/\/pod\.example\/\.data\/workspaces\/ws-1\/cards\/quarterly-report\.md>[\s\S]*udfs:writesCanonicalContent false/),
    ])
    expect(mocks.createRawTextResource).not.toHaveBeenCalledWith(
      { id: 'db' },
      {
        uri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md',
        mimeType: 'text/markdown',
      },
      expect.any(String),
    )
    expect(mocks.createSourceUpdateProposalInboxApproval).toHaveBeenCalledWith(
      { id: 'db' },
      {
        actorWebId: 'https://pod.example/profile#me',
        proposal: createdPlan!.sourceProposal,
      },
    )
  })

  it('delegates source Ingest creation to the Files source Ingest collection boundary', async () => {
    const plan = createSourceIngestPlan({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/index.ttl',
      containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
      sourceUri: 'https://example.com/report.pdf',
      sourceKind: 'pdf',
      title: 'Quarterly report',
      ingestSnapshot: {
        content: '# Quarterly report',
        sourceHash: 'sha256-pdf-1',
        mimeType: 'application/pdf',
        totalChunks: 1,
        pendingRanges: [],
        priorityQueue: [],
      },
      podRootUri: 'https://pod.example/',
    })
    mocks.sourceIngestCreate.mockResolvedValueOnce(plan)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useCreateSourceIngest(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        sourceUri: 'https://example.com/report.pdf',
        title: 'Quarterly report',
        sourceKind: 'pdf',
      })
    })

    expect(mocks.sourceIngestCreate).toHaveBeenCalledWith({
      db: { id: 'db' },
      actorWebId: 'https://pod.example/profile#me',
      fetchSource: mocks.sessionFetch,
      input: {
        containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        sourceUri: 'https://example.com/report.pdf',
        title: 'Quarterly report',
        sourceKind: 'pdf',
      },
    })
    expect(mocks.createRawTextResource).not.toHaveBeenCalled()
    expect(mocks.createSourceUpdateProposalInboxApproval).not.toHaveBeenCalled()
  })

  it('refetches active container file entries after source Ingest creates a card', async () => {
    const containerUri = 'https://pod.example/.data/workspaces/ws-1/cards/'
    const targetResourceUri = 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl'
    const plan = createSourceIngestPlan({
      documentUri: `${containerUri}index.ttl`,
      containerUri,
      sourceUri: 'https://example.com/report.pdf',
      sourceKind: 'pdf',
      title: 'Quarterly report',
      ingestSnapshot: {
        content: '# Quarterly report',
        sourceHash: 'sha256-pdf-1',
        mimeType: 'application/pdf',
        totalChunks: 1,
        pendingRanges: [],
        priorityQueue: [],
      },
      podRootUri: 'https://pod.example/',
    })
    expect(plan.targetResourceUri).toBe(targetResourceUri)
    mocks.sourceIngestCreate.mockResolvedValueOnce(plan)
    mocks.filesListContainerEntries
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: targetResourceUri,
        uri: targetResourceUri,
        name: 'quarterly-report.card.ttl',
        kind: 'resource',
        semanticKind: 'structured',
        parentUri: containerUri,
        mimeType: 'text/turtle',
        size: 512,
        modifiedAt: '2026-06-18T09:00:00.000Z',
      }])

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const entries = renderHook(() => useFilesEntries(createContainerNodeId(containerUri)), { wrapper })
    await waitFor(() => expect(entries.result.current.isSuccess).toBe(true))
    expect(entries.result.current.data).toEqual([])

    const ingest = renderHook(() => useCreateSourceIngest(), { wrapper })
    await act(async () => {
      await ingest.result.current.mutateAsync({
        containerUri,
        sourceUri: 'https://example.com/report.pdf',
        title: 'Quarterly report',
        sourceKind: 'pdf',
      })
    })

    await waitFor(() => expect(mocks.filesListContainerEntries).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(entries.result.current.data).toEqual([
      expect.objectContaining({
        uri: targetResourceUri,
        modifiedAt: '2026-06-18T09:00:00.000Z',
      }),
    ]))
  })

  it('uses Ingest wording when source creation has no logged-in WebID', async () => {
    mocks.webId = null
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useCreateSourceIngest(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync({
        containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        sourceUri: 'https://example.com/report.pdf',
        title: 'Quarterly report',
        sourceKind: 'pdf',
      })).rejects.toThrow('Cannot create an Ingest source without a logged-in WebID.')
    })

    expect(mocks.sessionFetch).not.toHaveBeenCalled()
    expect(mocks.createRawTextResource).not.toHaveBeenCalled()
    expect(mocks.createSourceUpdateProposalInboxApproval).not.toHaveBeenCalled()
  })

  it('does not create an initial Ingest card when a URL source cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useCreateSourceIngest(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync({
        containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        sourceUri: 'https://example.com/blocked',
        title: 'Blocked source',
        sourceKind: 'url',
      })).rejects.toThrow('Ingest source could not be read.')
    })

    expect(mocks.createRawTextResource).not.toHaveBeenCalled()
    expect(mocks.saveRawTextResource).not.toHaveBeenCalled()
    expect(mocks.createSourceUpdateProposalInboxApproval).not.toHaveBeenCalled()
  })

  it('does not create an initial Ingest card when a Pod source cannot be read', async () => {
    mocks.sessionFetch.mockResolvedValueOnce(new Response('', { status: 404 }))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useCreateSourceIngest(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync({
        containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        sourceUri: 'https://pod.example/public/missing.pdf',
        title: 'Missing PDF',
        sourceKind: 'pdf',
      })).rejects.toThrow('Ingest source could not be read.')
    })

    expect(mocks.sessionFetch).toHaveBeenCalledWith('https://pod.example/public/missing.pdf')
    expect(mocks.createRawTextResource).not.toHaveBeenCalled()
    expect(mocks.saveRawTextResource).not.toHaveBeenCalled()
    expect(mocks.createSourceUpdateProposalInboxApproval).not.toHaveBeenCalled()
  })

  it('does not leave a visible Ingest card when manifest creation fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      text: async () => '<html><head><title>Release Notes</title></head><body><main><p>Readable source.</p></main></body></html>',
    }))
    mocks.createRawTextResource.mockImplementation(async (_db, resource) => {
      if (resource.uri.includes('/.data/ingest/')) throw new Error('HTTP 500')
      return {
        uri: resource.uri,
        content: '',
        mimeType: resource.mimeType,
        headers: {},
      }
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useCreateSourceIngest(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync({
        containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        sourceUri: 'https://example.com/release-notes',
        title: 'Release Notes',
        sourceKind: 'url',
      })).rejects.toThrow('HTTP 500')
    })

    expect(mocks.createRawTextResource).not.toHaveBeenCalledWith(
      { id: 'db' },
      {
        uri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
        mimeType: 'text/turtle',
      },
      expect.any(String),
    )
    expect(mocks.createSourceUpdateProposalInboxApproval).not.toHaveBeenCalled()
  })

  it('does not leave a visible Ingest card when proposal creation fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      text: async () => '<html><head><title>Release Notes</title></head><body><main><p>Readable source.</p></main></body></html>',
    }))
    mocks.createRawTextResource.mockImplementation(async (_db, resource) => {
      if (resource.uri.includes('/.data/proposals/source/')) throw new Error('HTTP 409')
      return {
        uri: resource.uri,
        content: '',
        mimeType: resource.mimeType,
        headers: {},
      }
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useCreateSourceIngest(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync({
        containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        sourceUri: 'https://example.com/release-notes',
        title: 'Release Notes',
        sourceKind: 'url',
      })).rejects.toThrow('HTTP 409')
    })

    expect(mocks.createRawTextResource).not.toHaveBeenCalledWith(
      { id: 'db' },
      {
        uri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
        mimeType: 'text/turtle',
      },
      expect.any(String),
    )
    expect(mocks.createSourceUpdateProposalInboxApproval).not.toHaveBeenCalled()
  })

  it('imports non-url sources through authenticated fetch and stages ingest byte ranges', async () => {
    const sourceUri = 'https://pod.example/public/report.pdf'
    const sourceBytes = new Uint8Array(9000)
    sourceBytes.fill(37)
    const sourceHash = stableSourceHash(String.fromCharCode(...sourceBytes))
    mocks.sessionFetch.mockResolvedValueOnce(new Response(sourceBytes, {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }))
    vi.stubGlobal('fetch', vi.fn())
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useCreateSourceIngest(), { wrapper })

    let createdPlan: Awaited<ReturnType<typeof result.current.mutateAsync>>
    await act(async () => {
      createdPlan = await result.current.mutateAsync({
        containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        sourceUri,
        title: 'Quarterly report',
        sourceKind: 'pdf',
      })
    })

    expect(mocks.sessionFetch).toHaveBeenCalledWith(sourceUri)
    expect(fetch).not.toHaveBeenCalled()
    expect(createdPlan!.sourceIngestManifest).toMatchObject({
      sourceUri,
      sourceHash,
      status: 'partial',
      pendingRanges: [
        { start: 'bytes:0', end: 'bytes:4095' },
        { start: 'bytes:4096', end: 'bytes:8191' },
        { start: 'bytes:8192', end: 'bytes:8999' },
      ],
      priorityQueue: [
        'bytes:0..bytes:4095',
        'bytes:4096..bytes:8191',
        'bytes:8192..bytes:8999',
      ],
      readChunks: 1,
      totalChunks: 4,
      writesCanonicalContent: false,
    })
    expect(mocks.createRawTextResource.mock.calls[0][2]).toContain('udfs:pendingRange "bytes:0..bytes:4095"')
    expect(mocks.createRawTextResource.mock.calls[0][2]).toContain('udfs:priorityQueue "bytes:8192..bytes:8999"')
    expect(mocks.createRawTextResource.mock.calls[1][2]).toContain('Ingest queued this resource for progressive processing.')
    expect(mocks.createRawTextResource.mock.calls[1][2]).toContain('Chunks: 3')
  })

  it('creates an Ingest card through an injected xpod Ingest adapter', async () => {
    const sourceUri = 'https://pod.example/public/report.pdf'
    const sourceBytes = new Uint8Array([37, 80, 68, 70, 45, 49])
    const ingestAdapter = vi.fn().mockResolvedValue({
      markdown: '# OCR Report\n\nIngested through xpod OCR.',
      sourceHash: 'sha256-ocr-report',
      mimeType: 'text/markdown',
      totalChunks: 1,
      pendingRanges: [],
      priorityQueue: [],
    })
    mocks.sessionFetch.mockResolvedValueOnce(new Response(sourceBytes, {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useCreateSourceIngest(), { wrapper })

    let createdPlan: Awaited<ReturnType<typeof result.current.mutateAsync>>
    await act(async () => {
      createdPlan = await result.current.mutateAsync({
        containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        sourceUri,
        title: 'Quarterly report',
        sourceKind: 'pdf',
        ingestAdapter,
      })
    })

    expect(ingestAdapter).toHaveBeenCalledTimes(1)
    expect(ingestAdapter.mock.calls[0]?.[0]).toMatchObject({
      sourceUri,
      title: 'Quarterly report',
      sourceKind: 'pdf',
      mimeType: 'application/pdf',
    })
    expect(Array.from(ingestAdapter.mock.calls[0]?.[0].bytes)).toEqual(Array.from(sourceBytes))
    expect(createdPlan!.sourceProposal.proposedContent).toContain('Ingested through xpod OCR.')
    expect(createdPlan!.sourceProposal.proposedContent).not.toContain('Ingest queued this resource')
    expect(mocks.createRawTextResource.mock.calls[1][2]).toContain('Ingested through xpod OCR.')
    expect(mocks.createRawTextResource).not.toHaveBeenCalledWith(
      { id: 'db' },
      {
        uri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md',
        mimeType: 'text/markdown',
      },
      expect.any(String),
    )
  })

  it('does not overwrite an existing source proposal resource when creation collides', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const proposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
      subject: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl#card',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md',
      sourceUri: 'https://example.com/report.pdf',
      sourceIngestManifestUri: 'https://pod.example/.data/index/sources/example-com-report-01rzlsa/manifest.ttl',
      ingestVersion: 'pdf-parser-v1',
      sourceHash: 'sha256-pdf-2',
      operation: 'replace-blocks',
      proposedContent: '# Quarterly report\n\nUpdated ingest body.',
      createdAt: '2026-06-17T02:00:00.000Z',
    })
    const manifest = createSourceIndexManifest({
      documentUri: proposal.documentUri,
      sourceUri: proposal.sourceUri,
      sourceHash: proposal.sourceHash,
      ingestVersion: proposal.ingestVersion,
      manifestUri: proposal.sourceIngestManifestUri,
      status: 'partial',
      lastIndexedAt: proposal.snapshotAt,
    })
    mocks.readRawTextResource.mockResolvedValueOnce({
      uri: proposal.sourceIngestManifestUri,
      content: renderSourceIndexManifestTurtle(manifest),
      mimeType: 'text/turtle',
      etag: '"manifest-1"',
      headers: { etag: '"manifest-1"', 'content-type': 'text/turtle' },
    })
    mocks.sourceUpdateProposalCreate.mockRejectedValueOnce(new Error('HTTP 409'))

    const { result } = renderHook(() => useCreateSourceUpdateProposal(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync(proposal)).rejects.toThrow('HTTP 409')
    })

    expect(mocks.sourceUpdateProposalCreate).toHaveBeenCalledWith({
      db: { id: 'db' },
      actorWebId: 'https://pod.example/profile#me',
      proposal,
    })
    expect(mocks.createRawTextResource).not.toHaveBeenCalledWith(
      { id: 'db' },
      expect.objectContaining({ uri: proposal.proposalResourceUri }),
      expect.any(String),
    )
    expect(mocks.readRawTextResource).not.toHaveBeenCalledWith({ id: 'db' }, proposal.proposalResourceUri)
    expect(mocks.saveRawTextResource).not.toHaveBeenCalledWith(
      { id: 'db' },
      expect.objectContaining({ uri: proposal.proposalResourceUri }),
      expect.any(String),
    )
    expect(mocks.createSourceUpdateProposalInboxApproval).not.toHaveBeenCalled()
  })

  it('imports fetchable URL content into the staged card body before approval', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      text: async () => [
        '<!doctype html>',
        '<html>',
        '<head><title>Release Notes</title><meta name="description" content="Quarterly planning notes"></head>',
        '<body>',
        '<nav>Ignore navigation</nav>',
        '<main><h1>Release Notes</h1><p>Revenue increased after launch.</p><p>Next step is customer rollout.</p></main>',
        '<script>ignore()</script>',
        '</body>',
        '</html>',
      ].join(''),
    }))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useCreateSourceIngest(), { wrapper })

    let createdPlan: Awaited<ReturnType<typeof result.current.mutateAsync>>
    await act(async () => {
      createdPlan = await result.current.mutateAsync({
        containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        sourceUri: 'https://example.com/release-notes',
        title: 'Imported page',
        sourceKind: 'url',
      })
    })

    expect(fetch).toHaveBeenCalledWith('https://example.com/release-notes', { credentials: 'omit' })
    expect(createdPlan!.sourceIngestManifest).toMatchObject({
      sourceUri: 'https://example.com/release-notes',
      status: 'complete',
      ingestedRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
      pendingRanges: [],
      priorityQueue: [],
      readChunks: 1,
      totalChunks: 1,
    })
    expect(createdPlan!.sourceIngestManifest.sourceHash).toMatch(/^fnv1a-/)
    expect(mocks.createRawTextResource).not.toHaveBeenCalledWith(
      { id: 'db' },
      {
        uri: 'https://pod.example/.data/workspaces/ws-1/cards/imported-page.md',
        mimeType: 'text/markdown',
      },
      expect.any(String),
    )
    const stagedBodyContent = mocks.createRawTextResource.mock.calls
      .map((call) => call[2])
      .find((content) => content.includes('Revenue increased after launch.'))
    expect(stagedBodyContent).toBeDefined()
    expect(stagedBodyContent).toContain('Next step is customer rollout.')
    expect(stagedBodyContent).not.toContain('Ignore navigation')
    expect(stagedBodyContent).not.toContain('waiting for approval')
  })

  it('reuses an unchanged Ingest manifest instead of recreating it', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useCreateSourceIngest(), { wrapper })
    const existingManifestUri = 'https://pod.example/.data/ingest/sources/example-com-report-0yjxs9y/manifest.ttl'
    mocks.readRawTextResource.mockResolvedValueOnce({
      uri: existingManifestUri,
      mimeType: 'text/turtle',
      etag: '"manifest-1"',
      headers: {},
      content: [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '@prefix dcterms: <http://purl.org/dc/terms/> .',
        '',
        '<#manifest> a udfs:SourceIngestManifest ;',
        '  dcterms:source <https://example.com/report.pdf> ;',
        '  udfs:sourceHash "sha256-pdf-1" ;',
        '  udfs:ingestVersion "pdf-ingest-v1" ;',
        '  udfs:ingestStatus "partial" ;',
        '  udfs:readChunks 1 ;',
        '  udfs:totalChunks 0 ;',
        '  udfs:ingestedRange "chunk:1..chunk:1" ;',
        '  udfs:pendingRange "chunk:2..chunk:*" ;',
        '  udfs:priorityQueue "chunk:2" ;',
        '  udfs:lastIngestedAt "2026-06-17T00:00:00.000Z" ;',
        '  udfs:writesCanonicalContent false .',
      ].join('\n'),
    })
    mocks.sessionFetch.mockResolvedValueOnce(new Response(new TextEncoder().encode('%PDF source'), {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }))
    const ingestAdapter = vi.fn(async () => ({
      markdown: '# Quarterly report\n\nExisting Ingest snapshot.',
      sourceHash: 'sha256-pdf-1',
      mimeType: 'application/pdf',
      totalChunks: 1,
      pendingRanges: [{ start: 'chunk:2', end: 'chunk:*' }],
      priorityQueue: ['chunk:2'],
    }))

    await act(async () => {
      await result.current.mutateAsync({
        containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        sourceUri: 'https://example.com/report.pdf',
        title: 'Quarterly report',
        sourceKind: 'pdf',
        sourceHash: 'sha256-pdf-1',
        ingestVersion: 'pdf-ingest-v1',
        ingestAdapter,
      })
    })

    expect(ingestAdapter).toHaveBeenCalledWith(expect.objectContaining({
      sourceUri: 'https://example.com/report.pdf',
      sourceKind: 'pdf',
      mimeType: 'application/pdf',
    }))
    expect(mocks.readRawTextResource).toHaveBeenCalledWith({ id: 'db' }, existingManifestUri)
    expect(mocks.saveRawTextResource).not.toHaveBeenCalled()
    expect(mocks.createRawTextResource).not.toHaveBeenCalledWith(
      { id: 'db' },
      {
        uri: existingManifestUri,
        mimeType: 'text/turtle',
      },
      expect.any(String),
    )
    expect(mocks.createRawTextResource).toHaveBeenCalledTimes(2)
  })

  it('refreshes a URL source without proposal when the source hash is unchanged', async () => {
    const sourceUri = 'https://example.com/release-notes'
    const sourceHtml = '<html><head><title>Release Notes</title></head><body><main><p>Same body.</p></main></body></html>'
    const sourceHash = stableSourceHash(sourceHtml)
    const manifestUri = 'https://pod.example/.data/index/sources/example-com-release-notes-01rzlsa/manifest.ttl'
    const manifest = createSourceIndexManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
      sourceUri,
      sourceHash,
      ingestVersion: 'url-parser-v1',
      status: 'complete',
      indexedRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
      pendingRanges: [],
      priorityQueue: [],
      readChunks: 1,
      totalChunks: 1,
      manifestUri,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      text: async () => sourceHtml,
    }))
    mocks.readRawTextResource.mockResolvedValueOnce({
      uri: manifestUri,
      content: renderSourceIndexManifestTurtle(manifest),
      mimeType: 'text/turtle',
      etag: '"manifest-1"',
      headers: { etag: '"manifest-1"', 'content-type': 'text/turtle' },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useRefreshSourceLinkedCard(), { wrapper })

    let refreshPlan: Awaited<ReturnType<typeof result.current.mutateAsync>>
    await act(async () => {
      refreshPlan = await result.current.mutateAsync({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
        subject: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl#card',
        targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.md',
        sourceUri,
        sourceKind: 'url',
        title: 'Release Notes',
        mimeType: 'text/html',
        currentSourceHash: sourceHash,
        ingestVersion: 'url-parser-v1',
        sourceIngestManifestUri: manifestUri,
      })
    })

    expect(fetch).toHaveBeenCalledWith(sourceUri, { credentials: 'omit' })
    expect(refreshPlan!.action).toBe('unchanged')
    expect(refreshPlan!.sourceProposal).toBeNull()
    expect(mocks.readRawTextResource).toHaveBeenCalledWith({ id: 'db' }, manifestUri)
    expect(mocks.saveRawTextResource).not.toHaveBeenCalled()
    expect(mocks.createRawTextResource).not.toHaveBeenCalled()
    expect(mocks.createSourceUpdateProposalInboxApproval).not.toHaveBeenCalled()
  })

  it('refreshes a changed URL source as manifest update plus source update proposal', async () => {
    const sourceUri = 'https://example.com/release-notes'
    const sourceHtml = '<html><head><title>Release Notes v2</title></head><body><main><p>Fresh source body.</p></main></body></html>'
    const sourceHash = stableSourceHash(sourceHtml)
    const manifestUri = 'https://pod.example/.data/index/sources/example-com-release-notes-01rzlsa/manifest.ttl'
    const oldManifest = createSourceIndexManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
      sourceUri,
      sourceHash: 'fnv1a-old',
      ingestVersion: 'url-parser-v1',
      status: 'partial',
      indexedRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
      pendingRanges: [{ start: 'chunk:2', end: 'chunk:*' }],
      priorityQueue: ['chunk:2'],
      readChunks: 1,
      totalChunks: 0,
      manifestUri,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      text: async () => sourceHtml,
    }))
    mocks.readRawTextResource.mockResolvedValueOnce({
      uri: manifestUri,
      content: renderSourceIndexManifestTurtle(oldManifest),
      mimeType: 'text/turtle',
      etag: '"manifest-1"',
      headers: { etag: '"manifest-1"', 'content-type': 'text/turtle' },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useRefreshSourceLinkedCard(), { wrapper })

    let refreshPlan: Awaited<ReturnType<typeof result.current.mutateAsync>>
    await act(async () => {
      refreshPlan = await result.current.mutateAsync({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
        subject: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl#card',
        targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.md',
        sourceUri,
        sourceKind: 'url',
        title: 'Release Notes',
        mimeType: 'text/html',
        currentSourceHash: 'fnv1a-old',
        ingestVersion: 'url-parser-v1',
        sourceIngestManifestUri: manifestUri,
      })
    })

    expect(fetch).toHaveBeenCalledWith(sourceUri, { credentials: 'omit' })
    expect(refreshPlan!).toMatchObject({
      action: 'changed',
      sourceIngestManifestUri: manifestUri,
      sourceProposal: expect.objectContaining({
        targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.md',
        sourceIngestManifestUri: manifestUri,
        sourceHash,
        writesCanonicalContent: false,
      }),
    })
    expect(mocks.saveRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      expect.objectContaining({ uri: manifestUri, etag: '"manifest-1"' }),
      expect.stringMatching(new RegExp(`udfs:sourceHash "${sourceHash}"[\\s\\S]*udfs:ingestStatus "complete"[\\s\\S]*udfs:totalChunks 1[\\s\\S]*udfs:writesCanonicalContent false`)),
    )
    expect(mocks.createRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      {
        uri: refreshPlan!.sourceProposal!.proposalResourceUri,
        mimeType: 'text/turtle',
      },
      expect.stringMatching(new RegExp(`udfs:SourceUpdateProposal[\\s\\S]*udfs:targetResource <https://pod\\.example/\\.data/workspaces/ws-1/cards/release-notes\\.md>[\\s\\S]*udfs:ingestManifest <${manifestUri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}>[\\s\\S]*udfs:sourceHash "${sourceHash}"[\\s\\S]*Fresh source body\\.[\\s\\S]*udfs:writesCanonicalContent false`)),
    )
    expect(mocks.createSourceUpdateProposalInboxApproval).toHaveBeenCalledWith(
      { id: 'db' },
      {
        actorWebId: 'https://pod.example/profile#me',
        proposal: refreshPlan!.sourceProposal,
      },
    )
    expect(mocks.saveRawTextResource).not.toHaveBeenCalledWith(
      { id: 'db' },
      expect.objectContaining({ uri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.md' }),
      expect.any(String),
    )
  })

  it('refreshes a changed PDF source through the ingest adapter boundary without writing canonical body', async () => {
    const sourceUri = 'https://pod.example/public/report.pdf'
    const sourceBytes = new Uint8Array([37, 80, 68, 70, 45, 50, 46, 48])
    const sourceHash = stableSourceHash(String.fromCharCode(...sourceBytes))
    const manifestUri = 'https://pod.example/.data/index/sources/pod-example-public-report-pdf-01rzlsa/manifest.ttl'
    const oldManifest = createSourceIndexManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl',
      sourceUri,
      sourceHash: 'sha256-pdf-old',
      ingestVersion: 'pdf-parser-v1',
      status: 'partial',
      indexedRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
      pendingRanges: [{ start: 'chunk:2', end: 'chunk:*' }],
      priorityQueue: ['chunk:2'],
      readChunks: 1,
      totalChunks: 0,
      manifestUri,
    })
    vi.stubGlobal('fetch', vi.fn())
    mocks.sessionFetch.mockResolvedValueOnce(new Response(sourceBytes, {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }))
    mocks.readRawTextResource.mockResolvedValueOnce({
      uri: manifestUri,
      content: renderSourceIndexManifestTurtle(oldManifest),
      mimeType: 'text/turtle',
      etag: '"manifest-1"',
      headers: { etag: '"manifest-1"', 'content-type': 'text/turtle' },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useRefreshSourceLinkedCard(), { wrapper })

    let refreshPlan: Awaited<ReturnType<typeof result.current.mutateAsync>>
    await act(async () => {
      refreshPlan = await result.current.mutateAsync({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl',
        subject: 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl#card',
        targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.md',
        sourceUri,
        sourceKind: 'pdf',
        title: 'Report',
        mimeType: 'application/pdf',
        currentSourceHash: 'sha256-pdf-old',
        ingestVersion: 'pdf-parser-v1',
        sourceIngestManifestUri: manifestUri,
      })
    })

    expect(mocks.sessionFetch).toHaveBeenCalledWith(sourceUri)
    expect(fetch).not.toHaveBeenCalled()
    expect(refreshPlan!).toMatchObject({
      action: 'changed',
      sourceKind: 'pdf',
      sourceIngestManifestUri: manifestUri,
      sourceProposal: expect.objectContaining({
        targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.md',
        sourceIngestManifestUri: manifestUri,
        sourceHash,
        writesCanonicalContent: false,
      }),
    })
    expect(mocks.saveRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      expect.objectContaining({ uri: manifestUri, etag: '"manifest-1"' }),
      expect.stringMatching(new RegExp(`udfs:sourceHash "${sourceHash}"[\\s\\S]*udfs:ingestStatus "partial"[\\s\\S]*udfs:totalChunks 2[\\s\\S]*udfs:pendingRange "bytes:0\\.\\.bytes:7"[\\s\\S]*udfs:priorityQueue "bytes:0\\.\\.bytes:7"[\\s\\S]*udfs:writesCanonicalContent false`)),
    )
    expect(mocks.createRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      {
        uri: refreshPlan!.sourceProposal!.proposalResourceUri,
        mimeType: 'text/turtle',
      },
      expect.stringMatching(new RegExp(`udfs:SourceUpdateProposal[\\s\\S]*udfs:targetResource <https://pod\\.example/\\.data/workspaces/ws-1/cards/report\\.md>[\\s\\S]*udfs:sourceHash "${sourceHash}"[\\s\\S]*Kind: pdf[\\s\\S]*Format: application/pdf[\\s\\S]*udfs:writesCanonicalContent false`)),
    )
    expect(mocks.createSourceUpdateProposalInboxApproval).toHaveBeenCalledWith(
      { id: 'db' },
      {
        actorWebId: 'https://pod.example/profile#me',
        proposal: refreshPlan!.sourceProposal,
      },
    )
    expect(mocks.saveRawTextResource).not.toHaveBeenCalledWith(
      { id: 'db' },
      expect.objectContaining({ uri: 'https://pod.example/.data/workspaces/ws-1/cards/report.md' }),
      expect.any(String),
    )
  })

  it('refreshes a changed PDF source through an injected Ingest adapter without writing canonical body', async () => {
    const sourceUri = 'https://pod.example/public/report.pdf'
    const sourceBytes = new Uint8Array([37, 80, 68, 70, 45, 51])
    const manifestUri = 'https://pod.example/.data/index/sources/pod-example-public-report-pdf-01rzlsa/manifest.ttl'
    const oldManifest = createSourceIndexManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl',
      sourceUri,
      sourceHash: 'sha256-pdf-old',
      ingestVersion: 'pdf-parser-v1',
      status: 'partial',
      indexedRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
      pendingRanges: [{ start: 'chunk:2', end: 'chunk:*' }],
      priorityQueue: ['chunk:2'],
      readChunks: 1,
      totalChunks: 0,
      manifestUri,
    })
    const ingestAdapter = vi.fn().mockResolvedValue({
      markdown: '# Refreshed Report\n\nFresh OCR body.',
      sourceHash: 'sha256-pdf-ocr-new',
      mimeType: 'text/markdown',
      totalChunks: 1,
      pendingRanges: [],
      priorityQueue: [],
    })
    vi.stubGlobal('fetch', vi.fn())
    mocks.sessionFetch.mockResolvedValueOnce(new Response(sourceBytes, {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }))
    mocks.readRawTextResource.mockResolvedValueOnce({
      uri: manifestUri,
      content: renderSourceIndexManifestTurtle(oldManifest),
      mimeType: 'text/turtle',
      etag: '"manifest-1"',
      headers: { etag: '"manifest-1"', 'content-type': 'text/turtle' },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useRefreshSourceLinkedCard(), { wrapper })

    let refreshPlan: Awaited<ReturnType<typeof result.current.mutateAsync>>
    await act(async () => {
      refreshPlan = await result.current.mutateAsync({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl',
        subject: 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl#card',
        targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.md',
        sourceUri,
        sourceKind: 'pdf',
        title: 'Report',
        mimeType: 'application/pdf',
        currentSourceHash: 'sha256-pdf-old',
        ingestVersion: 'pdf-parser-v1',
        sourceIngestManifestUri: manifestUri,
        ingestAdapter,
      })
    })

    expect(ingestAdapter).toHaveBeenCalledTimes(1)
    expect(ingestAdapter.mock.calls[0]?.[0]).toMatchObject({
      sourceUri,
      sourceKind: 'pdf',
      mimeType: 'application/pdf',
      title: 'Report',
    })
    expect(Array.from(ingestAdapter.mock.calls[0]?.[0].bytes)).toEqual(Array.from(sourceBytes))
    expect(refreshPlan!).toMatchObject({
      action: 'changed',
      sourceProposal: expect.objectContaining({
        sourceHash: 'sha256-pdf-ocr-new',
        proposedContent: expect.stringContaining('Fresh OCR body.'),
        writesCanonicalContent: false,
      }),
    })
    expect(mocks.createRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      {
        uri: refreshPlan!.sourceProposal!.proposalResourceUri,
        mimeType: 'text/turtle',
      },
      expect.stringContaining('Fresh OCR body.'),
    )
    expect(mocks.saveRawTextResource).not.toHaveBeenCalledWith(
      { id: 'db' },
      expect.objectContaining({ uri: 'https://pod.example/.data/workspaces/ws-1/cards/report.md' }),
      expect.any(String),
    )
  })

  it('refreshes a changed PDF source through an injected Ingest adapter without writing canonical body', async () => {
    const sourceUri = 'https://pod.example/public/report.pdf'
    const sourceBytes = new Uint8Array([37, 80, 68, 70, 45, 52])
    const manifestUri = 'https://pod.example/.data/ingest/sources/pod-example-public-report-pdf-01rzlsa/manifest.ttl'
    const oldManifest = createSourceIngestManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl',
      sourceUri,
      sourceHash: 'sha256-pdf-old',
      ingestVersion: 'pdf-ingest-v1',
      status: 'partial',
      ingestedRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
      pendingRanges: [{ start: 'chunk:2', end: 'chunk:*' }],
      priorityQueue: ['chunk:2'],
      readChunks: 1,
      totalChunks: 0,
      manifestUri,
    })
    const ingestAdapter = vi.fn().mockResolvedValue({
      markdown: '# Refreshed Report\n\nFresh Ingest adapter body.',
      sourceHash: 'sha256-pdf-ingest-adapter-new',
      mimeType: 'text/markdown',
      totalChunks: 1,
      pendingRanges: [],
      priorityQueue: [],
    })
    vi.stubGlobal('fetch', vi.fn())
    mocks.sessionFetch.mockResolvedValueOnce(new Response(sourceBytes, {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }))
    mocks.readRawTextResource.mockResolvedValueOnce({
      uri: manifestUri,
      content: renderSourceIngestManifestTurtle(oldManifest),
      mimeType: 'text/turtle',
      etag: '"manifest-1"',
      headers: { etag: '"manifest-1"', 'content-type': 'text/turtle' },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useRefreshSourceLinkedCard(), { wrapper })

    let refreshPlan: Awaited<ReturnType<typeof result.current.mutateAsync>>
    await act(async () => {
      refreshPlan = await result.current.mutateAsync({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl',
        subject: 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl#card',
        targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.md',
        sourceUri,
        sourceKind: 'pdf',
        title: 'Report',
        mimeType: 'application/pdf',
        currentSourceHash: 'sha256-pdf-old',
        ingestVersion: 'pdf-ingest-v1',
        sourceIngestManifestUri: manifestUri,
        ingestAdapter,
      })
    })

    expect(ingestAdapter).toHaveBeenCalledTimes(1)
    expect(ingestAdapter.mock.calls[0]?.[0]).toMatchObject({
      sourceUri,
      sourceKind: 'pdf',
      mimeType: 'application/pdf',
      title: 'Report',
    })
    expect(Array.from(ingestAdapter.mock.calls[0]?.[0].bytes)).toEqual(Array.from(sourceBytes))
    expect(refreshPlan!).toMatchObject({
      action: 'changed',
      sourceIngestManifestUri: manifestUri,
      sourceProposal: expect.objectContaining({
        sourceHash: 'sha256-pdf-ingest-adapter-new',
        proposedContent: expect.stringContaining('Fresh Ingest adapter body.'),
        writesCanonicalContent: false,
      }),
    })
    expect(mocks.createRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      {
        uri: refreshPlan!.sourceProposal!.proposalResourceUri,
        mimeType: 'text/turtle',
      },
      expect.stringContaining('Fresh Ingest adapter body.'),
    )
    expect(mocks.saveRawTextResource).not.toHaveBeenCalledWith(
      { id: 'db' },
      expect.objectContaining({ uri: 'https://pod.example/.data/workspaces/ws-1/cards/report.md' }),
      expect.any(String),
    )
  })

  it('does not overwrite an existing pending source proposal when a refreshed URL changed again', async () => {
    const sourceUri = 'https://example.com/release-notes'
    const sourceHtml = '<html><head><title>Release Notes v3</title></head><body><main><p>Newer source body.</p></main></body></html>'
    const sourceHash = stableSourceHash(sourceHtml)
    const manifestUri = 'https://pod.example/.data/index/sources/example-com-release-notes-01rzlsa/manifest.ttl'
    const oldManifest = createSourceIndexManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
      sourceUri,
      sourceHash: 'fnv1a-old',
      ingestVersion: 'url-parser-v1',
      status: 'complete',
      indexedRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
      pendingRanges: [],
      priorityQueue: [],
      readChunks: 1,
      totalChunks: 1,
      manifestUri,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      text: async () => sourceHtml,
    }))
    mocks.readRawTextResource
      .mockResolvedValueOnce({
        uri: manifestUri,
        content: renderSourceIndexManifestTurtle(oldManifest),
        mimeType: 'text/turtle',
        etag: '"manifest-1"',
        headers: { etag: '"manifest-1"', 'content-type': 'text/turtle' },
      })
    mocks.createRawTextResource.mockRejectedValueOnce(new Error('HTTP 409'))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useRefreshSourceLinkedCard(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
        subject: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl#card',
        targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.md',
        sourceUri,
        sourceKind: 'url',
        title: 'Release Notes',
        mimeType: 'text/html',
        currentSourceHash: 'fnv1a-old',
        ingestVersion: 'url-parser-v1',
        sourceIngestManifestUri: manifestUri,
      })).rejects.toThrow('HTTP 409')
    })

    expect(mocks.createRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      {
        uri: expect.stringMatching(/^https:\/\/pod\.example\/\.data\/proposals\/source\/https-pod-example-data-workspaces-ws-1-cards-release-notes-card-ttl-card-https-example-com-release-notes-[a-z0-9]{7}\.ttl$/),
        mimeType: 'text/turtle',
      },
      expect.stringContaining('Newer source body.'),
    )
    expect(mocks.saveRawTextResource).not.toHaveBeenCalledWith(
      { id: 'db' },
      expect.objectContaining({
        uri: expect.stringMatching(/\/\.data\/proposals\/source\//),
      }),
      expect.any(String),
    )
    expect(mocks.saveRawTextResource).not.toHaveBeenCalledWith(
      { id: 'db' },
      expect.objectContaining({ uri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.md' }),
      expect.any(String),
    )
    expect(mocks.createSourceUpdateProposalInboxApproval).not.toHaveBeenCalled()
  })

  it('queues a legacy source index range through the Ingest hook', async () => {
    const manifest = createSourceIndexManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/index.ttl',
      sourceUri: 'https://example.com/report.pdf',
      sourceHash: 'sha256-report',
      ingestVersion: 'pdf-parser-v1',
      ingestedRanges: [{ start: 'page:1', end: 'page:3' }],
      pendingRanges: [{ start: 'page:4', end: 'page:12' }],
      priorityQueue: [],
      readChunks: 3,
      totalChunks: 12,
      manifestUri: 'https://pod.example/.data/index/sources/report/manifest.ttl',
    })
    mocks.readRawTextResource.mockResolvedValue({
      uri: manifest.manifestUri,
      content: renderSourceIndexManifestTurtle(manifest),
      mimeType: 'text/turtle',
      etag: '"manifest-1"',
      headers: { etag: '"manifest-1"', 'content-type': 'text/turtle' },
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useRequestSourceIngestRange(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        manifest,
        range: { start: 'page:4', end: 'page:12' },
      })
    })

    expect(mocks.saveRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      expect.objectContaining({ uri: manifest.manifestUri }),
      expect.stringContaining('udfs:priorityQueue "page:4..page:12"'),
    )
    const savedSource = mocks.saveRawTextResource.mock.calls[0]?.[2] as string
    expect(savedSource).toContain('udfs:SourceIngestManifest')
    expect(savedSource).not.toContain('udfs:parserStatus')
    expect(savedSource).not.toContain('udfs:lastParsedAt')
  })

  it('queues an Ingest range through the Ingest-named hook', async () => {
    const manifest = createSourceIngestManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/index.ttl',
      sourceUri: 'https://example.com/report.pdf',
      sourceHash: 'sha256-report',
      ingestVersion: 'pdf-ingest-v1',
      ingestedRanges: [{ start: 'page:1', end: 'page:3' }],
      pendingRanges: [{ start: 'page:4', end: 'page:12' }],
      priorityQueue: [],
      readChunks: 3,
      totalChunks: 12,
      manifestUri: 'https://pod.example/.data/ingest/sources/report/manifest.ttl',
    })
    mocks.readRawTextResource.mockResolvedValue({
      uri: manifest.manifestUri,
      content: renderSourceIngestManifestTurtle(manifest),
      mimeType: 'text/turtle',
      etag: '"manifest-1"',
      headers: { etag: '"manifest-1"', 'content-type': 'text/turtle' },
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useRequestSourceIngestRange(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        manifest,
        range: { start: 'page:4', end: 'page:12' },
      })
    })

    expect(mocks.saveRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      expect.objectContaining({ uri: manifest.manifestUri }),
      expect.stringContaining('udfs:priorityQueue "page:4..page:12"'),
    )
  })

  it('queues all requested Ingest ranges through the Ingest-named hook', async () => {
    const firstRange = { start: 'bytes:4096', end: 'bytes:8191' }
    const secondRange = { start: 'bytes:8192', end: 'bytes:12287' }
    const manifest = createSourceIngestManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/index.ttl',
      sourceUri: 'https://example.com/report.pdf',
      sourceHash: 'sha256-report',
      ingestVersion: 'pdf-ingest-v1',
      ingestedRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
      pendingRanges: [firstRange, secondRange],
      priorityQueue: [],
      readChunks: 1,
      totalChunks: 3,
      manifestUri: 'https://pod.example/.data/ingest/sources/report/manifest.ttl',
    })
    mocks.readRawTextResource.mockResolvedValue({
      uri: manifest.manifestUri,
      content: renderSourceIngestManifestTurtle(manifest),
      mimeType: 'text/turtle',
      etag: '"manifest-1"',
      headers: { etag: '"manifest-1"', 'content-type': 'text/turtle' },
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useRequestSourceIngestRange(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        manifest,
        ranges: [firstRange, secondRange],
      })
    })

    expect(mocks.saveRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      expect.objectContaining({ uri: manifest.manifestUri }),
      expect.stringMatching(/udfs:priorityQueue "bytes:4096\.\.bytes:8191"[\s\S]*udfs:priorityQueue "bytes:8192\.\.bytes:12287"/),
    )
  })

  it('marks a legacy source index range ingested through the Ingest hook', async () => {
    const manifest = createSourceIndexManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/index.ttl',
      sourceUri: 'https://example.com/report.pdf',
      sourceHash: 'sha256-report',
      ingestVersion: 'pdf-parser-v1',
      ingestedRanges: [{ start: 'page:1', end: 'page:3' }],
      pendingRanges: [{ start: 'page:4', end: 'page:12' }],
      priorityQueue: ['page:4..page:12'],
      readChunks: 3,
      totalChunks: 12,
      manifestUri: 'https://pod.example/.data/index/sources/report/manifest.ttl',
    })
    mocks.readRawTextResource.mockResolvedValue({
      uri: manifest.manifestUri,
      content: renderSourceIndexManifestTurtle(manifest),
      mimeType: 'text/turtle',
      etag: '"manifest-1"',
      headers: { etag: '"manifest-1"', 'content-type': 'text/turtle' },
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useMarkSourceIngestRangeIngested(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        manifest,
        range: { start: 'page:4', end: 'page:12' },
        ingestedAt: '2026-06-18T04:00:00.000Z',
      })
    })

    const savedSource = mocks.saveRawTextResource.mock.calls[0]?.[2] as string
    expect(savedSource).toContain('udfs:SourceIngestManifest')
    expect(savedSource).toContain('udfs:ingestStatus "complete"')
    expect(savedSource).toContain('udfs:ingestedRange "page:4..page:12"')
    expect(savedSource).toContain('udfs:lastIngestedAt "2026-06-18T04:00:00.000Z"')
    expect(savedSource).not.toContain('udfs:parserStatus')
    expect(savedSource).not.toContain('udfs:parsedRange')
    expect(savedSource).not.toContain('udfs:lastParsedAt')
    expect(mocks.sourceIngestInvalidateManifest).toHaveBeenCalledWith(queryClient, {
      action: 'marked-ingested',
      manifest: expect.objectContaining({ manifestUri: manifest.manifestUri }),
    })
  })

  it('marks an Ingest range ingested through the Ingest-named hook', async () => {
    const manifest = createSourceIngestManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/index.ttl',
      sourceUri: 'https://example.com/report.pdf',
      sourceHash: 'sha256-report',
      ingestVersion: 'pdf-ingest-v1',
      ingestedRanges: [{ start: 'page:1', end: 'page:3' }],
      pendingRanges: [{ start: 'page:4', end: 'page:12' }],
      priorityQueue: ['page:4..page:12'],
      readChunks: 3,
      totalChunks: 12,
      manifestUri: 'https://pod.example/.data/ingest/sources/report/manifest.ttl',
    })
    mocks.readRawTextResource.mockResolvedValue({
      uri: manifest.manifestUri,
      content: renderSourceIngestManifestTurtle(manifest),
      mimeType: 'text/turtle',
      etag: '"manifest-1"',
      headers: { etag: '"manifest-1"', 'content-type': 'text/turtle' },
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const { result } = renderHook(() => useMarkSourceIngestRangeIngested(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        manifest,
        range: { start: 'page:4', end: 'page:12' },
        ingestedAt: '2026-06-18T04:00:00.000Z',
      })
    })

    const savedSource = mocks.saveRawTextResource.mock.calls[0]?.[2] as string
    expect(savedSource).toContain('udfs:ingestedRange "page:4..page:12"')
    expect(savedSource).toContain('udfs:lastIngestedAt "2026-06-18T04:00:00.000Z"')
    expect(mocks.sourceIngestInvalidateManifest).toHaveBeenCalledWith(queryClient, {
      action: 'marked-ingested',
      manifest: expect.objectContaining({ manifestUri: manifest.manifestUri }),
    })
  })

  it('creates an AI change proposal through the Files proposal collection boundary', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const proposal = createAiChangeProposal({
      targetResourceUri: 'https://pod.example/public/report.md',
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: 'https://pod.example/public/report.md',
      proposedContent: '# AI replacement',
      summary: 'AI replacement pending review.',
      diff: '+ AI replacement',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const { result } = renderHook(() => useCreateAiChangeProposal(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(proposal)
    })

    expect(mocks.aiChangeProposalCreate).toHaveBeenCalledWith({
      db: { id: 'db' },
      actorWebId: 'https://pod.example/profile#me',
      proposal,
    })
    expect(mocks.createRawTextResource).not.toHaveBeenCalledWith(
      { id: 'db' },
      expect.objectContaining({ uri: proposal.proposalResourceUri }),
      expect.any(String),
    )
    expect(mocks.createAiChangeProposalInboxApproval).not.toHaveBeenCalled()
    expect(mocks.aiChangeProposalInvalidateCreate).toHaveBeenCalledWith(queryClient, proposal)
  })

  it('reads pending structured cell proposals through the Files collection boundary', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const proposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'title',
      previousValues: ['"Files"'],
      nextValues: ['"Draft title"'],
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    mocks.structuredCellProposalFetchByDocument.mockResolvedValue([proposal])

    const { result } = renderHook(
      () => usePendingStructuredCellChangeProposals('https://pod.example/.data/workspaces/ws-1/state.ttl'),
      { wrapper },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mocks.structuredCellProposalQueryKey).toHaveBeenCalledWith('https://pod.example/.data/workspaces/ws-1/state.ttl')
    expect(mocks.structuredCellProposalFetchByDocument).toHaveBeenCalledWith('https://pod.example/.data/workspaces/ws-1/state.ttl', { id: 'db' })
    expect(mocks.fetchApprovals).not.toHaveBeenCalled()
    expect(mocks.readRawTextResource).not.toHaveBeenCalled()
    expect(result.current.data).toEqual([proposal])
  })

  it('optimistically stages structured cell proposals and rolls back when collection create fails', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const existingProposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Other',
      predicate: 'title',
      previousValues: ['"Other"'],
      nextValues: ['"Other draft"'],
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const proposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'title',
      previousValues: ['"Files"'],
      nextValues: ['"Draft title"'],
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const queryKey = ['files', 'structured-cell-proposals', proposal.documentUri] as const
    queryClient.setQueryData(queryKey, [existingProposal])
    mocks.structuredCellProposalCreate.mockRejectedValueOnce(new Error('proposal write failed'))

    const { result } = renderHook(() => useCreateStructuredCellChangeProposal(), { wrapper })

    await expect(act(async () => {
      await result.current.mutateAsync(proposal)
    })).rejects.toThrow('proposal write failed')

    expect(mocks.structuredCellProposalCreate).toHaveBeenCalledWith({
      db: { id: 'db' },
      actorWebId: 'https://pod.example/profile#me',
      proposal,
    })
    expect(mocks.structuredCellProposalCacheStageCreate).toHaveBeenCalledWith(queryClient, proposal)
    expect(mocks.structuredCellProposalCacheRestore).toHaveBeenCalledWith(queryClient, {
      queryKey,
      previous: [existingProposal],
    })
    expect(queryClient.getQueryData(queryKey)).toEqual([existingProposal])
    expect(mocks.structuredCellProposalInvalidateCreate).toHaveBeenCalledWith(queryClient, proposal)
  })

  it('optimistically stages non-cell proposal hook caches and rolls back failed writes', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const vocabProposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short summary.',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const accessProposal = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/report.md',
      activePolicyUri: 'https://pod.example/public/report.md.acl',
      targetPolicyUri: 'https://pod.example/public/report.md.acl',
      provider: 'acl',
      audience: 'agent',
      audienceRef: 'https://agent.example/profile#me',
      role: 'editor',
      modes: ['read', 'append', 'write'],
      reason: 'Allow agent edits.',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const sourceProposal = createSourceUpdateProposal({
      documentUri: vocabProposal.documentUri,
      subject: '#card',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.md',
      sourceUri: 'https://pod.example/public/report.pdf',
      sourceIngestManifestUri: 'https://pod.example/.data/ingest/sources/report/manifest.ttl',
      sourceHash: 'sha256-new',
      ingestVersion: 'pdf-ingest-v1',
      snapshotAt: '2026-06-18T00:00:00.000Z',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const aiProposal = createAiChangeProposal({
      targetResourceUri: 'https://pod.example/public/report.md',
      documentUri: vocabProposal.documentUri,
      proposedContent: '# AI replacement',
      summary: 'AI replacement pending review.',
      diff: '+ AI replacement',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const vocabKey = ['files', 'vocab-term-proposals', vocabProposal.documentUri] as const
    const accessKey = ['files', 'access-policy-proposals', accessProposal.ownerUri] as const
    const sourceKey = ['files', 'source-update-proposals', sourceProposal.documentUri] as const
    const aiKey = ['files', 'ai-change-proposals', aiProposal.targetResourceUri] as const
    queryClient.setQueryData(vocabKey, [])
    queryClient.setQueryData(accessKey, [])
    queryClient.setQueryData(sourceKey, [])
    queryClient.setQueryData(aiKey, [])

    const vocabHook = renderHook(() => useCreateVocabTermProposalInboxApproval(), { wrapper })
    const accessHook = renderHook(() => useCreateAccessPolicyProposal(), { wrapper })
    const sourceHook = renderHook(() => useCreateSourceUpdateProposal(), { wrapper })
    const aiHook = renderHook(() => useCreateAiChangeProposal(), { wrapper })

    await act(async () => {
      await vocabHook.result.current.mutateAsync(vocabProposal)
      await accessHook.result.current.mutateAsync(accessProposal)
      await sourceHook.result.current.mutateAsync(sourceProposal)
      await aiHook.result.current.mutateAsync(aiProposal)
    })

    expect(queryClient.getQueryData(vocabKey)).toEqual([vocabProposal])
    expect(queryClient.getQueryData(accessKey)).toEqual([accessProposal])
    expect(queryClient.getQueryData(sourceKey)).toEqual([sourceProposal])
    expect(queryClient.getQueryData(aiKey)).toEqual([aiProposal])

    mocks.vocabTermProposalCreate.mockRejectedValueOnce(new Error('vocab write failed'))
    mocks.accessPolicyProposalCreate.mockRejectedValueOnce(new Error('access write failed'))
    mocks.sourceUpdateProposalCreate.mockRejectedValueOnce(new Error('source write failed'))
    mocks.aiChangeProposalCreate.mockRejectedValueOnce(new Error('ai write failed'))

    await expect(act(async () => {
      await vocabHook.result.current.mutateAsync(vocabProposal)
    })).rejects.toThrow('vocab write failed')
    await expect(act(async () => {
      await accessHook.result.current.mutateAsync(accessProposal)
    })).rejects.toThrow('access write failed')
    await expect(act(async () => {
      await sourceHook.result.current.mutateAsync(sourceProposal)
    })).rejects.toThrow('source write failed')
    await expect(act(async () => {
      await aiHook.result.current.mutateAsync(aiProposal)
    })).rejects.toThrow('ai write failed')

    expect(queryClient.getQueryData(vocabKey)).toEqual([vocabProposal])
    expect(queryClient.getQueryData(accessKey)).toEqual([accessProposal])
    expect(queryClient.getQueryData(sourceKey)).toEqual([sourceProposal])
    expect(queryClient.getQueryData(aiKey)).toEqual([aiProposal])
  })

  it('reads pending vocab term proposals for the selected document from Inbox targets', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const proposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/.vocab/terms.ttl#core',
      termKind: 'enum-option',
      predicate: '#tags',
      label: 'core',
      valueType: 'enum-option',
      description: 'Core topic.',
      shape: 'predicate #tags',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    mocks.vocabTermProposalFetchByDocument.mockResolvedValue([proposal])

    const { result } = renderHook(
      () => usePendingVocabTermProposals('https://pod.example/.data/workspaces/ws-1/state.ttl'),
      { wrapper },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mocks.vocabTermProposalQueryKey).toHaveBeenCalledWith('https://pod.example/.data/workspaces/ws-1/state.ttl')
    expect(mocks.vocabTermProposalFetchByDocument).toHaveBeenCalledWith('https://pod.example/.data/workspaces/ws-1/state.ttl', { id: 'db' })
    expect(mocks.fetchApprovals).not.toHaveBeenCalled()
    expect(mocks.readRawTextResource).not.toHaveBeenCalled()
    expect(result.current.data).toEqual([proposal])
  })

  it('reads pending source update proposals for the selected document from Inbox targets', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const proposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      targetResourceUri: 'https://pod.example/.data/workspaces/docs/report.md',
      sourceUri: 'https://pod.example/public/source.pdf',
      sourceIngestManifestUri: 'https://pod.example/.data/index/sources/pod-example-public-source-0htirth/manifest.ttl',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    mocks.sourceUpdateProposalFetchByDocument.mockResolvedValue([proposal])

    const { result } = renderHook(
      () => usePendingSourceUpdateProposals('https://pod.example/.data/workspaces/ws-1/state.ttl'),
      { wrapper },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mocks.sourceUpdateProposalQueryKey).toHaveBeenCalledWith('https://pod.example/.data/workspaces/ws-1/state.ttl')
    expect(mocks.sourceUpdateProposalFetchByDocument).toHaveBeenCalledWith('https://pod.example/.data/workspaces/ws-1/state.ttl', { id: 'db' })
    expect(mocks.fetchApprovals).not.toHaveBeenCalled()
    expect(mocks.readRawTextResource).not.toHaveBeenCalled()
    expect(result.current.data).toEqual([proposal])
  })

  it('reads pending access policy proposals for the selected owner from Inbox targets', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
    const proposal = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/README.md',
      activePolicyUri: 'https://pod.example/public/README.md.acl',
      targetPolicyUri: 'https://pod.example/public/README.md.acl',
      provider: 'acl',
      audience: 'agent',
      audienceRef: 'https://agent.example/profile#me',
      role: 'editor',
      modes: ['read', 'append', 'write'],
      reason: 'Hydrate existing pending access proposal.',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    mocks.accessPolicyProposalFetchByOwner.mockResolvedValue([proposal])

    const { result } = renderHook(
      () => usePendingAccessPolicyProposals('https://pod.example/public/README.md'),
      { wrapper },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mocks.accessPolicyProposalQueryKey).toHaveBeenCalledWith('https://pod.example/public/README.md')
    expect(mocks.accessPolicyProposalFetchByOwner).toHaveBeenCalledWith('https://pod.example/public/README.md', { id: 'db' })
    expect(mocks.fetchApprovals).not.toHaveBeenCalled()
    expect(mocks.readRawTextResource).not.toHaveBeenCalled()
    expect(result.current.data).toEqual([proposal])
  })



})
