import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import * as sourceIngestSnapshotModule from './data/ingest/source-ingest-snapshot'
import {
  createSourceIngestSnapshot,
  createSourceIngestUrlSnapshot,
  htmlToReadableText,
  markdownFromHtmlSourceSnapshot,
} from './data/ingest/source-ingest-snapshot'
import { createExtractedSourceSnapshot } from './data/ingest/source-extractor-compat'

describe('Ingest snapshot', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('extracts readable markdown from a fetchable HTML source', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      text: async () => [
        '<html>',
        '<head><title>Release &amp; Notes</title><meta name="description" content="Planning summary"></head>',
        '<body><nav>Navigation</nav><main><h1>Release Notes</h1><p>Ship Ingest.</p></main></body>',
        '</html>',
      ].join(''),
    }))

    const snapshot = await createSourceIngestUrlSnapshot({
      sourceUri: 'https://example.com/release',
      title: 'Fallback title',
    })

    expect(fetch).toHaveBeenCalledWith('https://example.com/release', { credentials: 'omit' })
    expect(snapshot).toMatchObject({
      mimeType: 'text/html',
      totalChunks: 1,
      pendingRanges: [],
      priorityQueue: [],
    })
    expect(snapshot?.sourceHash).toMatch(/^fnv1a-/)
    expect(snapshot?.content).toContain('# Release & Notes')
    expect(snapshot?.content).toContain('> Planning summary')
    expect(snapshot?.content).toContain('Ship Ingest.')
    expect(snapshot?.content).not.toContain('Navigation')
  })

  it('returns undefined when a source cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(createSourceIngestUrlSnapshot({
      sourceUri: 'https://example.com/blocked',
      title: 'Blocked',
    })).resolves.toBeUndefined()
  })

  it('keeps extracted text compact and free of script/style chrome', () => {
    expect(htmlToReadableText('<style>.x{}</style><script>x()</script><main><p>A</p><p>B&nbsp;C</p></main>')).toBe('A\nB C')
    expect(markdownFromHtmlSourceSnapshot({
      title: 'Doc',
      sourceUri: 'https://example.com/doc',
      html: '<main><p>Hello</p></main>',
      contentType: 'text/html',
    })).toContain('Source: https://example.com/doc')
  })

  it('queues non-url document byte ranges for progressive Ingest', async () => {
    const bytes = new Uint8Array(10_500)
    bytes.fill(37)
    const fetchSource = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      arrayBuffer: async () => bytes.buffer,
    })

    const snapshot = await createSourceIngestSnapshot({
      sourceUri: 'https://pod.example/files/report.pdf',
      title: 'Quarterly Report',
      sourceKind: 'pdf',
      fetchSource,
    })

    expect(fetchSource).toHaveBeenCalledWith('https://pod.example/files/report.pdf')
    expect(snapshot).toMatchObject({
      mimeType: 'application/pdf',
      totalChunks: 3,
      pendingRanges: [
        { start: 'bytes:0', end: 'bytes:4095' },
        { start: 'bytes:4096', end: 'bytes:8191' },
        { start: 'bytes:8192', end: 'bytes:10499' },
      ],
      priorityQueue: [
        'bytes:0..bytes:4095',
        'bytes:4096..bytes:8191',
        'bytes:8192..bytes:10499',
      ],
    })
    expect(snapshot?.content).toContain('Ingest queued this resource for progressive processing.')
    expect(snapshot?.content).toContain('Chunks: 3')
  })

  it('keeps the deprecated extracted source snapshot alias readable for legacy callers', async () => {
    const bytes = new Uint8Array(4096)
    bytes.fill(37)
    const fetchSource = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      arrayBuffer: async () => bytes.buffer,
    })

    const snapshot = await createExtractedSourceSnapshot({
      sourceUri: 'https://pod.example/files/report.pdf',
      title: 'Quarterly Report',
      sourceKind: 'pdf',
      fetchSource,
    })

    expect(snapshot?.content).toContain('Ingest queued this resource for progressive processing.')
    expect(snapshot?.pendingRanges).toEqual([{ start: 'bytes:0', end: 'bytes:4095' }])
  })

  it('keeps the deprecated adapter alias as an Ingest adapter fallback', async () => {
    const bytes = new TextEncoder().encode('%PDF extracted elsewhere')
    const fetchSource = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      arrayBuffer: async () => bytes.buffer,
    })
    const extractDocument = vi.fn().mockResolvedValue({
      markdown: '# Ingested PDF\n\nOCR converted body.',
      sourceHash: 'sha256-extracted-pdf',
      mimeType: 'text/markdown',
      totalChunks: 2,
      pendingRanges: [{ start: 'page:3', end: 'page:8' }],
      priorityQueue: ['page:3..page:8'],
    })

    const snapshot = await createExtractedSourceSnapshot({
      sourceUri: 'https://pod.example/files/report.pdf',
      title: 'Quarterly Report',
      sourceKind: 'pdf',
      fetchSource,
      extractDocument,
    })

    expect(extractDocument).toHaveBeenCalledTimes(1)
    const ingestInput = extractDocument.mock.calls[0]?.[0]
    expect(ingestInput).toMatchObject({
      sourceUri: 'https://pod.example/files/report.pdf',
      sourceKind: 'pdf',
      mimeType: 'application/pdf',
      title: 'Quarterly Report',
    })
    expect(Array.from(ingestInput.bytes)).toEqual(Array.from(bytes))
    expect(snapshot).toMatchObject({
      sourceHash: 'sha256-extracted-pdf',
      mimeType: 'text/markdown',
      totalChunks: 2,
      pendingRanges: [{ start: 'page:3', end: 'page:8' }],
      priorityQueue: ['page:3..page:8'],
    })
    expect(snapshot?.content).toContain('OCR converted body.')
    expect(snapshot?.content).not.toContain('Ingest queued this resource')
  })

  it('uses an Ingest adapter boundary for xpod extraction results', async () => {
    const bytes = new TextEncoder().encode('%PDF extracted by xpod')
    const fetchSource = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      arrayBuffer: async () => bytes.buffer,
    })
    const ingestAdapter = vi.fn().mockResolvedValue({
      markdown: '# Ingested PDF\n\nxpod OCR body.',
      sourceHash: 'sha256-xpod-ocr',
      mimeType: 'text/markdown',
      totalChunks: 1,
      pendingRanges: [],
      priorityQueue: [],
    })

    const snapshot = await createSourceIngestSnapshot({
      sourceUri: 'https://pod.example/files/report.pdf',
      title: 'Quarterly Report',
      sourceKind: 'pdf',
      fetchSource,
      ingestAdapter,
    })

    expect(ingestAdapter).toHaveBeenCalledTimes(1)
    expect(ingestAdapter.mock.calls[0]?.[0]).toMatchObject({
      sourceUri: 'https://pod.example/files/report.pdf',
      sourceKind: 'pdf',
      mimeType: 'application/pdf',
      title: 'Quarterly Report',
    })
    expect(Array.from(ingestAdapter.mock.calls[0]?.[0].bytes)).toEqual(Array.from(bytes))
    expect(snapshot).toMatchObject({
      sourceHash: 'sha256-xpod-ocr',
      mimeType: 'text/markdown',
      totalChunks: 1,
      pendingRanges: [],
      priorityQueue: [],
    })
    expect(snapshot?.content).toContain('xpod OCR body.')
    expect(snapshot?.content).not.toContain('Ingest queued this resource')
  })

  it('uses injected fetch and Ingest adapter boundaries for URL snapshots', async () => {
    const sourceBytes = new TextEncoder().encode('<main><p>Runtime URL body.</p></main>')
    const fetchSource = vi.fn().mockResolvedValue(new Response(sourceBytes, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }))
    const globalFetch = vi.fn().mockResolvedValue(new Response('<main><p>Global URL body.</p></main>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }))
    const ingestAdapter = vi.fn().mockResolvedValue({
      markdown: '# Runtime URL\n\nAdapter rendered body.',
      sourceHash: 'sha256-runtime-url',
      mimeType: 'text/markdown',
      totalChunks: 1,
      pendingRanges: [],
      priorityQueue: [],
    })
    vi.stubGlobal('fetch', globalFetch)

    const snapshot = await createSourceIngestSnapshot({
      sourceUri: 'https://example.com/runtime',
      title: 'Runtime URL',
      sourceKind: 'url',
      fetchSource,
      ingestAdapter,
    })

    expect(fetchSource).toHaveBeenCalledWith('https://example.com/runtime')
    expect(globalFetch).not.toHaveBeenCalled()
    expect(ingestAdapter).toHaveBeenCalledTimes(1)
    expect(ingestAdapter.mock.calls[0]?.[0]).toMatchObject({
      sourceUri: 'https://example.com/runtime',
      title: 'Runtime URL',
      sourceKind: 'url',
      mimeType: 'text/html',
    })
    expect(Array.from(ingestAdapter.mock.calls[0]?.[0].bytes)).toEqual(Array.from(sourceBytes))
    expect(snapshot).toMatchObject({
      content: '# Runtime URL\n\nAdapter rendered body.',
      sourceHash: 'sha256-runtime-url',
      mimeType: 'text/markdown',
      totalChunks: 1,
      pendingRanges: [],
      priorityQueue: [],
    })
  })

  it('does not accept deprecated adapter aliases on the canonical Ingest snapshot API', async () => {
    const bytes = new TextEncoder().encode('%PDF extracted elsewhere')
    const fetchSource = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      arrayBuffer: async () => bytes.buffer,
    })
    const extractDocument = vi.fn().mockResolvedValue({
      markdown: '# Deprecated alias body',
      sourceHash: 'sha256-deprecated-alias',
      mimeType: 'text/markdown',
      totalChunks: 1,
      pendingRanges: [],
      priorityQueue: [],
    })

    const snapshot = await createSourceIngestSnapshot({
      sourceUri: 'https://pod.example/files/report.pdf',
      title: 'Quarterly Report',
      sourceKind: 'pdf',
      fetchSource,
      extractDocument,
    } as Parameters<typeof createSourceIngestSnapshot>[0] & { extractDocument: typeof extractDocument })

    expect(extractDocument).not.toHaveBeenCalled()
    expect(snapshot?.content).toContain('Ingest queued this resource for progressive processing.')
    expect(snapshot?.content).not.toContain('Deprecated alias body')
  })

  it('falls back to progressive Ingest ranges when the Ingest adapter fails', async () => {
    const bytes = new Uint8Array(5_000)
    bytes.fill(37)
    const fetchSource = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      arrayBuffer: async () => bytes.buffer,
    })
    const ingestAdapter = vi.fn().mockRejectedValue(new Error('xpod OCR unavailable'))

    const snapshot = await createSourceIngestSnapshot({
      sourceUri: 'https://pod.example/files/report.pdf',
      title: 'Quarterly Report',
      sourceKind: 'pdf',
      fetchSource,
      ingestAdapter,
    })

    expect(ingestAdapter).toHaveBeenCalledTimes(1)
    expect(snapshot).toMatchObject({
      mimeType: 'application/pdf',
      totalChunks: 2,
      pendingRanges: [
        { start: 'bytes:0', end: 'bytes:4095' },
        { start: 'bytes:4096', end: 'bytes:4999' },
      ],
      priorityQueue: [
        'bytes:0..bytes:4095',
        'bytes:4096..bytes:4999',
      ],
    })
    expect(snapshot?.sourceHash).toMatch(/^fnv1a-/)
    expect(snapshot?.content).toContain('Ingest queued this resource for progressive processing.')
    expect(snapshot?.content).toContain('Ingest adapter issue: xpod OCR unavailable')
    expect(snapshot?.adapterFailure).toBe('xpod OCR unavailable')
  })

  it('keeps the primary snapshot input contract on Ingest adapter wording', () => {
    const source = readFileSync('src/modules/files/data/ingest/source-ingest-snapshot.ts', 'utf8')
    const inputContract = source.match(/export interface SourceIngestSnapshotInput \{[\s\S]*?\n\}/)?.[0] ?? ''
    const compatibilityContract = source.match(/interface SourceIngestSnapshotCompatibilityInput \{[\s\S]*?\n\}/)?.[0] ?? ''
    const createSignature = source.match(/export async function createSourceIngestSnapshot<T extends SourceIngestSnapshotInput>\(input: T\)/)?.[0] ?? ''

    expect(inputContract).toContain('ingestAdapter?: SourceIngestAdapter')
    expect(inputContract).not.toMatch(/\bextractDocument\b|\bextractor\b|\bparser\b/i)
    expect(compatibilityContract).toBe('')
    expect(source).not.toContain('extractDocument')
    expect(createSignature).toContain('SourceIngestSnapshotInput')
  })

  it('keeps the canonical snapshot module free of legacy extracted/exported adapter names', () => {
    expect(sourceIngestSnapshotModule).not.toHaveProperty('createExtractedSourceSnapshot')
    expect(sourceIngestSnapshotModule).not.toHaveProperty('createExtractedUrlSnapshot')

    const source = readFileSync('src/modules/files/data/ingest/source-ingest-snapshot.ts', 'utf8')
    expect(source).not.toMatch(/\bexport type SourceDocumentExtractor\b/)
    expect(source).not.toMatch(/\bexport type SourceDocumentExtraction(Input|Result)\b/)
  })

  it('does not describe the Ingest adapter boundary as extraction in canonical source comments', () => {
    const source = readFileSync('src/modules/files/data/ingest/source-ingest-snapshot.ts', 'utf8')

    expect(source).not.toMatch(/\bextract(or|ion)?\b/i)
    expect(source).toMatch(/\bIngest adapter\b/)
  })

  it('extracts readable text document content instead of staging only Ingest boilerplate', async () => {
    const encoder = new TextEncoder()
    const bytes = encoder.encode('# Local Note\n\nCaptured markdown body.')
    const fetchSource = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/markdown; charset=utf-8' }),
      arrayBuffer: async () => bytes.buffer,
    })

    const snapshot = await createSourceIngestSnapshot({
      sourceUri: 'https://pod.example/files/note.md',
      title: 'Local Note',
      sourceKind: 'doc',
      fetchSource,
    })

    expect(snapshot).toMatchObject({
      mimeType: 'text/markdown',
      totalChunks: 1,
      pendingRanges: [],
      priorityQueue: [],
    })
    expect(snapshot?.content).toContain('# Local Note')
    expect(snapshot?.content).toContain('Captured markdown body.')
    expect(snapshot?.content).not.toContain('Ingest queued this resource')
  })
})
