import { useSession } from '@/providers/solid-session-context'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useSolidDatabase } from '@/providers/solid-database-provider'
import type { SourceIngestKind } from '../../domain/source/source-ingest'
import type { SourceIngestManifest, SourceIngestRange } from '../../domain/source/source-ingest-manifest'
import type { SourceIngestAdapter } from '../ingest/source-ingest-snapshot'
import { sourceIngestCollection } from '../collections'

export function useCreateSourceIngest() {
  const { db } = useSolidDatabase()
  const { session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      containerUri: string
      sourceUri: string
      title: string
      sourceKind: SourceIngestKind
      mimeType?: string
      sourceHash?: string
      ingestVersion?: string
      ingestAdapter?: SourceIngestAdapter
    }) => {
      if (!db) throw new Error('Database not connected')
      const actorWebId = session.info.webId
      if (!actorWebId) throw new Error('Cannot create an Ingest source without a logged-in WebID.')
      return sourceIngestCollection.createWithCache({
        cacheClient: queryClient,
        db,
        actorWebId,
        fetchSource: input.sourceKind === 'url' ? undefined : session.fetch,
        input,
      })
    },
  })
}

export function useRefreshSourceLinkedCard() {
  const { db } = useSolidDatabase()
  const { session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
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
    }) => {
      if (!db) throw new Error('Database not connected')
      const actorWebId = session.info.webId
      if (!actorWebId) throw new Error('Cannot refresh a source without a logged-in WebID.')
      return sourceIngestCollection.refreshWithCache({
        cacheClient: queryClient,
        db,
        actorWebId,
        fetchSource: input.sourceKind === 'url' ? undefined : session.fetch,
        input,
      })
    },
  })
}

export function useRequestSourceIngestRange() {
  const { db } = useSolidDatabase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      manifest: SourceIngestManifest
      range?: SourceIngestRange
      ranges?: SourceIngestRange[]
      requestedAt?: string
    }) => {
      if (!db) throw new Error('Database not connected')
      return sourceIngestCollection.requestRangeWithCache({
        cacheClient: queryClient,
        db,
        ...input,
      })
    },
  })
}

export function useMarkSourceIngestRangeIngested() {
  const { db } = useSolidDatabase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      manifest: SourceIngestManifest
      range: SourceIngestRange
      ingestedAt?: string
    }) => {
      if (!db) throw new Error('Database not connected')
      return sourceIngestCollection.markRangeIngestedWithCache({
        cacheClient: queryClient,
        db,
        ...input,
      })
    },
  })
}
