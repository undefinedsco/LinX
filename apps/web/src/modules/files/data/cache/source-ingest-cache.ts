import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type {
  FilesEntry,
  FilesRawTextResource,
} from '../../domain/resource/resource-model'
import {
  renderSourceUpdateProposalTurtle,
  type SourceUpdateProposal,
} from '../../domain/source/source-approval-model'
import {
  markSourceIngestRangeIngested,
  queueSourceIngestRanges,
  renderSourceIngestManifestTurtle,
  type SourceIngestManifest,
  type SourceIngestRange,
} from '../../domain/source/source-ingest-manifest'
import {
  renderSourceLinkedCardTurtle,
  type SourceIngestPlan,
  type SourceRefreshPlan,
} from '../../domain/source/source-ingest'
import type { FilesEntryCacheSnapshot } from './files-entry-cache'
import {
  filesProposalCacheCollection,
  type FilesProposalCacheSnapshot,
} from './proposal-query-cache'
import {
  rawTextCacheSnapshot,
  rawTextQueryKey,
  restoreQuerySnapshot,
  writeRawTextCache,
} from './resource-query-cache'

export type SourceIngestManifestCacheSnapshot = Array<[QueryKey, FilesRawTextResource | undefined]>

export type SourceIngestCreateCacheSnapshot = {
  entries: FilesEntryCacheSnapshot
  sourceProposal: FilesProposalCacheSnapshot<SourceUpdateProposal>
  rawTextResources: Array<[QueryKey, FilesRawTextResource | undefined]>
}

export type SourceIngestRefreshCacheSnapshot = {
  sourceProposal?: FilesProposalCacheSnapshot<SourceUpdateProposal>
  rawTextResources: Array<[QueryKey, FilesRawTextResource | undefined]>
}

type SourceIngestEntryCacheCollection = {
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
  ): Promise<FilesEntryCacheSnapshot>
  restore(cacheClient: QueryClient, snapshot?: FilesEntryCacheSnapshot): void
}

export type SourceIngestCacheCollectionInput = {
  rawTextQueryRoot: QueryKey
  filesEntryCacheCollection: SourceIngestEntryCacheCollection
  sourceProposalQueryKey: (documentUri: string) => QueryKey
}

function renderSourceIngestCardEntry(plan: SourceIngestPlan, containerUri: string): {
  uri: string
  kind: FilesEntry['kind']
  mimeType: string
  size: number
  parentUri: string
  podRootUri: string | null
} {
  return {
    uri: plan.targetResourceUri,
    kind: 'resource',
    mimeType: 'text/turtle',
    size: renderSourceLinkedCardTurtle(plan).length,
    parentUri: containerUri,
    podRootUri: null,
  }
}

