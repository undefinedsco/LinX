import { describe, expect, it } from 'vitest'
import {
  canReuseSourceIngestManifest,
  createSourceIndexManifest,
  createSourceIngestManifest,
  markSourceIngestRangeIngested,
  parseSourceIndexManifestTurtle,
  parseSourceIngestManifestTurtle,
  queueSourceIngestRanges,
  renderSourceIndexManifestTurtle,
  renderSourceIngestManifestTurtle,
  resolveSourceIndexManifestUri,
  resolveSourceIngestManifestUri,
  sourceIngestManifestTurtleMatches,
} from './domain/source/source-ingest-manifest'

describe('Ingest manifest compatibility', () => {
  it('uses ingested field names as the primary Ingest manifest domain API', () => {
    const manifest = createSourceIngestManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://pod.example/public/source.pdf',
      sourceHash: 'sha256-source-1',
      ingestVersion: 'pdf-ingest-v2',
      ingestedRanges: [{ start: 'page:1', end: 'page:3' }],
      pendingRanges: [{ start: 'page:4', end: 'page:40' }],
      priorityQueue: ['page:4..page:40'],
      readChunks: 1,
      totalChunks: 2,
      lastIngestedAt: '2026-06-17T00:00:00.000Z',
    })

    expect(manifest).toMatchObject({
      kind: 'source-ingest-manifest',
      ingestedRanges: [{ start: 'page:1', end: 'page:3' }],
      lastIngestedAt: '2026-06-17T00:00:00.000Z',
    })
    expect(Object.keys(manifest)).toContain('ingestedRanges')
    expect(Object.keys(manifest)).toContain('lastIngestedAt')
    expect(Object.keys(manifest)).not.toContain('indexedRanges')
    expect(Object.keys(manifest)).not.toContain('lastIndexedAt')
    expect((manifest as any).indexedRanges).toEqual(manifest.ingestedRanges)
    expect((manifest as any).lastIndexedAt).toBe(manifest.lastIngestedAt)
  })

  it('exposes Ingest-named APIs for new Files code', () => {
    const manifest = createSourceIngestManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://pod.example/public/source.pdf',
      sourceHash: 'sha256-source-1',
      ingestVersion: 'pdf-ingest-v2',
      ingestedRanges: [{ start: 'page:1', end: 'page:3' }],
      pendingRanges: [{ start: 'page:4', end: 'page:40' }],
      priorityQueue: ['page:4..page:40'],
      readChunks: 1,
      totalChunks: 2,
      lastIngestedAt: '2026-06-17T00:00:00.000Z',
    })

    expect(manifest).toMatchObject({
      kind: 'source-ingest-manifest',
      manifestUri: 'https://pod.example/.data/ingest/sources/pod-example-public-source-0htirth/manifest.ttl',
    })
    expect(resolveSourceIngestManifestUri({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://pod.example/public/source.pdf',
    })).toBe(manifest.manifestUri)
    expect(canReuseSourceIngestManifest(manifest, {
      sourceUri: 'https://pod.example/public/source.pdf',
      sourceHash: 'sha256-source-1',
      ingestVersion: 'pdf-ingest-v2',
    })).toBe(true)

    const turtle = renderSourceIngestManifestTurtle(manifest)
    expect(turtle).toContain('udfs:SourceIngestManifest')
    expect(turtle).not.toContain('SourceIndexManifest')
    expect(turtle).not.toContain('ParserIndexManifest')
    expect(turtle).not.toContain('udfs:parserVersion')
    expect(turtle).not.toContain('udfs:indexedRange')
    expect(turtle).not.toContain('udfs:parsedRange')
    expect(turtle).not.toContain('udfs:lastIndexedAt')
    expect(turtle).not.toContain('udfs:lastParsedAt')
    expect(parseSourceIngestManifestTurtle(turtle, manifest.manifestUri)).toEqual(manifest)
    expect(markSourceIngestRangeIngested(manifest, {
      range: { start: 'page:4', end: 'page:40' },
      ingestedAt: '2026-06-18T00:00:00.000Z',
    })).toMatchObject({
      status: 'complete',
      ingestedRanges: [
        { start: 'page:1', end: 'page:3' },
        { start: 'page:4', end: 'page:40' },
      ],
      pendingRanges: [],
      priorityQueue: [],
      lastIngestedAt: '2026-06-18T00:00:00.000Z',
    })
  })

  it('queues requested Ingest ranges without duplicating existing pending or ingested ranges', () => {
    const manifest = createSourceIngestManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://pod.example/public/source.pdf',
      sourceHash: 'sha256-source-1',
      ingestVersion: 'pdf-ingest-v2',
      ingestedRanges: [{ start: 'page:1', end: 'page:3' }],
      pendingRanges: [{ start: 'page:4', end: 'page:6' }],
      priorityQueue: ['page:4..page:6'],
      readChunks: 1,
      totalChunks: 3,
      lastIngestedAt: '2026-06-17T00:00:00.000Z',
    })

    const queued = queueSourceIngestRanges(manifest, [
      { start: 'page:1', end: 'page:3' },
      { start: 'page:4', end: 'page:6' },
      { start: 'page:7', end: 'page:9' },
    ])

    expect(queued.changed).toBe(true)
    expect(queued.manifest).toMatchObject({
      status: 'partial',
      ingestedRanges: [{ start: 'page:1', end: 'page:3' }],
      pendingRanges: [
        { start: 'page:4', end: 'page:6' },
        { start: 'page:7', end: 'page:9' },
      ],
      priorityQueue: ['page:4..page:6', 'page:7..page:9'],
      writesCanonicalContent: false,
    })

    const unchanged = queueSourceIngestRanges(queued.manifest, [
      { start: 'page:4', end: 'page:6' },
    ])

    expect(unchanged).toEqual({
      manifest: queued.manifest,
      changed: false,
    })
  })

  it('resolves new Ingest manifests under the .data ingest convention', () => {
    expect(resolveSourceIngestManifestUri({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://solidproject.org/TR/protocol',
    })).toBe('https://pod.example/.data/ingest/sources/solidproject-org-tr-protocol-16f1jzu/manifest.ttl')
  })

  it('keeps the legacy source index resolver on the .data index convention', () => {
    expect(resolveSourceIndexManifestUri({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://solidproject.org/TR/protocol',
    })).toBe('https://pod.example/.data/index/sources/solidproject-org-tr-protocol-16f1jzu/manifest.ttl')
  })

  it('uses the explicit current Pod root for path-based Pod deployments', () => {
    expect(resolveSourceIngestManifestUri({
      documentUri: 'http://localhost:44470/test/index.ttl',
      sourceUri: 'https://source.example/linx-e2e-source.html',
      podRootUri: 'http://localhost:44470/test',
    })).toBe('http://localhost:44470/test/.data/ingest/sources/source-example-linx-e2e-source-1ix574v/manifest.ttl')
  })

  it('keeps query-distinct sources in separate Ingest manifests', () => {
    expect(resolveSourceIngestManifestUri({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://example.com/doc?id=1',
    })).not.toBe(resolveSourceIngestManifestUri({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://example.com/doc?id=2',
    }))
  })

  it('keeps the deprecated SourceIndex manifest writer for legacy .data/index resources', () => {
    const manifest = createSourceIndexManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://pod.example/public/source.pdf',
      sourceHash: 'sha256-source-1',
      ingestVersion: 'pdf-ingest-v2',
      indexedRanges: [{ start: 'page:1', end: 'page:3' }],
      pendingRanges: [{ start: 'page:4', end: 'page:40' }],
      priorityQueue: ['page:4', 'outline'],
      readChunks: 3,
      totalChunks: 40,
      lastIngestedAt: '2026-06-17T00:00:00.000Z',
    })

    expect(manifest).toMatchObject({
      id: 'https://pod.example/.data/index/sources/pod-example-public-source-0htirth/manifest.ttl#manifest',
      kind: 'source-index-manifest',
      status: 'partial',
      ingestedRanges: [{ start: 'page:1', end: 'page:3' }],
      lastIngestedAt: '2026-06-17T00:00:00.000Z',
      writesCanonicalContent: false,
    })
    expect(manifest).not.toHaveProperty('parsedRanges')
    expect(manifest).not.toHaveProperty('lastParsedAt')

    const turtle = renderSourceIndexManifestTurtle(manifest)
    expect(turtle).toContain('<#manifest> a udfs:SourceIndexManifest')
    expect(turtle).not.toContain('<#manifest> a udfs:ParserIndexManifest')
    expect(turtle).toContain('dcterms:source <https://pod.example/public/source.pdf>')
    expect(turtle).toContain('udfs:sourceHash "sha256-source-1"')
    expect(turtle).toContain('udfs:ingestVersion "pdf-ingest-v2"')
    expect(turtle).toContain('udfs:ingestStatus "partial"')
    expect(turtle).toContain('udfs:indexedRange "page:1..page:3"')
    expect(turtle).toContain('udfs:lastIndexedAt "2026-06-17T00:00:00.000Z"')
    expect(turtle).toContain('udfs:parserVersion "pdf-ingest-v2"')
    expect(turtle).toContain('udfs:parserStatus "partial"')
    expect(turtle).toContain('udfs:parsedRange "page:1..page:3"')
    expect(turtle).toContain('udfs:pendingRange "page:4..page:40"')
    expect(turtle).toContain('udfs:writesCanonicalContent false')
  })

  it('creates a lazy Ingest manifest without using the legacy index path', () => {
    const manifest = createSourceIngestManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://pod.example/public/source.pdf',
      sourceHash: 'sha256-source-1',
      ingestVersion: 'pdf-ingest-v2',
      lastIngestedAt: '2026-06-17T00:00:00.000Z',
    })

    expect(manifest.kind).toBe('source-ingest-manifest')
    expect(manifest.manifestUri).toBe('https://pod.example/.data/ingest/sources/pod-example-public-source-0htirth/manifest.ttl')
    expect(renderSourceIngestManifestTurtle(manifest)).toContain('udfs:SourceIngestManifest')
  })

  it('renders Ingest manifests without legacy source-index or parser predicates', () => {
    const manifest = createSourceIngestManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://pod.example/public/source.pdf',
      sourceHash: 'sha256-source-1',
      ingestVersion: 'pdf-ingest-v2',
      ingestedRanges: [{ start: 'page:1', end: 'page:3' }],
      lastIngestedAt: '2026-06-17T00:00:00.000Z',
    })

    const turtle = renderSourceIngestManifestTurtle(manifest)

    expect(turtle).toContain('<#manifest> a udfs:SourceIngestManifest ;')
    expect(turtle).not.toEqual(renderSourceIndexManifestTurtle(manifest))
    expect(turtle).not.toContain('<#manifest> a udfs:SourceIndexManifest ;')
    expect(turtle).not.toContain('SourceIndexManifest')
    expect(turtle).toContain('udfs:ingestVersion "pdf-ingest-v2"')
    expect(turtle).toContain('udfs:ingestStatus "partial"')
    expect(turtle).toContain('udfs:ingestedRange "page:1..page:3"')
    expect(turtle).toContain('udfs:lastIngestedAt "2026-06-17T00:00:00.000Z"')
    expect(turtle).not.toContain('udfs:indexedRange')
    expect(turtle).not.toContain('udfs:lastIndexedAt')
    expect(turtle).not.toContain('udfs:parserVersion')
    expect(turtle).not.toContain('udfs:parserStatus')
    expect(turtle).not.toContain('udfs:parsedRange')
    expect(turtle).not.toContain('udfs:lastParsedAt')
    expect(parseSourceIngestManifestTurtle(turtle, manifest.manifestUri)).toEqual(manifest)
  })

  it('reuses an Ingest manifest only when source hash and ingest version match', () => {
    const manifest = createSourceIngestManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://pod.example/public/source.pdf',
      sourceHash: 'sha256-source-1',
      ingestVersion: 'pdf-ingest-v2',
    })

    expect(canReuseSourceIngestManifest(manifest, {
      sourceUri: 'https://pod.example/public/source.pdf',
      sourceHash: 'sha256-source-1',
      ingestVersion: 'pdf-ingest-v2',
    })).toBe(true)
    expect(canReuseSourceIngestManifest(manifest, {
      sourceUri: 'https://pod.example/public/source.pdf',
      sourceHash: 'sha256-source-2',
      ingestVersion: 'pdf-ingest-v2',
    })).toBe(false)
  })

  it('does not reuse stale or failed Ingest manifests even when source identity matches', () => {
    const baseInput = {
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://pod.example/public/source.pdf',
      sourceHash: 'sha256-source-1',
      ingestVersion: 'pdf-ingest-v2',
    }
    const reusableInput = {
      sourceUri: 'https://pod.example/public/source.pdf',
      sourceHash: 'sha256-source-1',
      ingestVersion: 'pdf-ingest-v2',
    }

    expect(canReuseSourceIngestManifest(createSourceIngestManifest({
      ...baseInput,
      status: 'stale',
    }), reusableInput)).toBe(false)
    expect(canReuseSourceIngestManifest(createSourceIngestManifest({
      ...baseInput,
      status: 'failed',
    }), reusableInput)).toBe(false)
  })

  it('does not treat stale or failed manifest Turtle as reusable source state', () => {
    const reusableInput = {
      sourceUri: 'https://pod.example/public/source.pdf',
      sourceHash: 'sha256-source-1',
      ingestVersion: 'pdf-ingest-v2',
    }

    for (const status of ['stale', 'failed'] as const) {
      const manifest = createSourceIngestManifest({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        ...reusableInput,
        status,
      })

      expect(sourceIngestManifestTurtleMatches(renderSourceIngestManifestTurtle(manifest), reusableInput)).toBe(false)
    }
  })

  it('roundtrips stale and failed Ingest manifest states without legacy parser predicates', () => {
    for (const status of ['stale', 'failed'] as const) {
      const manifest = createSourceIngestManifest({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        sourceUri: 'https://pod.example/public/source.pdf',
        sourceHash: `sha256-source-${status}`,
        ingestVersion: 'pdf-ingest-v2',
        status,
        ingestedRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
        pendingRanges: [{ start: 'chunk:2', end: 'chunk:5' }],
        priorityQueue: ['chunk:2..chunk:5'],
        readChunks: 1,
        totalChunks: 5,
        lastIngestedAt: '2026-06-18T00:00:00.000Z',
      })

      const turtle = renderSourceIngestManifestTurtle(manifest)

      expect(turtle).toContain(`udfs:ingestStatus "${status}"`)
      expect(turtle).not.toContain('SourceIndexManifest')
      expect(turtle).not.toContain('parserStatus')
      expect(turtle).not.toContain('indexedRange')
      expect(parseSourceIngestManifestTurtle(turtle, manifest.manifestUri)).toEqual(manifest)
    }
  })

  it('parses a rendered Ingest manifest so unchanged source work can be reused', () => {
    const manifest = createSourceIngestManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://pod.example/public/source.pdf',
      sourceHash: 'sha256-source-1',
      ingestVersion: 'pdf-ingest-v2',
      ingestedRanges: [{ start: 'page:1', end: 'page:3' }],
      pendingRanges: [{ start: 'page:4', end: 'page:40' }],
      priorityQueue: ['page:4', 'outline'],
      readChunks: 3,
      totalChunks: 40,
      lastIngestedAt: '2026-06-17T00:00:00.000Z',
    })

    expect(parseSourceIngestManifestTurtle(renderSourceIngestManifestTurtle(manifest), manifest.manifestUri)).toEqual(manifest)
  })

  it('parses legacy parser manifests after a Pod expands prefixes to absolute IRIs', () => {
    const manifestUri = 'https://pod.example/.data/index/sources/report/manifest.ttl'
    const source = [
      '<https://pod.example/.data/index/sources/report/manifest.ttl#manifest> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://undefineds.co/vocab/ParserIndexManifest> .',
      '<https://pod.example/.data/index/sources/report/manifest.ttl#manifest> <http://purl.org/dc/terms/source> <https://source.example/report.html> .',
      '<https://pod.example/.data/index/sources/report/manifest.ttl#manifest> <https://undefineds.co/vocab/sourceHash> "fnv1a-source" .',
      '<https://pod.example/.data/index/sources/report/manifest.ttl#manifest> <https://undefineds.co/vocab/parserVersion> "url-parser-v1" .',
      '<https://pod.example/.data/index/sources/report/manifest.ttl#manifest> <https://undefineds.co/vocab/parserStatus> "partial" .',
      '<https://pod.example/.data/index/sources/report/manifest.ttl#manifest> <https://undefineds.co/vocab/readChunks> 1 .',
      '<https://pod.example/.data/index/sources/report/manifest.ttl#manifest> <https://undefineds.co/vocab/totalChunks> 3 .',
      '<https://pod.example/.data/index/sources/report/manifest.ttl#manifest> <https://undefineds.co/vocab/parsedRange> "chunk:1..chunk:1" .',
      '<https://pod.example/.data/index/sources/report/manifest.ttl#manifest> <https://undefineds.co/vocab/pendingRange> "chunk:2..chunk:3" .',
      '<https://pod.example/.data/index/sources/report/manifest.ttl#manifest> <https://undefineds.co/vocab/priorityQueue> "chunk:2" .',
      '<https://pod.example/.data/index/sources/report/manifest.ttl#manifest> <https://undefineds.co/vocab/lastParsedAt> "2026-06-18T00:00:00.000Z" .',
      '<https://pod.example/.data/index/sources/report/manifest.ttl#manifest> <https://undefineds.co/vocab/writesCanonicalContent> false .',
    ].join('\n')

    expect(parseSourceIndexManifestTurtle(source, manifestUri)).toEqual({
      id: `${manifestUri}#manifest`,
      kind: 'source-index-manifest',
      manifestUri,
      sourceUri: 'https://source.example/report.html',
      sourceHash: 'fnv1a-source',
      ingestVersion: 'url-parser-v1',
      status: 'partial',
      ingestedRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
      pendingRanges: [{ start: 'chunk:2', end: 'chunk:3' }],
      priorityQueue: ['chunk:2'],
      readChunks: 1,
      totalChunks: 3,
      lastIngestedAt: '2026-06-18T00:00:00.000Z',
      writesCanonicalContent: false,
    })
  })

  it('parses Ingest-named manifests without legacy parser predicates', () => {
    const manifestUri = 'https://pod.example/.data/index/sources/report/manifest.ttl'
    const source = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix dcterms: <http://purl.org/dc/terms/> .',
      '',
      '<#manifest> a udfs:SourceIndexManifest ;',
      '  dcterms:source <https://source.example/report.html> ;',
      '  udfs:sourceHash "fnv1a-source" ;',
      '  udfs:ingestVersion "url-ingest-v1" ;',
      '  udfs:ingestStatus "partial" ;',
      '  udfs:readChunks 1 ;',
      '  udfs:totalChunks 3 ;',
      '  udfs:ingestedRange "chunk:1..chunk:1" ;',
      '  udfs:pendingRange "chunk:2..chunk:3" ;',
      '  udfs:priorityQueue "chunk:2" ;',
      '  udfs:lastIngestedAt "2026-06-18T00:00:00.000Z" ;',
      '  udfs:writesCanonicalContent false .',
    ].join('\n')

    expect(parseSourceIngestManifestTurtle(source, manifestUri)).toEqual({
      id: `${manifestUri}#manifest`,
      kind: 'source-ingest-manifest',
      manifestUri,
      sourceUri: 'https://source.example/report.html',
      sourceHash: 'fnv1a-source',
      ingestVersion: 'url-ingest-v1',
      status: 'partial',
      ingestedRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
      pendingRanges: [{ start: 'chunk:2', end: 'chunk:3' }],
      priorityQueue: ['chunk:2'],
      readChunks: 1,
      totalChunks: 3,
      lastIngestedAt: '2026-06-18T00:00:00.000Z',
      writesCanonicalContent: false,
    })
  })

  it('moves an ingested range out of pending and priority queues for ingest-on-read updates', () => {
    const manifest = createSourceIngestManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://pod.example/public/source.pdf',
      sourceHash: 'sha256-source-1',
      ingestVersion: 'pdf-ingest-v2',
      status: 'partial',
      ingestedRanges: [{ start: 'page:1', end: 'page:3' }],
      pendingRanges: [
        { start: 'page:4', end: 'page:6' },
        { start: 'page:7', end: 'page:40' },
      ],
      priorityQueue: ['page:4..page:6', 'outline'],
      readChunks: 3,
      totalChunks: 40,
      lastIngestedAt: '2026-06-17T00:00:00.000Z',
    })

    const updated = markSourceIngestRangeIngested(manifest, {
      range: { start: 'page:4', end: 'page:6' },
      ingestedAt: '2026-06-18T00:00:00.000Z',
    })

    expect(updated).toMatchObject({
      status: 'partial',
      readChunks: 2,
      totalChunks: 40,
      lastIngestedAt: '2026-06-18T00:00:00.000Z',
      ingestedRanges: [
        { start: 'page:1', end: 'page:3' },
        { start: 'page:4', end: 'page:6' },
      ],
      pendingRanges: [{ start: 'page:7', end: 'page:40' }],
      priorityQueue: ['outline'],
      writesCanonicalContent: false,
    })
  })

  it('marks an Ingest manifest complete when the last pending range is ingested', () => {
    const manifest = createSourceIngestManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      sourceUri: 'https://pod.example/public/source.pdf',
      sourceHash: 'sha256-source-1',
      ingestVersion: 'pdf-ingest-v2',
      status: 'partial',
      ingestedRanges: [],
      pendingRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
      priorityQueue: ['chunk:1..chunk:1'],
      readChunks: 0,
      totalChunks: 1,
      lastIngestedAt: '2026-06-17T00:00:00.000Z',
    })

    expect(markSourceIngestRangeIngested(manifest, {
      range: { start: 'chunk:1', end: 'chunk:1' },
      ingestedAt: '2026-06-18T00:00:00.000Z',
    })).toMatchObject({
      status: 'complete',
      readChunks: 1,
      pendingRanges: [],
      priorityQueue: [],
      lastIngestedAt: '2026-06-18T00:00:00.000Z',
    })
  })
})
