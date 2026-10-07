import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { SolidDatabase } from '@undefineds.co/models'
import type {
  SourceIngestKind,
  SourceIngestPlan,
  SourceRefreshPlan,
} from '../../domain/source/source-ingest'
import type {
  SourceIngestManifest,
  SourceIngestRange,
} from '../../domain/source/source-ingest-manifest'
import type { createFilesResourceCacheInvalidationCollection } from '../cache/files-query-invalidation'
import type { createSourceIngestCacheCollections } from '../cache/source-ingest-cache'
import type { SourceIngestAdapter } from '../ingest/source-ingest-snapshot'
import { sourceIngestUseCases } from '../ingest/source-ingest-use-cases'

type SourceIngestCacheCollections = ReturnType<typeof createSourceIngestCacheCollections>
type FilesResourceCacheInvalidationCollection = ReturnType<typeof createFilesResourceCacheInvalidationCollection>

type SourceIngestCreateInput = {
  containerUri: string
  sourceUri: string
  title: string
  sourceKind: SourceIngestKind
  mimeType?: string
  sourceHash?: string
  ingestVersion?: string
  ingestAdapter?: SourceIngestAdapter
}

type SourceRefreshInput = {
  documentUri: string
  subject: string
  targetResourceUri: string
  sourceUri: string
  sourceKind: SourceIngestKind
  title: string
  mimeType?: string
  currentSourceHash: string
  ingestVersion?: string
  sourceIngestManifestUri?: string
  ingestAdapter?: SourceIngestAdapter
}

export interface SourceIngestCollectionDependencies {
  getDb: () => SolidDatabase | null
  resolveCurrentPodRootUri: (dbOverride?: SolidDatabase | null) => string | null
  sourceUpdateProposalQueryKey: (documentUri: string) => QueryKey
  filesResourceCacheInvalidationCollection: FilesResourceCacheInvalidationCollection
  sourceIngestManifestCacheCollection: SourceIngestCacheCollections['sourceIngestManifestCacheCollection']
  sourceIngestCreateCacheCollection: SourceIngestCacheCollections['sourceIngestCreateCacheCollection']
  sourceIngestRefreshCacheCollection: SourceIngestCacheCollections['sourceIngestRefreshCacheCollection']
}

