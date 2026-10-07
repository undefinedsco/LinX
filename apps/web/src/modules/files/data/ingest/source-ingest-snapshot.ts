import type { SourceIngestKind, SourceIngestSnapshot } from '../../domain/source/source-ingest'

const MAX_IMPORTED_SOURCE_CHARS = 12_000
const DOCUMENT_BYTE_CHUNK_SIZE = 4096

function stableSourceHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a-${(hash >>> 0).toString(36).padStart(7, '0')}`
}

function decodeHtmlEntities(value: string) {
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea')
    textarea.innerHTML = value
    return textarea.value.replace(/\u00a0/g, ' ')
  }
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function extractHtmlMeta(source: string, name: string) {
  const pattern = new RegExp(`<meta\\s+[^>]*(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'i')
  return decodeHtmlEntities(source.match(pattern)?.[1] ?? '').trim()
}

export function htmlToReadableText(source: string) {
  return decodeHtmlEntities(source
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|section|article|main|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim())
}

export function markdownFromHtmlSourceSnapshot(input: {
  title: string
  sourceUri: string
  html: string
  contentType: string
}) {
  const title = decodeHtmlEntities(input.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? input.title).trim() || input.title
  const description = extractHtmlMeta(input.html, 'description') || extractHtmlMeta(input.html, 'og:description')
  const body = htmlToReadableText(input.html).slice(0, MAX_IMPORTED_SOURCE_CHARS)
  const sections = [
    `# ${title}`,
    '',
    `Source: ${input.sourceUri}`,
    input.contentType ? `Format: ${input.contentType}` : null,
    description ? ['', `> ${description}`] : null,
    '',
    body,
  ].flat().filter((section): section is string => typeof section === 'string' && section.length > 0)
  return sections.join('\n')
}

export interface SourceIngestAdapterInput {
  sourceUri: string
  title: string
  sourceKind: SourceIngestKind
  mimeType: string
  bytes: Uint8Array
}

export interface SourceIngestAdapterResult {
  markdown: string
  sourceHash?: string
  mimeType?: string
  totalChunks?: number
  pendingRanges?: { start: string; end: string }[]
  priorityQueue?: string[]
}

export type SourceIngestAdapter = (
  input: SourceIngestAdapterInput
) => Promise<SourceIngestAdapterResult | undefined>

export interface SourceIngestSnapshotInput {
  sourceUri: string
  title: string
  sourceKind: SourceIngestKind
  mimeType?: string
  fetchSource?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  ingestAdapter?: SourceIngestAdapter
}

function binaryStringFromBytes(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 8192
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + chunkSize))
  }
  return binary
}

function byteRangesForLength(byteLength: number) {
  const ranges: Array<{ start: string; end: string }> = []
  for (let start = 0; start < byteLength; start += DOCUMENT_BYTE_CHUNK_SIZE) {
    const end = Math.min(start + DOCUMENT_BYTE_CHUNK_SIZE, byteLength) - 1
    ranges.push({
      start: `bytes:${start}`,
      end: `bytes:${end}`,
    })
  }
  return ranges
}

function rangeQueueValue(range: { start: string; end: string }) {
  return `${range.start}..${range.end}`
}

function normalizeMimeType(value: string) {
  return value.split(';')[0]?.trim().toLowerCase() || value.trim().toLowerCase()
}

function isReadableTextMimeType(mimeType: string) {
  const normalized = normalizeMimeType(mimeType)
  return (
    normalized.startsWith('text/') ||
    normalized === 'application/json' ||
    normalized === 'application/ld+json' ||
    normalized === 'application/xml' ||
    normalized === 'application/xhtml+xml' ||
    normalized === 'application/rdf+xml'
  )
}

function markdownFromTextDocumentSnapshot(input: {
  title: string
  sourceUri: string
  mimeType: string
  text: string
}) {
  const normalizedMime = normalizeMimeType(input.mimeType)
  const body = input.text.trim().slice(0, MAX_IMPORTED_SOURCE_CHARS)
  if (normalizedMime === 'text/html' || normalizedMime === 'application/xhtml+xml') {
    return markdownFromHtmlSourceSnapshot({
      title: input.title,
      sourceUri: input.sourceUri,
      html: body,
      contentType: normalizedMime,
    })
  }
  if (normalizedMime === 'text/markdown' || normalizedMime === 'text/md') {
    return body
  }
  return [
    `# ${input.title}`,
    '',
    `Source: ${input.sourceUri}`,
    `Format: ${normalizedMime}`,
    '',
    body,
  ].join('\n')
}

function markdownFromDocumentSnapshot(input: {
  title: string
  sourceUri: string
  sourceKind: SourceIngestKind
  mimeType: string
  byteLength: number
  totalChunks: number
  adapterFailure?: string
}) {
  return [
    `# ${input.title}`,
    '',
    `Source: ${input.sourceUri}`,
    `Kind: ${input.sourceKind}`,
    `Format: ${input.mimeType}`,
    `Bytes: ${input.byteLength}`,
    `Chunks: ${input.totalChunks}`,
    '',
    'Ingest queued this resource for progressive processing.',
    input.adapterFailure ? `Ingest adapter issue: ${input.adapterFailure}` : null,
    'Detailed content is staged through Ingest ranges before canonical card body changes.',
  ].filter((line): line is string => line !== null).join('\n')
}