export function createSourceIngestCacheCollections(input: SourceIngestCacheCollectionInput) {
  const {
    rawTextQueryRoot,
    filesEntryCacheCollection,
    sourceProposalQueryKey,
  } = input

  const sourceIngestManifestCacheCollection = {
    queryKey(manifestUri: string) {
      return rawTextQueryKey(rawTextQueryRoot, manifestUri)
    },

    snapshot(cacheClient: QueryClient, manifestUri: string): SourceIngestManifestCacheSnapshot {
      return rawTextCacheSnapshot(cacheClient, rawTextQueryRoot, manifestUri)
    },

    restore(cacheClient: QueryClient, snapshot?: SourceIngestManifestCacheSnapshot) {
      restoreQuerySnapshot(cacheClient, snapshot)
    },

    write(cacheClient: QueryClient, manifest: SourceIngestManifest) {
      const current = cacheClient.getQueryData<FilesRawTextResource>(
        sourceIngestManifestCacheCollection.queryKey(manifest.manifestUri),
      )
      writeRawTextCache(cacheClient, rawTextQueryRoot, {
        uri: manifest.manifestUri,
        mimeType: current?.mimeType ?? 'text/turtle',
        etag: current?.etag ?? null,
        headers: current?.headers ?? {},
        content: renderSourceIngestManifestTurtle(manifest),
      })
    },

    async stageRequestRange(
      cacheClient: QueryClient,
      request: {
        manifest: SourceIngestManifest
        range?: SourceIngestRange
        ranges?: SourceIngestRange[]
      },
    ): Promise<SourceIngestManifestCacheSnapshot> {
      const ranges = request.ranges?.length
        ? request.ranges
        : request.range
          ? [request.range]
          : []
      await cacheClient.cancelQueries({ queryKey: sourceIngestManifestCacheCollection.queryKey(request.manifest.manifestUri) })
      const snapshot = sourceIngestManifestCacheCollection.snapshot(cacheClient, request.manifest.manifestUri)
      if (ranges.length > 0) {
        const queued = queueSourceIngestRanges(request.manifest, ranges)
        if (queued.changed) {
          sourceIngestManifestCacheCollection.write(cacheClient, queued.manifest)
        }
      }
      return snapshot
    },

    async stageMarkRangeIngested(
      cacheClient: QueryClient,
      request: {
        manifest: SourceIngestManifest
        range: SourceIngestRange
        ingestedAt?: string
      },
    ): Promise<SourceIngestManifestCacheSnapshot> {
      await cacheClient.cancelQueries({ queryKey: sourceIngestManifestCacheCollection.queryKey(request.manifest.manifestUri) })
      const snapshot = sourceIngestManifestCacheCollection.snapshot(cacheClient, request.manifest.manifestUri)
      sourceIngestManifestCacheCollection.write(
        cacheClient,
        markSourceIngestRangeIngested(request.manifest, {
          range: request.range,
          ingestedAt: request.ingestedAt,
        }),
      )
      return snapshot
    },
  }

  const sourceIngestCreateCacheCollection = {
    async stageCreate(
      cacheClient: QueryClient,
      plan: SourceIngestPlan,
      containerUri: string,
    ): Promise<SourceIngestCreateCacheSnapshot> {
      await Promise.all([
        cacheClient.cancelQueries({ queryKey: rawTextQueryKey(rawTextQueryRoot, plan.sourceIngestManifestUri) }),
        cacheClient.cancelQueries({ queryKey: rawTextQueryKey(rawTextQueryRoot, plan.sourceProposal.proposalResourceUri) }),
        cacheClient.cancelQueries({ queryKey: rawTextQueryKey(rawTextQueryRoot, plan.targetResourceUri) }),
      ])

      const entries = await filesEntryCacheCollection.stageResourceCreate(
        cacheClient,
        renderSourceIngestCardEntry(plan, containerUri),
      )
      const sourceProposal = await filesProposalCacheCollection.stageCreate(
        cacheClient,
        sourceProposalQueryKey(plan.sourceProposal.documentUri),
        plan.sourceProposal,
      )
      const rawTextResources = [
        ...rawTextCacheSnapshot(cacheClient, rawTextQueryRoot, plan.sourceIngestManifestUri),
        ...rawTextCacheSnapshot(cacheClient, rawTextQueryRoot, plan.sourceProposal.proposalResourceUri),
        ...rawTextCacheSnapshot(cacheClient, rawTextQueryRoot, plan.targetResourceUri),
      ]

      sourceIngestManifestCacheCollection.write(cacheClient, plan.sourceIngestManifest)
      writeRawTextCache(cacheClient, rawTextQueryRoot, {
        uri: plan.sourceProposal.proposalResourceUri,
        mimeType: 'text/turtle',
        content: renderSourceUpdateProposalTurtle(plan.sourceProposal),
      })
      writeRawTextCache(cacheClient, rawTextQueryRoot, {
        uri: plan.targetResourceUri,
        mimeType: 'text/turtle',
        content: renderSourceLinkedCardTurtle(plan),
      })

      return {
        entries,
        sourceProposal,
        rawTextResources,
      }
    },

    restore(cacheClient: QueryClient, snapshot?: SourceIngestCreateCacheSnapshot) {
      if (!snapshot) return
      filesEntryCacheCollection.restore(cacheClient, snapshot.entries)
      filesProposalCacheCollection.restore(cacheClient, snapshot.sourceProposal)
      restoreQuerySnapshot(cacheClient, snapshot.rawTextResources)
    },
  }

  const sourceIngestRefreshCacheCollection = {
    async stageRefresh(
      cacheClient: QueryClient,
      plan: SourceRefreshPlan,
    ): Promise<SourceIngestRefreshCacheSnapshot> {
      const rawTextQueries = [rawTextQueryKey(rawTextQueryRoot, plan.sourceIngestManifestUri)]
      if (plan.sourceProposal) {
        rawTextQueries.push(rawTextQueryKey(rawTextQueryRoot, plan.sourceProposal.proposalResourceUri))
      }
      await Promise.all(rawTextQueries.map((queryKey) => (
        cacheClient.cancelQueries({ queryKey })
      )))

      const sourceProposal = plan.sourceProposal
        ? await filesProposalCacheCollection.stageCreate(
            cacheClient,
            sourceProposalQueryKey(plan.sourceProposal.documentUri),
            plan.sourceProposal,
          )
        : undefined
      const rawTextResources = [
        ...rawTextCacheSnapshot(cacheClient, rawTextQueryRoot, plan.sourceIngestManifestUri),
        ...(plan.sourceProposal
          ? rawTextCacheSnapshot(cacheClient, rawTextQueryRoot, plan.sourceProposal.proposalResourceUri)
          : []),
      ]

      sourceIngestManifestCacheCollection.write(cacheClient, plan.sourceIngestManifest)
      if (plan.sourceProposal) {
        writeRawTextCache(cacheClient, rawTextQueryRoot, {
          uri: plan.sourceProposal.proposalResourceUri,
          mimeType: 'text/turtle',
          content: renderSourceUpdateProposalTurtle(plan.sourceProposal),
        })
      }

      return {
        sourceProposal,
        rawTextResources,
      }
    },

    restore(cacheClient: QueryClient, snapshot?: SourceIngestRefreshCacheSnapshot) {
      if (!snapshot) return
      filesProposalCacheCollection.restore(cacheClient, snapshot.sourceProposal)
      restoreQuerySnapshot(cacheClient, snapshot.rawTextResources)
    },
  }

  return {
    sourceIngestManifestCacheCollection,
    sourceIngestCreateCacheCollection,
    sourceIngestRefreshCacheCollection,
  }
}
