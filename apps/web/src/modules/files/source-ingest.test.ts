import { describe, expect, it } from 'vitest'
import {
  createSourceIngestPlan,
  createSourceRefreshPlan,
  displaySourceIngestVersion,
  parseSourceLinkedCardTurtle,
  renderSourceLinkedCardTurtle,
} from './domain/source/source-ingest'
import type { SourceIngestManifest } from './domain/source/source-ingest-manifest'

type LegacyManifestAliases = {
  sourceIndexManifestUri: string
  sourceIndexManifest: SourceIngestManifest
}

type LegacyManifestUriAlias = {
  sourceIndexManifestUri: string
}

function legacyManifestAliases<T extends object>(value: T): T & LegacyManifestAliases {
  return value as T & LegacyManifestAliases
}

function legacyManifestUriAlias<T extends object | null>(value: T): T & LegacyManifestUriAlias {
  return value as T & LegacyManifestUriAlias
}

describe('Ingest plans', () => {
  it('formats legacy parser versions as Ingest versions for product display only', () => {
    expect(displaySourceIngestVersion('pdf-parser-v1')).toBe('pdf-ingest-v1')
    expect(displaySourceIngestVersion('url-parser-v1')).toBe('url-ingest-v1')
    expect(displaySourceIngestVersion('linx-parser-v1')).toBe('linx-ingest-v1')
    expect(displaySourceIngestVersion('pdf-ingest-v1')).toBe('pdf-ingest-v1')
  })

  it('uses Ingest source as the default source-linked card title', () => {
    const plan = createSourceIngestPlan({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
      sourceUri: 'https://example.com/report',
      sourceKind: 'url',
      title: '   ',
      sourceHash: 'sha256-url-1',
      ingestVersion: 'url-ingest-v1',
      snapshotAt: '2026-06-17T00:00:00.000Z',
    })

    expect(plan.title).toBe('Ingest source')
    expect(plan.targetResourceUri).toBe('https://pod.example/.data/workspaces/ws-1/cards/ingest-source.card.ttl')
    expect(plan.bodyResource.content).toContain('# Ingest source')
    expect(plan.sourceProposal.summary).toBe('审阅 Ingest source 的来源。')
  })

  it('keeps legacy parser version in compatibility metadata but not in staged user-facing content', () => {
    const plan = createSourceIngestPlan({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
      sourceUri: 'https://pod.example/public/report.pdf',
      sourceKind: 'pdf',
      title: 'PDF source',
      parserVersion: 'pdf-parser-v1',
      sourceHash: 'sha256-pdf-legacy',
      snapshotAt: '2026-06-17T00:00:00.000Z',
    })

    expect(legacyManifestAliases(plan).sourceIndexManifest.ingestVersion).toBe('pdf-parser-v1')
    expect(plan.sourceProposal.ingestVersion).toBe('pdf-parser-v1')
    expect(plan.bodyResource.content).toContain('Ingest: pdf-ingest-v1')
    expect(plan.bodyResource.content).not.toContain('Source Ingest:')
    expect(plan.bodyResource.content).not.toContain('pdf-parser-v1')
    expect(plan.sourceProposal.proposedContent).toContain('Ingest: pdf-ingest-v1')
    expect(plan.sourceProposal.proposedContent).not.toContain('Source Ingest:')
    expect(plan.sourceProposal.proposedContent).not.toContain('pdf-parser-v1')
  })

  it('plans an external URL as a source-linked card without canonical ingest content', () => {
    const plan = createSourceIngestPlan({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
      sourceUri: 'https://example.com/report?rev=1',
      sourceKind: 'url',
      title: 'Quarterly report',
      sourceHash: 'sha256-url-1',
      ingestVersion: 'url-ingest-v1',
      snapshotAt: '2026-06-17T00:00:00.000Z',
    })

    expect(plan).toMatchObject({
      sourceKind: 'url',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
      bodyResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md',
      subject: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl#card',
      sourceIngestManifestUri: 'https://pod.example/.data/ingest/sources/example-com-report-025svsu/manifest.ttl',
      writesCanonicalContent: false,
    })
    expect(plan.sourceIngestManifest).toBe(legacyManifestAliases(plan).sourceIndexManifest)
    expect(plan.sourceProposal.sourceIngestManifestUri).toBe(plan.sourceIngestManifestUri)
    expect(plan).not.toHaveProperty('parserManifestUri')
    expect(plan).not.toHaveProperty('parserManifest')
    expect(plan.bodyResource).toMatchObject({
      uri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md',
      mimeType: 'text/markdown',
      content: expect.stringContaining('# Quarterly report'),
      writesCanonicalContent: false,
    })
    expect(plan.bodyResource.content).toContain('Source: https://example.com/report?rev=1')
    expect(plan.bodyResource.content).toContain('<!-- linx-source-block id="chunk:1" hash="sha256-url-1" origin="source" -->')
    expect(plan.sourceIngestManifest).toMatchObject({
      sourceUri: 'https://example.com/report?rev=1',
      sourceHash: 'sha256-url-1',
      ingestVersion: 'url-ingest-v1',
      status: 'partial',
      ingestedRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
      pendingRanges: [{ start: 'chunk:2', end: 'chunk:*' }],
      writesCanonicalContent: false,
    })
    expect(plan.sourceProposal).toMatchObject({
      targetResourceUri: plan.bodyResourceUri,
      subject: plan.subject,
      sourceUri: 'https://example.com/report?rev=1',
      sourceIngestManifestUri: plan.sourceIngestManifestUri,
      ingestVersion: 'url-ingest-v1',
      operation: 'refresh-card',
      summary: '审阅 Quarterly report 的来源。',
      proposedContent: expect.stringContaining('# Quarterly report'),
      writesCanonicalContent: false,
    })
    expect(plan.sourceProposal).not.toHaveProperty('parserManifestUri')
    expect(plan.sourceProposal).not.toHaveProperty('parserVersion')
    expect(plan.sourceProposal.proposedContent).toContain('Source: https://example.com/report?rev=1')
    expect(plan.sourceProposal.proposedContent).toContain('<!-- linx-source-block id="chunk:1" hash="sha256-url-1" origin="source" -->')
    expect(plan.sourceProposal.proposedContent).toContain('Ingest record: https://pod.example/.data/ingest/sources/example-com-report-025svsu/manifest.ttl')
    expect(plan.sourceProposal.proposedContent).not.toContain('Ingest manifest:')

    const turtle = renderSourceLinkedCardTurtle(plan)
    expect(turtle).toContain('<#card> a udfs:SourceLinkedCard')
    expect(turtle).toContain('dcterms:source <https://example.com/report?rev=1>')
    expect(turtle).toContain('udfs:bodyResource <https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md>')
    expect(turtle).toContain('udfs:ingestManifest <https://pod.example/.data/ingest/sources/example-com-report-025svsu/manifest.ttl>')
    expect(turtle).toContain('udfs:ingestVersion "url-ingest-v1"')
    expect(turtle).not.toContain('udfs:parserManifest')
    expect(turtle).not.toContain('udfs:parserVersion')
    expect(turtle).toContain('udfs:sourceKind "url"')
    expect(turtle).toContain('udfs:sourceHash "sha256-url-1"')
    expect(turtle).toContain('udfs:writesCanonicalContent false')
    expect(turtle).not.toContain('Source Ingest draft for Quarterly report')
  })

  it('keeps sourceIndex compatibility fields readable but out of new Ingest object enumeration', () => {
    const plan = createSourceIngestPlan({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
      sourceUri: 'https://example.com/report',
      sourceKind: 'url',
      title: 'Quarterly report',
      sourceHash: 'sha256-url-1',
      ingestVersion: 'url-ingest-v1',
      snapshotAt: '2026-06-17T00:00:00.000Z',
    })

    expect(legacyManifestAliases(plan).sourceIndexManifestUri).toBe(plan.sourceIngestManifestUri)
    expect(legacyManifestAliases(plan).sourceIndexManifest).toBe(plan.sourceIngestManifest)
    expect(Object.keys(plan)).toContain('sourceIngestManifestUri')
    expect(Object.keys(plan)).toContain('sourceIngestManifest')
    expect(Object.keys(plan)).not.toContain('sourceIndexManifestUri')
    expect(Object.keys(plan)).not.toContain('sourceIndexManifest')
    expect({ ...plan }).not.toHaveProperty('sourceIndexManifestUri')
    expect({ ...plan }).not.toHaveProperty('sourceIndexManifest')
  })

  it('keeps PDF, DOC and PPT imports on the same card-first source contract', () => {
    const cases = [
      ['pdf', 'application/pdf', 'https://pod.example/public/source.pdf'],
      ['doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'https://pod.example/public/source.docx'],
      ['ppt', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'https://pod.example/public/source.pptx'],
    ] as const

    for (const [sourceKind, mimeType, sourceUri] of cases) {
      const plan = createSourceIngestPlan({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        sourceUri,
        sourceKind,
        mimeType,
        title: `${sourceKind.toUpperCase()} source`,
        sourceHash: `sha256-${sourceKind}-1`,
        ingestVersion: `${sourceKind}-ingest-v1`,
        snapshotAt: '2026-06-17T00:00:00.000Z',
      })

      expect(plan.sourceKind).toBe(sourceKind)
      expect(plan.mimeType).toBe(mimeType)
      expect(plan.targetResourceUri).toMatch(/\.card\.ttl$/)
      expect(plan.bodyResourceUri).toMatch(/\.md$/)
      expect(plan.sourceIngestManifest.sourceUri).toBe(sourceUri)
      expect(plan.sourceIngestManifest.writesCanonicalContent).toBe(false)
      expect(plan.sourceProposal.targetResourceUri).toBe(plan.bodyResourceUri)
      expect(plan.sourceProposal.proposedContent).toContain(`# ${sourceKind.toUpperCase()} source`)
      expect(plan.sourceProposal.writesCanonicalContent).toBe(false)
      expect(renderSourceLinkedCardTurtle(plan)).toContain(`udfs:sourceKind "${sourceKind}"`)
    }
  })

  it('keeps ingested non-URL fallback content on the original source kind and mime type', () => {
    const plan = createSourceIngestPlan({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
      sourceUri: 'https://pod.example/public/report.pdf',
      sourceKind: 'pdf',
      title: 'PDF source',
      ingestVersion: 'pdf-ingest-v1',
      snapshotAt: '2026-06-17T00:00:00.000Z',
      extractedSource: {
        content: '',
        sourceHash: 'sha256-pdf-empty',
        mimeType: 'application/pdf',
      },
    })

    expect(plan.sourceKind).toBe('pdf')
    expect(plan.mimeType).toBe('application/pdf')
    expect(plan.bodyResource.content).toContain('Kind: pdf')
    expect(plan.bodyResource.content).toContain('Format: application/pdf')
    expect(plan.sourceProposal.proposedContent).toContain('Kind: pdf')
    expect(plan.sourceProposal.proposedContent).toContain('Format: application/pdf')
  })

  it('counts the staged preview chunk plus binary byte ranges in Ingest progress', () => {
    const plan = createSourceIngestPlan({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
      sourceUri: 'https://pod.example/public/report.pdf',
      sourceKind: 'pdf',
      title: 'PDF source',
      ingestVersion: 'pdf-ingest-v1',
      snapshotAt: '2026-06-17T00:00:00.000Z',
      extractedSource: {
        content: '# PDF source',
        sourceHash: 'sha256-pdf-byte-ranges',
        mimeType: 'application/pdf',
        totalChunks: 2,
        pendingRanges: [
          { start: 'bytes:0', end: 'bytes:4095' },
          { start: 'bytes:4096', end: 'bytes:8191' },
        ],
        priorityQueue: [
          'bytes:0..bytes:4095',
          'bytes:4096..bytes:8191',
        ],
      },
    })

    expect(plan.sourceIngestManifest).toMatchObject({
      status: 'partial',
      ingestedRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
      pendingRanges: [
        { start: 'bytes:0', end: 'bytes:4095' },
        { start: 'bytes:4096', end: 'bytes:8191' },
      ],
      readChunks: 1,
      totalChunks: 3,
      writesCanonicalContent: false,
    })
  })

  it('uses ingested URL content when the first source chunk is available', () => {
    const plan = createSourceIngestPlan({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
      sourceUri: 'https://example.com/report',
      sourceKind: 'url',
      title: 'Quarterly report',
      ingestVersion: 'url-ingest-v1',
      snapshotAt: '2026-06-17T00:00:00.000Z',
      extractedSource: {
        content: [
          '# Quarterly report',
          '',
          'Source: https://example.com/report',
          '',
          'Revenue increased after the launch.',
        ].join('\n'),
        sourceHash: 'fnv1a-source',
        mimeType: 'text/html',
        totalChunks: 1,
        pendingRanges: [],
        priorityQueue: [],
      },
    })

    expect(plan.bodyResource.content).toContain('<!-- linx-source-block id="chunk:1" hash="fnv1a-source" origin="source" -->')
    expect(plan.bodyResource.content).toContain('Revenue increased after the launch.')
    expect(plan.bodyResource.content).not.toContain('waiting for approval')
    expect(plan.sourceIngestManifest).toMatchObject({
      sourceHash: 'fnv1a-source',
      status: 'complete',
      ingestedRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
      pendingRanges: [],
      priorityQueue: [],
      readChunks: 1,
      totalChunks: 1,
    })
    expect(plan.sourceProposal.proposedContent).toContain('Revenue increased after the launch.')
  })

  it('keeps source artifacts inside an explicit path-based Pod root', () => {
    const plan = createSourceIngestPlan({
      documentUri: 'http://localhost:44470/test/index.ttl',
      containerUri: 'http://localhost:44470/test/',
      sourceUri: 'https://source.example/linx-e2e-source.html',
      sourceKind: 'url',
      title: 'Ingest source',
      sourceHash: 'sha256-url-1',
      ingestVersion: 'url-ingest-v1',
      snapshotAt: '2026-06-17T00:00:00.000Z',
      podRootUri: 'http://localhost:44470/test',
    })

    expect(plan.sourceIngestManifestUri).toBe('http://localhost:44470/test/.data/ingest/sources/source-example-linx-e2e-source-1ix574v/manifest.ttl')
    expect(plan.sourceProposal.proposalResourceUri).toMatch(
      /^http:\/\/localhost:44470\/test\/\.data\/proposals\/source\/http-localhost-44470-test-ingest-source-card-ttl-card-https-source-example-linx-e2e-source-html-[a-z0-9]{7}\.ttl$/,
    )
  })

  it('parses source-linked card turtle for file detail previews', () => {
    const plan = createSourceIngestPlan({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
      sourceUri: 'https://example.com/report.pdf',
      sourceKind: 'pdf',
      title: 'Quarterly report',
      sourceHash: 'sha256-pdf-1',
      ingestVersion: 'pdf-ingest-v1',
      snapshotAt: '2026-06-17T00:00:00.000Z',
    })

    const descriptor = parseSourceLinkedCardTurtle(renderSourceLinkedCardTurtle(plan))

    expect(descriptor).toEqual({
      title: 'Quarterly report',
      tags: [],
      tagsPreviousValues: [],
      reviewStatus: '',
      reviewStatusPreviousValues: [],
      sourceUri: 'https://example.com/report.pdf',
      mimeType: 'application/pdf',
      sourceKind: 'pdf',
      sourceHash: 'sha256-pdf-1',
      ingestVersion: 'pdf-ingest-v1',
      sourceIngestManifestUri: 'https://pod.example/.data/ingest/sources/example-com-report-0yjxs9y/manifest.ttl',
      bodyResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md',
      createdAt: '2026-06-17T00:00:00.000Z',
      writesCanonicalContent: false,
    })
    expect(legacyManifestUriAlias(descriptor)?.sourceIndexManifestUri).toBe(descriptor?.sourceIngestManifestUri)
    expect(Object.keys(descriptor ?? {})).not.toContain('sourceIndexManifestUri')
  })

  it('parses source-linked card descriptors after a Pod expands prefixes to absolute IRIs', () => {
    const source = [
      '<https://pod.example/cards/source.card.ttl#card> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://undefineds.co/vocab/SourceLinkedCard> .',
      '<https://pod.example/cards/source.card.ttl#card> <http://www.w3.org/2000/01/rdf-schema#label> "Ingest source" .',
      '<https://pod.example/cards/source.card.ttl#card> <https://undefineds.co/vocab/tags> "source-linked", "research" .',
      '<https://pod.example/cards/source.card.ttl#card> <https://undefineds.co/vocab/reviewStatus> "Needs review" .',
      '<https://pod.example/cards/source.card.ttl#card> <http://purl.org/dc/terms/source> <https://source.example/linx-e2e-source.html> .',
      '<https://pod.example/cards/source.card.ttl#card> <http://purl.org/dc/terms/format> "text/html" .',
      '<https://pod.example/cards/source.card.ttl#card> <https://undefineds.co/vocab/sourceKind> "url" .',
      '<https://pod.example/cards/source.card.ttl#card> <https://undefineds.co/vocab/sourceHash> "fnv1a-1l40hld" .',
      '<https://pod.example/cards/source.card.ttl#card> <https://undefineds.co/vocab/parserVersion> "url-parser-v1" .',
      '<https://pod.example/cards/source.card.ttl#card> <https://undefineds.co/vocab/parserManifest> <https://pod.example/.data/index/sources/source-example-linx-e2e-source-1ix574v/manifest.ttl> .',
      '<https://pod.example/cards/source.card.ttl#card> <https://undefineds.co/vocab/bodyResource> <https://pod.example/cards/source.md> .',
      '<https://pod.example/cards/source.card.ttl#card> <http://purl.org/dc/terms/created> "2026-06-18T03:13:32.404Z" .',
      '<https://pod.example/cards/source.card.ttl#card> <https://undefineds.co/vocab/writesCanonicalContent> false .',
    ].join('\n')

    const descriptor = parseSourceLinkedCardTurtle(source)

    expect(descriptor).toEqual({
      title: 'Ingest source',
      tags: ['source-linked', 'research'],
      tagsPreviousValues: ['"source-linked"', '"research"'],
      reviewStatus: 'Needs review',
      reviewStatusPreviousValues: ['"Needs review"'],
      sourceUri: 'https://source.example/linx-e2e-source.html',
      mimeType: 'text/html',
      sourceKind: 'url',
      sourceHash: 'fnv1a-1l40hld',
      ingestVersion: 'url-parser-v1',
      sourceIngestManifestUri: 'https://pod.example/.data/index/sources/source-example-linx-e2e-source-1ix574v/manifest.ttl',
      bodyResourceUri: 'https://pod.example/cards/source.md',
      createdAt: '2026-06-18T03:13:32.404Z',
      writesCanonicalContent: false,
    })
    expect(legacyManifestUriAlias(descriptor)?.sourceIndexManifestUri).toBe(descriptor?.sourceIngestManifestUri)
    expect(Object.keys(descriptor ?? {})).not.toContain('sourceIndexManifestUri')
  })

  it('parses Ingest-named source-linked card descriptors without legacy parser predicates', () => {
    const source = [
      '<https://pod.example/cards/source.card.ttl#card> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://undefineds.co/vocab/SourceLinkedCard> .',
      '<https://pod.example/cards/source.card.ttl#card> <http://www.w3.org/2000/01/rdf-schema#label> "Ingest source" .',
      '<https://pod.example/cards/source.card.ttl#card> <http://purl.org/dc/terms/source> <https://source.example/linx-e2e-source.html> .',
      '<https://pod.example/cards/source.card.ttl#card> <http://purl.org/dc/terms/format> "text/html" .',
      '<https://pod.example/cards/source.card.ttl#card> <https://undefineds.co/vocab/sourceKind> "url" .',
      '<https://pod.example/cards/source.card.ttl#card> <https://undefineds.co/vocab/sourceHash> "fnv1a-1l40hld" .',
      '<https://pod.example/cards/source.card.ttl#card> <https://undefineds.co/vocab/ingestVersion> "url-ingest-v1" .',
      '<https://pod.example/cards/source.card.ttl#card> <https://undefineds.co/vocab/ingestManifest> <https://pod.example/.data/ingest/sources/source-example-linx-e2e-source-1ix574v/manifest.ttl> .',
      '<https://pod.example/cards/source.card.ttl#card> <https://undefineds.co/vocab/bodyResource> <https://pod.example/cards/source.md> .',
      '<https://pod.example/cards/source.card.ttl#card> <http://purl.org/dc/terms/created> "2026-06-18T03:13:32.404Z" .',
      '<https://pod.example/cards/source.card.ttl#card> <https://undefineds.co/vocab/writesCanonicalContent> false .',
    ].join('\n')

    const descriptor = parseSourceLinkedCardTurtle(source)

    expect(descriptor).toMatchObject({
      ingestVersion: 'url-ingest-v1',
      sourceIngestManifestUri: 'https://pod.example/.data/ingest/sources/source-example-linx-e2e-source-1ix574v/manifest.ttl',
      writesCanonicalContent: false,
    })
    expect(legacyManifestUriAlias(descriptor)?.sourceIndexManifestUri).toBe(descriptor?.sourceIngestManifestUri)
    expect(Object.keys(descriptor ?? {})).not.toContain('sourceIndexManifestUri')
  })

  it('plans a changed source refresh as a staged source update proposal', () => {
    const plan = createSourceRefreshPlan({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
      subject: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl#card',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md',
      sourceUri: 'https://example.com/report',
      sourceKind: 'url',
      title: 'Quarterly report',
      mimeType: 'text/html',
      currentSourceHash: 'fnv1a-old',
      ingestVersion: 'url-ingest-v1',
      sourceIngestManifestUri: 'https://pod.example/.data/index/sources/example-com-report-01rzlsa/manifest.ttl',
      snapshotAt: '2026-06-18T00:00:00.000Z',
      extractedSource: {
        content: '# Quarterly report\n\nFresh source body.',
        sourceHash: 'fnv1a-new',
        mimeType: 'text/html',
        totalChunks: 1,
        pendingRanges: [],
        priorityQueue: [],
      },
    })

    expect(plan).toMatchObject({
      action: 'changed',
      sourceKind: 'url',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md',
      sourceIngestManifestUri: 'https://pod.example/.data/index/sources/example-com-report-01rzlsa/manifest.ttl',
      writesCanonicalContent: false,
    })
    expect(plan).not.toHaveProperty('parserManifestUri')
    expect(plan).not.toHaveProperty('parserManifest')
    expect(plan.sourceIngestManifest).toMatchObject({
      sourceHash: 'fnv1a-new',
      status: 'complete',
      ingestedRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
      pendingRanges: [],
      priorityQueue: [],
      writesCanonicalContent: false,
    })
    expect(plan.sourceProposal).toMatchObject({
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md',
      sourceIngestManifestUri: 'https://pod.example/.data/index/sources/example-com-report-01rzlsa/manifest.ttl',
      sourceHash: 'fnv1a-new',
      operation: 'refresh-card',
      summary: '审阅 Quarterly report 的来源刷新。',
      diff: '来源 https://example.com/report 已变化；Ingest 输出已进入审批。',
      proposedContent: expect.stringContaining('Fresh source body.'),
      writesCanonicalContent: false,
    })
    expect(plan.sourceProposal).not.toHaveProperty('parserManifestUri')
    expect(plan.sourceProposal).not.toHaveProperty('parserVersion')
    expect(plan.sourceProposal?.proposedContent).toContain('<!-- linx-source-block id="chunk:1" hash="fnv1a-new" origin="source" -->')
  })

  it('keeps changed non-URL refresh fallback content on the original source kind and mime type', () => {
    const plan = createSourceRefreshPlan({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/pdf-source.card.ttl',
      subject: 'https://pod.example/.data/workspaces/ws-1/cards/pdf-source.card.ttl#card',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/pdf-source.md',
      sourceUri: 'https://pod.example/public/report.pdf',
      sourceKind: 'pdf',
      title: 'PDF source',
      mimeType: 'application/pdf',
      currentSourceHash: 'sha256-old',
      ingestVersion: 'pdf-ingest-v1',
      sourceIngestManifestUri: 'https://pod.example/.data/index/sources/pod-example-public-report-1a7gx2m/manifest.ttl',
      snapshotAt: '2026-06-18T00:00:00.000Z',
      extractedSource: {
        content: '',
        sourceHash: 'sha256-new',
        mimeType: 'application/pdf',
      },
    })

    expect(plan.action).toBe('changed')
    expect(plan.sourceKind).toBe('pdf')
    expect(plan.mimeType).toBe('application/pdf')
    expect(plan.sourceProposal?.proposedContent).toContain('Kind: pdf')
    expect(plan.sourceProposal?.proposedContent).toContain('Format: application/pdf')
  })

  it('plans an unchanged source refresh without creating a proposal', () => {
    const plan = createSourceRefreshPlan({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
      subject: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl#card',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md',
      sourceUri: 'https://example.com/report',
      sourceKind: 'url',
      title: 'Quarterly report',
      currentSourceHash: 'fnv1a-same',
      ingestVersion: 'url-ingest-v1',
      sourceIngestManifestUri: 'https://pod.example/.data/index/sources/example-com-report-01rzlsa/manifest.ttl',
      snapshotAt: '2026-06-18T00:00:00.000Z',
      extractedSource: {
        content: '# Quarterly report\n\nSame source body.',
        sourceHash: 'fnv1a-same',
        mimeType: 'text/html',
        totalChunks: 1,
        pendingRanges: [],
        priorityQueue: [],
      },
    })

    expect(plan.action).toBe('unchanged')
    expect(plan.sourceProposal).toBeNull()
    expect(plan.sourceIngestManifest).toMatchObject({
      manifestUri: 'https://pod.example/.data/index/sources/example-com-report-01rzlsa/manifest.ttl',
      sourceHash: 'fnv1a-same',
      status: 'complete',
      writesCanonicalContent: false,
    })
    expect(plan.writesCanonicalContent).toBe(false)
  })
})