export function createSourceIngestCollection(dependencies: SourceIngestCollectionDependencies) {
  const {
    getDb,
    resolveCurrentPodRootUri,
    sourceUpdateProposalQueryKey,
    filesResourceCacheInvalidationCollection,
    sourceIngestManifestCacheCollection,
    sourceIngestCreateCacheCollection,
    sourceIngestRefreshCacheCollection,
  } = dependencies

  const sourceIngestCollection = {
    async buildCreatePlan(input: {
      db?: SolidDatabase | null
      podRootUri?: string | null
      fetchSource?: typeof fetch
      input: SourceIngestCreateInput
    }): Promise<SourceIngestPlan> {
      return sourceIngestUseCases.buildCreatePlan({
        ...input,
        db: input.db ?? getDb(),
        resolveCurrentPodRootUri,
      })
    },

    async commitCreate(input: {
      db?: SolidDatabase | null
      actorWebId: string
      plan: SourceIngestPlan
    }): Promise<void> {
      return sourceIngestUseCases.commitCreate({
        ...input,
        db: input.db ?? getDb(),
      })
    },

    async create(input: {
      db?: SolidDatabase | null
      actorWebId: string
      podRootUri?: string | null
      fetchSource?: typeof fetch
      input: SourceIngestCreateInput
    }): Promise<SourceIngestPlan> {
      return sourceIngestUseCases.create({
        ...input,
        db: input.db ?? getDb(),
        resolveCurrentPodRootUri,
      })
    },

    async createWithCache(input: {
      cacheClient: QueryClient
      db?: SolidDatabase | null
      actorWebId: string
      podRootUri?: string | null
      fetchSource?: typeof fetch
      input: SourceIngestCreateInput
    }): Promise<SourceIngestPlan> {
      const plan = await sourceIngestUseCases.buildCreatePlan({
        db: input.db ?? getDb(),
        podRootUri: input.podRootUri,
        resolveCurrentPodRootUri,
        fetchSource: input.fetchSource,
        input: input.input,
      })
      const snapshot = await sourceIngestCreateCacheCollection.stageCreate(
        input.cacheClient,
        plan,
        input.input.containerUri,
      )

      try {
        await sourceIngestUseCases.commitCreate({
          db: input.db ?? getDb(),
          actorWebId: input.actorWebId,
          plan,
        })
      } catch (error) {
        sourceIngestCreateCacheCollection.restore(input.cacheClient, snapshot)
        throw error
      } finally {
        await sourceIngestCollection.invalidateCreate(input.cacheClient, plan)
      }

      return plan
    },

    async invalidateCreate(cacheClient: QueryClient, plan: SourceIngestPlan) {
      await filesResourceCacheInvalidationCollection.invalidateSourceIngestCreate(cacheClient, {
        targetResourceUri: plan.targetResourceUri,
        bodyResourceUri: plan.bodyResourceUri,
        sourceIngestManifestUri: plan.sourceIngestManifestUri,
        sourceProposalResourceUri: plan.sourceProposal.proposalResourceUri,
        sourceProposalQueryKey: sourceUpdateProposalQueryKey(plan.sourceProposal.documentUri),
      })
    },

    async refresh(input: {
      db?: SolidDatabase | null
      actorWebId: string
      podRootUri?: string | null
      fetchSource?: typeof fetch
      input: SourceRefreshInput
    }): Promise<SourceRefreshPlan> {
      return sourceIngestUseCases.refresh({
        ...input,
        db: input.db ?? getDb(),
        resolveCurrentPodRootUri,
      })
    },

    async buildRefreshPlan(input: {
      db?: SolidDatabase | null
      podRootUri?: string | null
      fetchSource?: typeof fetch
      input: SourceRefreshInput
    }): Promise<SourceRefreshPlan> {
      return sourceIngestUseCases.buildRefreshPlan({
        ...input,
        db: input.db ?? getDb(),
        resolveCurrentPodRootUri,
      })
    },

    async commitRefresh(input: {
      db?: SolidDatabase | null
      actorWebId: string
      plan: SourceRefreshPlan
    }): Promise<void> {
      return sourceIngestUseCases.commitRefresh({
        ...input,
        db: input.db ?? getDb(),
      })
    },

    async refreshWithCache(input: {
      cacheClient: QueryClient
      db?: SolidDatabase | null
      actorWebId: string
      podRootUri?: string | null
      fetchSource?: typeof fetch
      input: SourceRefreshInput
    }): Promise<SourceRefreshPlan> {
      const plan = await sourceIngestUseCases.buildRefreshPlan({
        db: input.db ?? getDb(),
        podRootUri: input.podRootUri,
        resolveCurrentPodRootUri,
        fetchSource: input.fetchSource,
        input: input.input,
      })
      const snapshot = await sourceIngestRefreshCacheCollection.stageRefresh(
        input.cacheClient,
        plan,
      )

      try {
        await sourceIngestUseCases.commitRefresh({
          db: input.db ?? getDb(),
          actorWebId: input.actorWebId,
          plan,
        })
      } catch (error) {
        sourceIngestRefreshCacheCollection.restore(input.cacheClient, snapshot)
        throw error
      } finally {
        await sourceIngestCollection.invalidateRefresh(input.cacheClient, plan)
      }

      return plan
    },

    async invalidateRefresh(cacheClient: QueryClient, plan: SourceRefreshPlan) {
      await filesResourceCacheInvalidationCollection.invalidateSourceIngestRefresh(cacheClient, {
        targetResourceUri: plan.targetResourceUri,
        sourceIngestManifestUri: plan.sourceIngestManifestUri,
        sourceProposalResourceUri: plan.sourceProposal?.proposalResourceUri,
        sourceProposalQueryKey: plan.sourceProposal
          ? sourceUpdateProposalQueryKey(plan.sourceProposal.documentUri)
          : undefined,
      })
    },

    async requestRange(input: {
      db?: SolidDatabase | null
      manifest: SourceIngestManifest
      range?: SourceIngestRange
      ranges?: SourceIngestRange[]
      requestedAt?: string
    }) {
      return sourceIngestUseCases.requestRange({
        ...input,
        db: input.db ?? getDb(),
      })
    },

    async requestRangeWithCache(input: {
      cacheClient: QueryClient
      db?: SolidDatabase | null
      manifest: SourceIngestManifest
      range?: SourceIngestRange
      ranges?: SourceIngestRange[]
      requestedAt?: string
    }) {
      const snapshot = await sourceIngestManifestCacheCollection.stageRequestRange(input.cacheClient, {
        manifest: input.manifest,
        range: input.range,
        ranges: input.ranges,
      })

      try {
        const result = await sourceIngestUseCases.requestRange({
          db: input.db ?? getDb(),
          manifest: input.manifest,
          range: input.range,
          ranges: input.ranges,
          requestedAt: input.requestedAt,
        })
        sourceIngestManifestCacheCollection.write(input.cacheClient, result.manifest)
        return result
      } catch (error) {
        sourceIngestManifestCacheCollection.restore(input.cacheClient, snapshot)
        throw error
      } finally {
        await sourceIngestCollection.invalidateManifest(input.cacheClient, { manifest: input.manifest })
      }
    },

    async invalidateManifest(cacheClient: QueryClient, result: { manifest: Pick<SourceIngestManifest, 'manifestUri'> }) {
      await filesResourceCacheInvalidationCollection.invalidateSourceIngestManifest(cacheClient, {
        sourceIngestManifestUri: result.manifest.manifestUri,
      })
    },

    async markRangeIngested(input: {
      db?: SolidDatabase | null
      manifest: SourceIngestManifest
      range: SourceIngestRange
      ingestedAt?: string
    }) {
      return sourceIngestUseCases.markRangeIngested({
        ...input,
        db: input.db ?? getDb(),
      })
    },

    async markRangeIngestedWithCache(input: {
      cacheClient: QueryClient
      db?: SolidDatabase | null
      manifest: SourceIngestManifest
      range: SourceIngestRange
      ingestedAt?: string
    }) {
      const snapshot = await sourceIngestManifestCacheCollection.stageMarkRangeIngested(input.cacheClient, {
        manifest: input.manifest,
        range: input.range,
        ingestedAt: input.ingestedAt,
      })

      try {
        const result = await sourceIngestUseCases.markRangeIngested({
          db: input.db ?? getDb(),
          manifest: input.manifest,
          range: input.range,
          ingestedAt: input.ingestedAt,
        })
        sourceIngestManifestCacheCollection.write(input.cacheClient, result.manifest)
        return result
      } catch (error) {
        sourceIngestManifestCacheCollection.restore(input.cacheClient, snapshot)
        throw error
      } finally {
        await sourceIngestCollection.invalidateManifest(input.cacheClient, { manifest: input.manifest })
      }
    },
  }

  return sourceIngestCollection
}
