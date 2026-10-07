import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { SolidDatabase } from '@undefineds.co/models'
import {
  FILES_ACCESS_APPROVAL_ACTION,
  FILES_ACCESS_APPROVAL_TOOL_NAME,
  parseAccessPolicyProposalTurtle,
  type AccessPolicyProposal,
} from '../../domain/proposal/access-approval-model'
import {
  type AiChangeProposal,
} from '../../domain/proposal/ai-change-approval-model'
import {
  FILES_STRUCTURED_CELL_APPROVAL_ACTION,
  FILES_STRUCTURED_CELL_APPROVAL_TOOL_NAME,
  parseStructuredCellChangeProposalTurtle,
  type StructuredCellChangeProposal,
} from '../../domain/proposal/structured-cell-approval-model'
import {
  FILES_SOURCE_APPROVAL_ACTION,
  FILES_SOURCE_APPROVAL_TOOL_NAME,
  parseSourceUpdateProposalTurtle,
  type SourceUpdateProposal,
} from '../../domain/source/source-approval-model'
import {
  FILES_VOCAB_APPROVAL_ACTION,
  FILES_VOCAB_APPROVAL_TOOL_NAME,
  parseVocabTermProposalTurtle,
  type VocabTermProposal,
} from '../../domain/structured/structured-table'
import type { FilesRawTextResource } from '../../domain/resource/resource-model'
import type { createFilesResourceCacheInvalidationCollection } from '../cache/files-query-invalidation'
import {
  createFilesProposalWithCache,
  createScopedFilesProposalCacheCollection,
} from '../cache/proposal-query-cache'
import { accessPolicyProposalUseCases } from '../proposal/access-policy-proposal-use-cases'
import { aiChangeProposalUseCases } from '../proposal/ai-change-proposal-use-cases'
import {
  proposalQueryUseCases,
  type PendingApprovalProjection,
} from '../proposal/proposal-query-use-cases'
import { sourceUpdateProposalUseCases } from '../proposal/source-update-proposal-use-cases'
import { structuredCellProposalUseCases } from '../proposal/structured-cell-proposal-use-cases'
import { vocabTermProposalUseCases } from '../proposal/vocab-term-proposal-use-cases'

type FilesResourceCacheInvalidationCollection = ReturnType<typeof createFilesResourceCacheInvalidationCollection>

type ProposalCollectionQueryKeys = {
  structuredCellProposals: QueryKey
  vocabTermProposals: QueryKey
  sourceUpdateProposals: QueryKey
  accessPolicyProposals: QueryKey
  aiChangeProposals: QueryKey
}

interface FilesResourceQueryOptions<TData> {
  queryKey: QueryKey
  queryFn: () => Promise<TData>
  enabled: boolean
}

export interface ProposalCollectionsDependencies {
  getDb: () => SolidDatabase | null
  queryClient: QueryClient
  queryKeys: ProposalCollectionQueryKeys
  filesResourceCacheInvalidationCollection: FilesResourceCacheInvalidationCollection
  fetchApprovals: () => Promise<PendingApprovalProjection[]>
}

