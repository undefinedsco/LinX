import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import {
  createFilesResourceCacheInvalidationCollection,
  type FilesQueryInvalidationRoots,
} from './files-query-invalidation'

const queryKeys: FilesQueryInvalidationRoots = {
  roots: ['files', 'roots'],
  children: ['files', 'children'],
  entries: ['files', 'entries'],
  detail: ['files', 'detail'],
  accessBasics: ['files', 'access-basics'],
  metaSidecar: ['files', 'meta-sidecar'],
  structuredViewMetadata: ['files', 'structured-view-metadata'],
  rawText: ['files', 'raw-text'],
  blob: ['files', 'blob'],
  structuredCellProposals: ['files', 'structured-cell-proposals'],
  sourceUpdateProposals: ['files', 'source-update-proposals'],
  accessPolicyProposals: ['files', 'access-policy-proposals'],
  vocabTermProposals: ['files', 'vocab-term-proposals'],
  aiChangeProposals: ['files', 'ai-change-proposals'],
  vocabDiscovery: ['files', 'vocab-discovery'],
}

describe('Files query invalidation cache helpers', () => {
  it('invalidates a proposal list and inbox roots from a scoped query key', async () => {
    const cacheClient = new QueryClient()
    const invalidateSpy = vi.spyOn(cacheClient, 'invalidateQueries')
    const collection = createFilesResourceCacheInvalidationCollection(queryKeys, cacheClient)

    await collection.invalidateProposalList(cacheClient, {
      proposalQueryKey: ['files', 'structured-cell-proposals', 'https://pod.example/data.ttl'],
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['files', 'structured-cell-proposals', 'https://pod.example/data.ttl'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inbox'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inbox', 'approvals'] })
  })

  it('invalidates a proposal create graph from cache-layer inputs', async () => {
    const cacheClient = new QueryClient()
    const invalidateSpy = vi.spyOn(cacheClient, 'invalidateQueries')
    const collection = createFilesResourceCacheInvalidationCollection(queryKeys, cacheClient)

    await collection.invalidateProposalCreate(cacheClient, {
      proposalResourceUri: 'https://pod.example/.data/proposals/p-1.ttl',
      proposalQueryKey: ['files', 'structured-cell-proposals', 'https://pod.example/data.ttl'],
      rawTextResourceUris: [
        'https://pod.example/data.ttl',
        'https://pod.example/data.ttl',
      ],
      detailResourceUris: ['https://pod.example/data.ttl'],
      accessBasicsTargets: [
        { uri: 'https://pod.example/data.ttl', kind: 'resource' },
      ],
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['files', 'raw-text', 'https://pod.example/.data/proposals/p-1.ttl'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['files', 'raw-text', 'https://pod.example/data.ttl'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['files', 'detail', 'https://pod.example/data.ttl'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['files', 'access-basics', 'https://pod.example/data.ttl', 'resource'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['files', 'structured-cell-proposals', 'https://pod.example/data.ttl'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inbox'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inbox', 'approvals'] })
    expect(invalidateSpy.mock.calls.filter(([input]) => (
      input.queryKey.join('|') === 'files|raw-text|https://pod.example/data.ttl'
    ))).toHaveLength(1)
  })

  it('invalidates a source Ingest create graph from cache-layer inputs', async () => {
    const cacheClient = new QueryClient()
    const invalidateSpy = vi.spyOn(cacheClient, 'invalidateQueries')
    const collection = createFilesResourceCacheInvalidationCollection(queryKeys, cacheClient)

    await collection.invalidateSourceIngestCreate(cacheClient, {
      targetResourceUri: 'https://pod.example/.data/cards/report.card.ttl',
      bodyResourceUri: 'https://pod.example/.data/cards/report.md',
      sourceIngestManifestUri: 'https://pod.example/.data/ingest/report/manifest.ttl',
      sourceProposalResourceUri: 'https://pod.example/.data/proposals/source.ttl',
      sourceProposalQueryKey: ['files', 'source-update-proposals', 'https://pod.example/.data/cards/index.ttl'],
    })

    for (const queryKey of [
      ['files', 'entries'],
      ['files', 'children'],
      ['files', 'detail', 'https://pod.example/.data/cards/report.card.ttl'],
      ['files', 'raw-text', 'https://pod.example/.data/cards/report.card.ttl'],
      ['files', 'detail', 'https://pod.example/.data/cards/report.md'],
      ['files', 'raw-text', 'https://pod.example/.data/cards/report.md'],
      ['files', 'raw-text', 'https://pod.example/.data/ingest/report/manifest.ttl'],
      ['files', 'raw-text', 'https://pod.example/.data/proposals/source.ttl'],
      ['files', 'source-update-proposals', 'https://pod.example/.data/cards/index.ttl'],
      ['inbox'],
      ['inbox', 'approvals'],
    ]) {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey })
    }
  })

  it('invalidates a source Ingest refresh graph only when a proposal exists', async () => {
    const cacheClient = new QueryClient()
    const invalidateSpy = vi.spyOn(cacheClient, 'invalidateQueries')
    const collection = createFilesResourceCacheInvalidationCollection(queryKeys, cacheClient)

    await collection.invalidateSourceIngestRefresh(cacheClient, {
      targetResourceUri: 'https://pod.example/.data/cards/report.md',
      sourceIngestManifestUri: 'https://pod.example/.data/ingest/report/manifest.ttl',
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['files', 'raw-text', 'https://pod.example/.data/ingest/report/manifest.ttl'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['files', 'detail', 'https://pod.example/.data/cards/report.md'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['files', 'raw-text', 'https://pod.example/.data/cards/report.md'],
    })
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['inbox'] })

    await collection.invalidateSourceIngestRefresh(cacheClient, {
      targetResourceUri: 'https://pod.example/.data/cards/report.md',
      sourceIngestManifestUri: 'https://pod.example/.data/ingest/report/manifest.ttl',
      sourceProposalResourceUri: 'https://pod.example/.data/proposals/source-refresh.ttl',
      sourceProposalQueryKey: ['files', 'source-update-proposals', 'https://pod.example/.data/cards/report.card.ttl'],
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['files', 'raw-text', 'https://pod.example/.data/proposals/source-refresh.ttl'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['files', 'source-update-proposals', 'https://pod.example/.data/cards/report.card.ttl'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inbox'] })
  })

  it('invalidates a source Ingest manifest raw-text resource', async () => {
    const cacheClient = new QueryClient()
    const invalidateSpy = vi.spyOn(cacheClient, 'invalidateQueries')
    const collection = createFilesResourceCacheInvalidationCollection(queryKeys, cacheClient)

    await collection.invalidateSourceIngestManifest(cacheClient, {
      sourceIngestManifestUri: 'https://pod.example/.data/ingest/report/manifest.ttl',
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['files', 'raw-text', 'https://pod.example/.data/ingest/report/manifest.ttl'],
    })
  })

  it('invalidates a vocab approval graph from cache-layer inputs', async () => {
    const cacheClient = new QueryClient()
    const invalidateSpy = vi.spyOn(cacheClient, 'invalidateQueries')
    const collection = createFilesResourceCacheInvalidationCollection(queryKeys, cacheClient)

    await collection.invalidateVocabApproval(cacheClient, {
      termsResourceUri: 'https://pod.example/.vocab/terms.ttl',
      shapesResourceUri: 'https://pod.example/.vocab/shapes.ttl',
      namespacesResourceUri: 'https://pod.example/.vocab/namespaces.ttl',
    })

    for (const queryKey of [
      ['files', 'entries'],
      ['files', 'children'],
      ['files', 'raw-text', 'https://pod.example/.vocab/terms.ttl'],
      ['files', 'detail', 'https://pod.example/.vocab/terms.ttl'],
      ['files', 'raw-text', 'https://pod.example/.vocab/shapes.ttl'],
      ['files', 'detail', 'https://pod.example/.vocab/shapes.ttl'],
      ['files', 'raw-text', 'https://pod.example/.vocab/namespaces.ttl'],
      ['files', 'detail', 'https://pod.example/.vocab/namespaces.ttl'],
    ]) {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey })
    }
  })
})