async function runSourceIngestAdapter(input: SourceIngestAdapterInput, adapter?: SourceIngestAdapter) {
  try {
    return { result: await adapter?.(input) }
  } catch (error) {
    return {
      adapterFailure: error instanceof Error && error.message
        ? error.message
        : 'Ingest adapter failed',
    }
  }
}

function snapshotFromIngestAdapterResult(input: {
  ingestResult?: SourceIngestAdapterResult
  bytes: Uint8Array
  contentType: string
}): SourceIngestSnapshot | undefined {
  const ingestResult = input.ingestResult
  const ingestMarkdown = ingestResult?.markdown.trim()
  if (!ingestResult || !ingestMarkdown) return undefined
  const pendingRanges = ingestResult.pendingRanges ?? []
  return {
    content: ingestMarkdown.slice(0, MAX_IMPORTED_SOURCE_CHARS),
    sourceHash: ingestResult.sourceHash?.trim() || stableSourceHash(binaryStringFromBytes(input.bytes)),
    mimeType: ingestResult.mimeType?.trim()
      ? normalizeMimeType(ingestResult.mimeType)
      : normalizeMimeType(input.contentType),
    totalChunks: ingestResult.totalChunks ?? Math.max(1, pendingRanges.length + 1),
    pendingRanges,
    priorityQueue: ingestResult.priorityQueue ?? pendingRanges.map(rangeQueueValue),
  }
}

export async function createSourceIngestUrlSnapshot(input: {
  sourceUri: string
  title: string
  mimeType?: string
}): Promise<SourceIngestSnapshot | undefined> {
  try {
    const response = await fetch(input.sourceUri, { credentials: 'omit' })
    if (!response.ok) return undefined
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || input.mimeType || 'text/html'
    const sourceText = await response.text()
    if (!sourceText.trim()) return undefined
    const content = markdownFromHtmlSourceSnapshot({
      title: input.title,
      sourceUri: input.sourceUri,
      html: sourceText,
      contentType,
    })
    return {
      content,
      sourceHash: stableSourceHash(sourceText),
      mimeType: contentType,
      totalChunks: 1,
      pendingRanges: [],
      priorityQueue: [],
    }
  } catch {
    return undefined
  }
}

export async function createSourceIngestSnapshot<T extends SourceIngestSnapshotInput>(input: T): Promise<SourceIngestSnapshot | undefined> {
  const usesInjectedUrlBoundary = input.sourceKind === 'url' && (!!input.fetchSource || !!input.ingestAdapter)
  if (input.sourceKind === 'url' && !usesInjectedUrlBoundary) {
    return createSourceIngestUrlSnapshot({
      sourceUri: input.sourceUri,
      title: input.title,
      mimeType: input.mimeType,
    })
  }

  const fetchSource = input.fetchSource ?? fetch
  try {
    const response = await fetchSource(input.sourceUri)
    if (!response.ok) return undefined
    const defaultMimeType = input.sourceKind === 'url' ? 'text/html' : 'application/octet-stream'
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || input.mimeType || defaultMimeType
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length === 0) return undefined
    let adapterFailure: string | undefined
    if (input.sourceKind === 'url' && input.ingestAdapter) {
      const adapterSnapshot = await runSourceIngestAdapter({
        sourceUri: input.sourceUri,
        title: input.title,
        sourceKind: input.sourceKind,
        mimeType: contentType,
        bytes,
      }, input.ingestAdapter)
      adapterFailure = adapterSnapshot.adapterFailure
      const snapshot = snapshotFromIngestAdapterResult({
        ingestResult: adapterSnapshot.result,
        bytes,
        contentType,
      })
      if (snapshot) return snapshot
    }
    if (isReadableTextMimeType(contentType)) {
      const text = new TextDecoder().decode(bytes)
      if (!text.trim()) return undefined
      return {
        content: markdownFromTextDocumentSnapshot({
          title: input.title,
          sourceUri: input.sourceUri,
          mimeType: contentType,
          text,
        }),
        sourceHash: stableSourceHash(text),
        mimeType: normalizeMimeType(contentType),
        totalChunks: 1,
        pendingRanges: [],
        priorityQueue: [],
      }
    }
    if (!(input.sourceKind === 'url' && input.ingestAdapter)) {
      const adapterSnapshot = await runSourceIngestAdapter({
        sourceUri: input.sourceUri,
        title: input.title,
        sourceKind: input.sourceKind,
        mimeType: contentType,
        bytes,
      }, input.ingestAdapter)
      adapterFailure = adapterSnapshot.adapterFailure
      const snapshot = snapshotFromIngestAdapterResult({
        ingestResult: adapterSnapshot.result,
        bytes,
        contentType,
      })
      if (snapshot) return snapshot
    }
    const pendingRanges = byteRangesForLength(bytes.length)
    return {
      content: markdownFromDocumentSnapshot({
        title: input.title,
        sourceUri: input.sourceUri,
        sourceKind: input.sourceKind,
        mimeType: contentType,
        byteLength: bytes.length,
        totalChunks: pendingRanges.length,
        adapterFailure,
      }),
      sourceHash: stableSourceHash(binaryStringFromBytes(bytes)),
      mimeType: normalizeMimeType(contentType),
      totalChunks: pendingRanges.length,
      pendingRanges,
      priorityQueue: pendingRanges.map(rangeQueueValue),
      adapterFailure,
    }
  } catch {
    return undefined
  }
}
