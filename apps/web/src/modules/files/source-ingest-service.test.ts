import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ensureSourceIndexManifestResource,
  ensureSourceIngestManifestResource,
  markSourceIndexRangeIndexedResource,
  markSourceIngestRangeIngestedResource,
} from './data/ingest/source-ingest-service'
import {
  createSourceIndexManifest,
  createSourceIngestManifest,
  renderSourceIndexManifestTurtle,
  renderSourceIngestManifestTurtle,
} from './domain/source/source-ingest-manifest'

const mocks = vi.hoisted(() => ({
  readRawTextResource: vi.fn(),
  createRawTextResource: vi.fn(),
  saveRawTextResource: vi.fn(),
}))

vi.mock('./data/pod-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/pod-adapter')>()
  return {
    ...actual,
    readRawTextResource: mocks.readRawTextResource,
    createRawTextResource: mocks.createRawTextResource,
    saveRawTextResource: mocks.saveRawTextResource,
  }
})

describe('source ingest service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createRawTextResource.mockResolvedValue({
      uri: 'https://pod.example/.data/ingest/sources/source/manifest.ttl',
      content: '',
      mimeType: 'text/turtle',
      etag: '"created"',
      headers: {},
    })
    mocks.saveRawTextResource.mockResolvedValue({
      uri: 'https://pod.example/.data/ingest/sources/source/manifest.ttl',
      content: '',
      mimeType: 'text/turtle',
      etag: '"saved"',
      headers: {},
    })
  })

  it('exposes Ingest-named service APIs for new Files code', async () => {
    const manifest = createSourceIngestManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://source.example/report.pdf',
      sourceHash: 'sha256-v1',
      ingestVersion: 'pdf-ingest-v1',
      manifestUri: 'https://pod.example/.data/ingest/sources/source/manifest.ttl',
      ingestedRanges: [{ start: 'page:1', end: 'page:2' }],
      pendingRanges: [{ start: 'page:3', end: 'page:4' }],
      priorityQueue: ['page:3..page:4'],
      readChunks: 1,
      totalChunks: 2,
      lastIngestedAt: '2026-06-18T00:00:00.000Z',
    })
    mocks.readRawTextResource.mockResolvedValue({
      uri: manifest.manifestUri,
      content: renderSourceIngestManifestTurtle(manifest),
      mimeType: 'text/turtle',
      etag: '"manifest-v1"',
      headers: {},
    })

    await expect(ensureSourceIngestManifestResource({ id: 'db' } as any, manifest)).resolves.toMatchObject({
      action: 'reused',
      manifest,
    })
    await expect(markSourceIngestRangeIngestedResource({ id: 'db' } as any, manifest, {
      range: { start: 'page:3', end: 'page:4' },
      ingestedAt: '2026-06-18T01:00:00.000Z',
    })).resolves.toMatchObject({
      action: 'marked-ingested',
      manifest: {
        status: 'complete',
        lastIngestedAt: '2026-06-18T01:00:00.000Z',
      },
    })
  })

  it('creates a missing Ingest manifest resource without legacy parser predicates', async () => {
    const manifest = createSourceIngestManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://source.example/report.pdf',
      sourceHash: 'sha256-v1',
      ingestVersion: 'pdf-ingest-v1',
      manifestUri: 'https://pod.example/.data/ingest/sources/source/manifest.ttl',
      lastIngestedAt: '2026-06-18T00:00:00.000Z',
    })
    mocks.readRawTextResource.mockRejectedValue(new Error('HTTP 404'))

    await expect(ensureSourceIngestManifestResource({ id: 'db' } as any, manifest)).resolves.toMatchObject({
      action: 'created',
      manifest,
    })

    expect(mocks.createRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      {
        uri: manifest.manifestUri,
        mimeType: 'text/turtle',
      },
      expect.stringMatching(/udfs:SourceIngestManifest[\s\S]*udfs:ingestVersion "pdf-ingest-v1"/),
    )
    const createdSource = mocks.createRawTextResource.mock.calls[0]?.[2] as string
    expect(createdSource).not.toContain('SourceIndexManifest')
    expect(createdSource).not.toContain('parserVersion')
  })

  it('keeps the deprecated source index writer for legacy .data/index resources', async () => {
    const manifest = createSourceIndexManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://source.example/report.pdf',
      sourceHash: 'sha256-v1',
      ingestVersion: 'pdf-ingest-v1',
      manifestUri: 'https://pod.example/.data/index/sources/source/manifest.ttl',
      lastIngestedAt: '2026-06-18T00:00:00.000Z',
    })
    mocks.readRawTextResource.mockRejectedValue(new Error('读取完整文件失败: HTTP 403'))

    await expect(ensureSourceIndexManifestResource({ id: 'db' } as any, manifest)).resolves.toMatchObject({
      action: 'created',
      manifest,
    })

    expect(mocks.createRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      {
        uri: manifest.manifestUri,
        mimeType: 'text/turtle',
      },
      expect.stringContaining('udfs:SourceIndexManifest'),
    )
  })

  it('tries to create Ingest manifests when a Pod returns 403 for an absent ingest resource', async () => {
    const manifest = createSourceIngestManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://source.example/report.pdf',
      sourceHash: 'sha256-v1',
      ingestVersion: 'pdf-ingest-v1',
      manifestUri: 'https://pod.example/.data/ingest/sources/source/manifest.ttl',
      lastIngestedAt: '2026-06-18T00:00:00.000Z',
    })
    mocks.readRawTextResource.mockRejectedValue(new Error('读取完整文件失败: HTTP 403'))

    await expect(ensureSourceIngestManifestResource({ id: 'db' } as any, manifest)).resolves.toMatchObject({
      action: 'created',
      manifest,
    })

    expect(mocks.createRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      {
        uri: manifest.manifestUri,
        mimeType: 'text/turtle',
      },
      expect.stringContaining('udfs:SourceIngestManifest'),
    )
  })

  it('reuses an unchanged manifest and adds requested ingest priority without canonical content writes', async () => {
    const manifest = createSourceIndexManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://source.example/report.pdf',
      sourceHash: 'sha256-v1',
      ingestVersion: 'pdf-ingest-v1',
      manifestUri: 'https://pod.example/.data/index/sources/source/manifest.ttl',
      indexedRanges: [{ start: 'page:1', end: 'page:2' }],
      pendingRanges: [],
      priorityQueue: [],
      readChunks: 1,
      totalChunks: 2,
      lastIndexedAt: '2026-06-18T00:00:00.000Z',
    })
    mocks.readRawTextResource.mockResolvedValue({
      uri: manifest.manifestUri,
      content: [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '@prefix dcterms: <http://purl.org/dc/terms/> .',
        '',
        '<#manifest> a udfs:ParserIndexManifest ;',
        '  dcterms:source <https://source.example/report.pdf> ;',
        '  udfs:sourceHash "sha256-v1" ;',
        '  udfs:parserVersion "pdf-ingest-v1" ;',
        '  udfs:parserStatus "partial" ;',
        '  udfs:readChunks 1 ;',
        '  udfs:totalChunks 2 ;',
        '  udfs:parsedRange "page:1..page:2" ;',
        '  udfs:lastParsedAt "2026-06-18T00:00:00.000Z" ;',
        '  udfs:writesCanonicalContent false .',
      ].join('\n'),
      mimeType: 'text/turtle',
      etag: '"manifest-v1"',
      headers: {},
    })

    const result = await ensureSourceIndexManifestResource({ id: 'db' } as any, manifest, {
      requestedRange: { start: 'page:3', end: 'page:4' },
      requestedAt: '2026-06-18T01:00:00.000Z',
    })

    expect(result).toMatchObject({
      action: 'updated-priority',
      manifest: {
        sourceHash: 'sha256-v1',
        pendingRanges: [{ start: 'page:3', end: 'page:4' }],
        priorityQueue: ['page:3..page:4'],
        writesCanonicalContent: false,
      },
    })
    expect(mocks.saveRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      expect.objectContaining({ uri: manifest.manifestUri, etag: '"manifest-v1"' }),
      expect.stringMatching(/udfs:pendingRange "page:3\.\.page:4"[\s\S]*udfs:priorityQueue "page:3\.\.page:4"[\s\S]*udfs:writesCanonicalContent false/),
    )
  })

  it('adds all requested Ingest ranges with one manifest write', async () => {
    const firstRange = { start: 'bytes:4096', end: 'bytes:8191' }
    const secondRange = { start: 'bytes:8192', end: 'bytes:12287' }
    const manifest = createSourceIngestManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://source.example/report.pdf',
      sourceHash: 'sha256-v1',
      ingestVersion: 'pdf-ingest-v1',
      manifestUri: 'https://pod.example/.data/ingest/sources/source/manifest.ttl',
      ingestedRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
      pendingRanges: [firstRange, secondRange],
      priorityQueue: [],
      readChunks: 1,
      totalChunks: 3,
      lastIngestedAt: '2026-06-18T00:00:00.000Z',
    })
    mocks.readRawTextResource.mockResolvedValue({
      uri: manifest.manifestUri,
      content: renderSourceIngestManifestTurtle(manifest),
      mimeType: 'text/turtle',
      etag: '"manifest-v1"',
      headers: {},
    })

    const result = await ensureSourceIngestManifestResource({ id: 'db' } as any, manifest, {
      requestedRanges: [firstRange, secondRange],
      requestedAt: '2026-06-18T01:00:00.000Z',
    })

    expect(result).toMatchObject({
      action: 'updated-priority',
      manifest: {
        pendingRanges: [firstRange, secondRange],
        priorityQueue: ['bytes:4096..bytes:8191', 'bytes:8192..bytes:12287'],
        writesCanonicalContent: false,
      },
    })
    expect(mocks.saveRawTextResource).toHaveBeenCalledTimes(1)
    const savedSource = mocks.saveRawTextResource.mock.calls[0]?.[2] as string
    expect(savedSource).toContain('udfs:priorityQueue "bytes:4096..bytes:8191"')
    expect(savedSource).toContain('udfs:priorityQueue "bytes:8192..bytes:12287"')
    expect(savedSource).not.toContain('parserStatus')
  })

  it('adds remaining requested Ingest ranges from an expanded manifest that already has one priority', async () => {
    const firstRange = { start: 'bytes:4096', end: 'bytes:8191' }
    const secondRange = { start: 'bytes:8192', end: 'bytes:12287' }
    const manifestUri = 'https://pod.example/.data/ingest/sources/source/manifest.ttl'
    const manifest = createSourceIngestManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://source.example/report.pdf',
      sourceHash: 'sha256-v1',
      ingestVersion: 'pdf-ingest-v1',
      manifestUri,
      ingestedRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
      pendingRanges: [firstRange, secondRange],
      priorityQueue: [],
      readChunks: 1,
      totalChunks: 3,
      lastIngestedAt: '2026-06-18T00:00:00.000Z',
    })
    mocks.readRawTextResource.mockResolvedValue({
      uri: manifestUri,
      content: [
        `<${manifestUri}#manifest> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://undefineds.co/vocab/SourceIngestManifest> .`,
        `<${manifestUri}#manifest> <http://purl.org/dc/terms/source> <https://source.example/report.pdf> .`,
        `<${manifestUri}#manifest> <https://undefineds.co/vocab/sourceHash> "sha256-v1" .`,
        `<${manifestUri}#manifest> <https://undefineds.co/vocab/ingestVersion> "pdf-ingest-v1" .`,
        `<${manifestUri}#manifest> <https://undefineds.co/vocab/ingestStatus> "partial" .`,
        `<${manifestUri}#manifest> <https://undefineds.co/vocab/readChunks> 1 .`,
        `<${manifestUri}#manifest> <https://undefineds.co/vocab/totalChunks> 3 .`,
        `<${manifestUri}#manifest> <https://undefineds.co/vocab/indexedRange> "chunk:1..chunk:1" .`,
        `<${manifestUri}#manifest> <https://undefineds.co/vocab/pendingRange> "bytes:4096..bytes:8191" .`,
        `<${manifestUri}#manifest> <https://undefineds.co/vocab/pendingRange> "bytes:8192..bytes:12287" .`,
        `<${manifestUri}#manifest> <https://undefineds.co/vocab/priorityQueue> "bytes:4096..bytes:8191" .`,
        `<${manifestUri}#manifest> <https://undefineds.co/vocab/lastIndexedAt> "2026-06-18T01:00:00.000Z" .`,
        `<${manifestUri}#manifest> <https://undefineds.co/vocab/writesCanonicalContent> false .`,
      ].join('\n'),
      mimeType: 'text/turtle',
      etag: '"manifest-v2"',
      headers: {},
    })

    const result = await ensureSourceIngestManifestResource({ id: 'db' } as any, manifest, {
      requestedRanges: [firstRange, secondRange],
      requestedAt: '2026-06-18T02:00:00.000Z',
    })

    expect(result).toMatchObject({
      action: 'updated-priority',
      manifest: {
        priorityQueue: ['bytes:4096..bytes:8191', 'bytes:8192..bytes:12287'],
      },
    })
    expect(mocks.saveRawTextResource).toHaveBeenCalledTimes(1)
    const savedSource = mocks.saveRawTextResource.mock.calls[0]?.[2] as string
    expect(savedSource).toContain('udfs:priorityQueue "bytes:4096..bytes:8191"')
    expect(savedSource).toContain('udfs:priorityQueue "bytes:8192..bytes:12287"')
  })

  it('replaces a stale manifest when source hash changes', async () => {
    const manifest = createSourceIndexManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://source.example/report.pdf',
      sourceHash: 'sha256-v2',
      ingestVersion: 'pdf-ingest-v1',
      manifestUri: 'https://pod.example/.data/index/sources/source/manifest.ttl',
      lastIndexedAt: '2026-06-18T02:00:00.000Z',
    })
    mocks.readRawTextResource.mockResolvedValue({
      uri: manifest.manifestUri,
      content: [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '@prefix dcterms: <http://purl.org/dc/terms/> .',
        '',
        '<#manifest> a udfs:ParserIndexManifest ;',
        '  dcterms:source <https://source.example/report.pdf> ;',
        '  udfs:sourceHash "sha256-v1" ;',
        '  udfs:parserVersion "pdf-ingest-v1" ;',
        '  udfs:parserStatus "partial" ;',
        '  udfs:readChunks 1 ;',
        '  udfs:totalChunks 2 ;',
        '  udfs:lastParsedAt "2026-06-18T00:00:00.000Z" ;',
        '  udfs:writesCanonicalContent false .',
      ].join('\n'),
      mimeType: 'text/turtle',
      etag: '"manifest-v1"',
      headers: {},
    })

    await expect(ensureSourceIndexManifestResource({ id: 'db' } as any, manifest)).resolves.toMatchObject({
      action: 'replaced',
      manifest: expect.objectContaining({ sourceHash: 'sha256-v2' }),
    })
    expect(mocks.saveRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      expect.objectContaining({ etag: '"manifest-v1"' }),
      expect.stringMatching(/udfs:sourceHash "sha256-v2"/),
    )
  })

  it('replaces stale and failed Ingest manifests instead of reusing them', async () => {
    for (const status of ['stale', 'failed'] as const) {
      vi.clearAllMocks()
      const manifest = createSourceIngestManifest({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        sourceUri: 'https://source.example/report.pdf',
        sourceHash: 'sha256-v1',
        ingestVersion: 'pdf-ingest-v1',
        manifestUri: `https://pod.example/.data/ingest/sources/source-${status}/manifest.ttl`,
        status: 'partial',
        pendingRanges: [{ start: 'chunk:2', end: 'chunk:3' }],
        priorityQueue: ['chunk:2..chunk:3'],
        lastIngestedAt: '2026-06-18T02:00:00.000Z',
      })
      const staleExisting = createSourceIngestManifest({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        sourceUri: 'https://source.example/report.pdf',
        sourceHash: 'sha256-v1',
        ingestVersion: 'pdf-ingest-v1',
        manifestUri: manifest.manifestUri,
        status,
        lastIngestedAt: '2026-06-18T01:00:00.000Z',
      })
      mocks.readRawTextResource.mockResolvedValue({
        uri: manifest.manifestUri,
        content: renderSourceIngestManifestTurtle(staleExisting),
        mimeType: 'text/turtle',
        etag: `"manifest-${status}"`,
        headers: {},
      })

      await expect(ensureSourceIngestManifestResource({ id: 'db' } as any, manifest)).resolves.toMatchObject({
        action: 'replaced',
        manifest: expect.objectContaining({ status: 'partial' }),
      })

      const savedSource = mocks.saveRawTextResource.mock.calls[0]?.[2] as string
      expect(savedSource).toContain('udfs:SourceIngestManifest')
      expect(savedSource).toContain('udfs:ingestStatus "partial"')
      expect(savedSource).not.toContain('SourceIndexManifest')
      expect(savedSource).not.toContain('parserStatus')
      expect(savedSource).not.toContain('indexedRange')
    }
  })

  it('marks a queued source range ingested through the legacy manifest resource', async () => {
    const manifest = createSourceIndexManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://source.example/report.pdf',
      sourceHash: 'sha256-v1',
      ingestVersion: 'pdf-ingest-v1',
      manifestUri: 'https://pod.example/.data/index/sources/source/manifest.ttl',
      indexedRanges: [{ start: 'page:1', end: 'page:2' }],
      pendingRanges: [{ start: 'page:3', end: 'page:4' }],
      priorityQueue: ['page:3..page:4'],
      readChunks: 1,
      totalChunks: 2,
      lastIndexedAt: '2026-06-18T00:00:00.000Z',
    })
    mocks.readRawTextResource.mockResolvedValue({
      uri: manifest.manifestUri,
      content: renderSourceIndexManifestTurtle(manifest),
      mimeType: 'text/turtle',
      etag: '"manifest-v1"',
      headers: {},
    })

    const result = await markSourceIndexRangeIndexedResource({ id: 'db' } as any, manifest, {
      range: { start: 'page:3', end: 'page:4' },
      indexedAt: '2026-06-18T03:00:00.000Z',
    })

    expect(result).toMatchObject({
      action: 'marked-ingested',
      manifest: {
        status: 'complete',
        indexedRanges: [
          { start: 'page:1', end: 'page:2' },
          { start: 'page:3', end: 'page:4' },
        ],
        pendingRanges: [],
        priorityQueue: [],
        readChunks: 2,
        totalChunks: 2,
        lastIndexedAt: '2026-06-18T03:00:00.000Z',
        writesCanonicalContent: false,
      },
    })
    const savedSource = mocks.saveRawTextResource.mock.calls[0]?.[2] as string
    expect(mocks.saveRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      expect.objectContaining({ uri: manifest.manifestUri, etag: '"manifest-v1"' }),
      expect.any(String),
    )
    expect(savedSource).toContain('udfs:parserStatus "complete"')
    expect(savedSource).toContain('udfs:parsedRange "page:3..page:4"')
    expect(savedSource).toContain('udfs:writesCanonicalContent false')
  })

  it('does not mark a source range ingested when the manifest no longer matches the ingested source', async () => {
    const manifest = createSourceIndexManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://source.example/report.pdf',
      sourceHash: 'sha256-v2',
      ingestVersion: 'pdf-ingest-v1',
      manifestUri: 'https://pod.example/.data/index/sources/source/manifest.ttl',
    })
    const staleManifest = createSourceIndexManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://source.example/report.pdf',
      sourceHash: 'sha256-v1',
      ingestVersion: 'pdf-ingest-v1',
      manifestUri: manifest.manifestUri,
    })
    mocks.readRawTextResource.mockResolvedValue({
      uri: manifest.manifestUri,
      content: renderSourceIndexManifestTurtle(staleManifest),
      mimeType: 'text/turtle',
      etag: '"manifest-v1"',
      headers: {},
    })

    await expect(markSourceIndexRangeIndexedResource({ id: 'db' } as any, manifest, {
      range: { start: 'page:3', end: 'page:4' },
    })).rejects.toThrow('source hash or ingest version changed')
    expect(mocks.saveRawTextResource).not.toHaveBeenCalled()
  })
})