export function createProposalCollections(dependencies: ProposalCollectionsDependencies) {
  const {
    getDb,
    queryClient,
    queryKeys,
    filesResourceCacheInvalidationCollection,
    fetchApprovals,
  } = dependencies

  async function queryPendingProposalResources<T>(
    db: SolidDatabase,
    options: {
      toolName: string
      action: string
      parse: (source: string, resourceUri: string) => T
      isMatch: (proposal: T) => boolean
    },
  ): Promise<T[]> {
    return proposalQueryUseCases.fetchPendingProposals(db, {
      ...options,
      fetchApprovals,
    })
  }

  const structuredCellProposalCollection = {
    queryKey(documentUri: string): QueryKey {
      return [...queryKeys.structuredCellProposals, documentUri]
    },

    async fetchByDocument(documentUri: string, dbOverride?: SolidDatabase | null): Promise<StructuredCellChangeProposal[]> {
      const db = dbOverride ?? getDb()
      const normalizedDocumentUri = documentUri.trim()
      if (!db || !normalizedDocumentUri) return []

      return queryPendingProposalResources(db, {
        toolName: FILES_STRUCTURED_CELL_APPROVAL_TOOL_NAME,
        action: FILES_STRUCTURED_CELL_APPROVAL_ACTION,
        parse: parseStructuredCellChangeProposalTurtle,
        isMatch: (proposal) => (
          proposal.documentUri === normalizedDocumentUri
          && proposal.status === 'pending'
        ),
      })
    },

    async create(input: {
      db?: SolidDatabase | null
      proposal: StructuredCellChangeProposal
      actorWebId: string
    }): Promise<string> {
      return structuredCellProposalUseCases.create({
        ...input,
        db: input.db ?? getDb(),
      })
    },

    async createWithCache(input: {
      cacheClient: QueryClient
      db?: SolidDatabase | null
      proposal: StructuredCellChangeProposal
      actorWebId: string
    }): Promise<string> {
      return createFilesProposalWithCache({
        cacheClient: input.cacheClient,
        queryKey: structuredCellProposalCollection.queryKey(input.proposal.documentUri),
        proposal: input.proposal,
        create: () => structuredCellProposalCollection.create({
          db: input.db,
          actorWebId: input.actorWebId,
          proposal: input.proposal,
        }),
        invalidate: () => structuredCellProposalCollection.invalidateCreate(input.cacheClient, input.proposal),
      })
    },

    async invalidate(cacheClientOrDocumentUri?: QueryClient | string, documentUri?: string) {
      const cacheClient = typeof cacheClientOrDocumentUri === 'string' || !cacheClientOrDocumentUri
        ? queryClient
        : cacheClientOrDocumentUri
      const targetDocumentUri = typeof cacheClientOrDocumentUri === 'string'
        ? cacheClientOrDocumentUri
        : documentUri
      await filesResourceCacheInvalidationCollection.invalidateProposalList(cacheClient, {
        proposalQueryKey: targetDocumentUri
          ? structuredCellProposalCollection.queryKey(targetDocumentUri)
          : queryKeys.structuredCellProposals,
      })
    },

    async invalidateCreate(cacheClient: QueryClient, proposal: StructuredCellChangeProposal) {
      await filesResourceCacheInvalidationCollection.invalidateProposalCreate(cacheClient, {
        proposalResourceUri: proposal.proposalResourceUri,
        detailResourceUris: [proposal.documentUri],
        proposalQueryKey: structuredCellProposalCollection.queryKey(proposal.documentUri),
      })
    },
  }

  const structuredCellProposalCacheCollection =
    createScopedFilesProposalCacheCollection<StructuredCellChangeProposal>(
      (proposal) => structuredCellProposalCollection.queryKey(proposal.documentUri),
    )

  const vocabTermProposalCollection = {
    queryKey(documentUri: string): QueryKey {
      return [...queryKeys.vocabTermProposals, documentUri]
    },

    async fetchByDocument(documentUri: string, dbOverride?: SolidDatabase | null): Promise<VocabTermProposal[]> {
      const db = dbOverride ?? getDb()
      const normalizedDocumentUri = documentUri.trim()
      if (!db || !normalizedDocumentUri) return []

      return queryPendingProposalResources(db, {
        toolName: FILES_VOCAB_APPROVAL_TOOL_NAME,
        action: FILES_VOCAB_APPROVAL_ACTION,
        parse: parseVocabTermProposalTurtle,
        isMatch: (proposal) => (
          proposal.documentUri === normalizedDocumentUri
          && proposal.status === 'pending'
        ),
      })
    },

    async create(input: {
      db?: SolidDatabase | null
      proposal: VocabTermProposal
      actorWebId: string
    }): Promise<string> {
      return vocabTermProposalUseCases.create({
        ...input,
        db: input.db ?? getDb(),
      })
    },

    async createWithCache(input: {
      cacheClient: QueryClient
      db?: SolidDatabase | null
      proposal: VocabTermProposal
      actorWebId: string
    }): Promise<string> {
      return createFilesProposalWithCache({
        cacheClient: input.cacheClient,
        queryKey: vocabTermProposalCollection.queryKey(input.proposal.documentUri),
        proposal: input.proposal,
        create: () => vocabTermProposalCollection.create({
          db: input.db,
          actorWebId: input.actorWebId,
          proposal: input.proposal,
        }),
        invalidate: () => vocabTermProposalCollection.invalidateCreate(input.cacheClient, input.proposal),
      })
    },

    async approve(proposal: VocabTermProposal, dbOverride?: SolidDatabase | null): Promise<FilesRawTextResource> {
      return vocabTermProposalUseCases.approve({
        db: dbOverride ?? getDb(),
        proposal,
      })
    },

    async approveWithCache(input: {
      cacheClient: QueryClient
      db?: SolidDatabase | null
      proposal: VocabTermProposal
    }): Promise<FilesRawTextResource> {
      const resource = await vocabTermProposalCollection.approve(input.proposal, input.db)
      await vocabTermProposalCollection.invalidateApproval(input.cacheClient, resource)
      return resource
    },

    async invalidateApproval(cacheClient: QueryClient, resource: Pick<FilesRawTextResource, 'uri'>) {
      const shapesUri = resource.uri.replace(/terms\.ttl$/, 'shapes.ttl')
      const namespacesUri = resource.uri.replace(/terms\.ttl$/, 'namespaces.ttl')
      await filesResourceCacheInvalidationCollection.invalidateVocabApproval(cacheClient, {
        termsResourceUri: resource.uri,
        shapesResourceUri: shapesUri,
        namespacesResourceUri: namespacesUri,
      })
    },

    async invalidateCreate(cacheClient: QueryClient, proposal: VocabTermProposal) {
      const namespacesUri = proposal.targetVocabUri.replace(/terms\.ttl$/, 'namespaces.ttl')
      await filesResourceCacheInvalidationCollection.invalidateProposalCreate(cacheClient, {
        proposalResourceUri: proposal.proposalResourceUri,
        rawTextResourceUris: [
          proposal.targetVocabUri,
          proposal.targetShapesUri,
          namespacesUri,
        ],
        detailResourceUris: [
          proposal.targetVocabUri,
          proposal.targetShapesUri,
          namespacesUri,
        ],
        proposalQueryKey: vocabTermProposalCollection.queryKey(proposal.documentUri),
      })
    },
  }

  const accessPolicyProposalCollection = {
    queryKey(ownerUri: string): QueryKey {
      return [...queryKeys.accessPolicyProposals, ownerUri]
    },

    async fetchByOwner(ownerUri: string, dbOverride?: SolidDatabase | null): Promise<AccessPolicyProposal[]> {
      const db = dbOverride ?? getDb()
      const normalizedOwnerUri = ownerUri.trim()
      if (!db || !normalizedOwnerUri) return []

      return queryPendingProposalResources(db, {
        toolName: FILES_ACCESS_APPROVAL_TOOL_NAME,
        action: FILES_ACCESS_APPROVAL_ACTION,
        parse: parseAccessPolicyProposalTurtle,
        isMatch: (proposal) => (
          proposal.ownerUri === normalizedOwnerUri
          && proposal.status === 'pending'
        ),
      })
    },

    async create(input: {
      db?: SolidDatabase | null
      proposal: AccessPolicyProposal
      actorWebId: string
    }): Promise<string> {
      return accessPolicyProposalUseCases.create({
        ...input,
        db: input.db ?? getDb(),
      })
    },

    async createWithCache(input: {
      cacheClient: QueryClient
      db?: SolidDatabase | null
      proposal: AccessPolicyProposal
      actorWebId: string
    }): Promise<string> {
      return createFilesProposalWithCache({
        cacheClient: input.cacheClient,
        queryKey: accessPolicyProposalCollection.queryKey(input.proposal.ownerUri),
        proposal: input.proposal,
        create: () => accessPolicyProposalCollection.create({
          db: input.db,
          actorWebId: input.actorWebId,
          proposal: input.proposal,
        }),
        invalidate: () => accessPolicyProposalCollection.invalidateCreate(input.cacheClient, input.proposal),
      })
    },

    async invalidateCreate(cacheClient: QueryClient, proposal: AccessPolicyProposal) {
      await filesResourceCacheInvalidationCollection.invalidateProposalCreate(cacheClient, {
        proposalResourceUri: proposal.proposalResourceUri,
        accessBasicsTargets: [
          {
            uri: proposal.ownerUri,
            kind: proposal.ownerUri.endsWith('/') ? 'container' : 'resource',
          },
        ],
        proposalQueryKey: accessPolicyProposalCollection.queryKey(proposal.ownerUri),
      })
    },
  }

  const sourceUpdateProposalCollection = {
    queryKey(documentUri: string): QueryKey {
      return [...queryKeys.sourceUpdateProposals, documentUri]
    },

    async fetchByDocument(documentUri: string, dbOverride?: SolidDatabase | null): Promise<SourceUpdateProposal[]> {
      const db = dbOverride ?? getDb()
      const normalizedDocumentUri = documentUri.trim()
      if (!db || !normalizedDocumentUri) return []

      return queryPendingProposalResources(db, {
        toolName: FILES_SOURCE_APPROVAL_TOOL_NAME,
        action: FILES_SOURCE_APPROVAL_ACTION,
        parse: parseSourceUpdateProposalTurtle,
        isMatch: (proposal) => (
          proposal.documentUri === normalizedDocumentUri
          && proposal.status === 'pending'
        ),
      })
    },

    async create(input: {
      db?: SolidDatabase | null
      proposal: SourceUpdateProposal
      actorWebId: string
    }): Promise<string> {
      return sourceUpdateProposalUseCases.create({
        ...input,
        db: input.db ?? getDb(),
      })
    },

    async createWithCache(input: {
      cacheClient: QueryClient
      db?: SolidDatabase | null
      proposal: SourceUpdateProposal
      actorWebId: string
    }): Promise<string> {
      return createFilesProposalWithCache({
        cacheClient: input.cacheClient,
        queryKey: sourceUpdateProposalCollection.queryKey(input.proposal.documentUri),
        proposal: input.proposal,
        create: () => sourceUpdateProposalCollection.create({
          db: input.db,
          actorWebId: input.actorWebId,
          proposal: input.proposal,
        }),
        invalidate: () => sourceUpdateProposalCollection.invalidateCreate(input.cacheClient, input.proposal),
      })
    },

    async invalidateCreate(cacheClient: QueryClient, proposal: SourceUpdateProposal) {
      await filesResourceCacheInvalidationCollection.invalidateProposalCreate(cacheClient, {
        proposalResourceUri: proposal.proposalResourceUri,
        proposalQueryKey: sourceUpdateProposalCollection.queryKey(proposal.documentUri),
      })
    },
  }

  const aiChangeProposalCollection = {
    queryKey(targetResourceUri: string): QueryKey {
      return [...queryKeys.aiChangeProposals, targetResourceUri]
    },

    async create(input: {
      db?: SolidDatabase | null
      proposal: AiChangeProposal
      actorWebId: string
    }): Promise<string> {
      return aiChangeProposalUseCases.create({
        ...input,
        db: input.db ?? getDb(),
      })
    },

    async createWithCache(input: {
      cacheClient: QueryClient
      db?: SolidDatabase | null
      proposal: AiChangeProposal
      actorWebId: string
    }): Promise<string> {
      return createFilesProposalWithCache({
        cacheClient: input.cacheClient,
        queryKey: aiChangeProposalCollection.queryKey(input.proposal.targetResourceUri),
        proposal: input.proposal,
        create: () => aiChangeProposalCollection.create({
          db: input.db,
          actorWebId: input.actorWebId,
          proposal: input.proposal,
        }),
        invalidate: () => aiChangeProposalCollection.invalidateCreate(input.cacheClient, input.proposal),
      })
    },

    async invalidateCreate(cacheClient: QueryClient, proposal: AiChangeProposal) {
      await filesResourceCacheInvalidationCollection.invalidateProposalCreate(cacheClient, {
        proposalResourceUri: proposal.proposalResourceUri,
        rawTextResourceUris: [proposal.targetResourceUri],
        detailResourceUris: [proposal.targetResourceUri],
      })
    },
  }

  const filesProposalQueryCollection = {
    pendingStructuredCellChanges(input: {
      documentUri?: string | null
      enabled?: boolean
      db?: SolidDatabase | null
    }): FilesResourceQueryOptions<StructuredCellChangeProposal[]> {
      const documentUri = input.documentUri?.trim() ?? ''
      const enabled = input.enabled ?? true

      return {
        queryKey: structuredCellProposalCollection.queryKey(documentUri),
        queryFn: async () => {
          if (!input.db || !documentUri) return []
          return structuredCellProposalCollection.fetchByDocument(documentUri, input.db)
        },
        enabled: enabled && !!input.db && documentUri.length > 0,
      }
    },

    pendingVocabTerms(input: {
      documentUri?: string | null
      enabled?: boolean
      db?: SolidDatabase | null
    }): FilesResourceQueryOptions<VocabTermProposal[]> {
      const documentUri = input.documentUri?.trim() ?? ''
      const enabled = input.enabled ?? true

      return {
        queryKey: vocabTermProposalCollection.queryKey(documentUri),
        queryFn: async () => {
          if (!input.db || !documentUri) return []
          return vocabTermProposalCollection.fetchByDocument(documentUri, input.db)
        },
        enabled: enabled && !!input.db && documentUri.length > 0,
      }
    },

    pendingSourceUpdates(input: {
      documentUri?: string | null
      enabled?: boolean
      db?: SolidDatabase | null
    }): FilesResourceQueryOptions<SourceUpdateProposal[]> {
      const documentUri = input.documentUri?.trim() ?? ''
      const enabled = input.enabled ?? true

      return {
        queryKey: sourceUpdateProposalCollection.queryKey(documentUri),
        queryFn: async () => {
          if (!input.db || !documentUri) return []
          return sourceUpdateProposalCollection.fetchByDocument(documentUri, input.db)
        },
        enabled: enabled && !!input.db && documentUri.length > 0,
      }
    },

    pendingAccessPolicies(input: {
      ownerUri?: string | null
      enabled?: boolean
      db?: SolidDatabase | null
    }): FilesResourceQueryOptions<AccessPolicyProposal[]> {
      const ownerUri = input.ownerUri?.trim() ?? ''
      const enabled = input.enabled ?? true

      return {
        queryKey: accessPolicyProposalCollection.queryKey(ownerUri),
        queryFn: async () => {
          if (!input.db || !ownerUri) return []
          return accessPolicyProposalCollection.fetchByOwner(ownerUri, input.db)
        },
        enabled: enabled && !!input.db && ownerUri.length > 0,
      }
    },
  }

  return {
    structuredCellProposalCollection,
    structuredCellProposalCacheCollection,
    vocabTermProposalCollection,
    accessPolicyProposalCollection,
    sourceUpdateProposalCollection,
    filesProposalQueryCollection,
    aiChangeProposalCollection,
  }
}
