import {
  ensureFilesContainerUri,
  filesDataResourceUri,
  resolveFilesPodRootUri,
  turtleString,
} from '../resource/files-rdf-contract'

export type SourceIngestStatus = 'partial' | 'complete' | 'stale' | 'failed'
/** @deprecated Use SourceIngestStatus. */
export type SourceIndexStatus = SourceIngestStatus

export interface SourceIngestRange {
  start: string
  end: string
}
/** @deprecated Use SourceIngestRange. */
export type SourceIndexRange = SourceIngestRange

export interface SourceIngestManifest {
  id: string
  kind: 'source-ingest-manifest' | 'source-index-manifest'
  manifestUri: string
  sourceUri: string
  sourceHash: string
  ingestVersion: string
  status: SourceIngestStatus
  ingestedRanges: SourceIngestRange[]
  pendingRanges: SourceIngestRange[]
  priorityQueue: string[]
  readChunks: number
  totalChunks: number
  lastIngestedAt: string
  writesCanonicalContent: false
  /** @deprecated Use ingestedRanges. */
  readonly indexedRanges: SourceIngestRange[]
  /** @deprecated Use lastIngestedAt. */
  readonly lastIndexedAt: string
}
/** @deprecated Use SourceIngestManifest. */
export type SourceIndexManifest = SourceIngestManifest

type SourceIngestManifestPrimary = Omit<SourceIngestManifest, 'indexedRanges' | 'lastIndexedAt'>
type SourceIngestManifestWithLegacyAliases<T extends SourceIngestManifestPrimary> =
  T & Pick<SourceIngestManifest, 'indexedRanges' | 'lastIndexedAt'>

export interface SourceIngestManifestInput {
  documentUri: string
  sourceUri: string
  sourceHash?: string
  ingestVersion?: string
  /** @deprecated Legacy Files-local alias for ingestVersion. */
  parserVersion?: string
  status?: SourceIngestStatus
  ingestedRanges?: SourceIngestRange[]
  indexedRanges?: SourceIngestRange[]
  /** @deprecated Legacy Files-local alias for indexedRanges. */
  parsedRanges?: SourceIngestRange[]
  pendingRanges?: SourceIngestRange[]
  priorityQueue?: string[]
  readChunks?: number
  totalChunks?: number
  lastIngestedAt?: string
  /** @deprecated Legacy Files-local alias for lastIngestedAt. */
  lastIndexedAt?: string
  /** @deprecated Legacy Files-local alias for lastIndexedAt. */
  lastParsedAt?: string
  manifestUri?: string
  podRootUri?: string
}
/** @deprecated Use SourceIngestManifestInput. */
export type SourceIndexManifestInput = SourceIngestManifestInput

function slugify(value: string) {
  const slug = value
    .trim()
    .replace(/^[#./]+/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return slug || 'source'
}

function stableShortHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36).padStart(7, '0').slice(0, 7)
}

function sourceSlug(sourceUri: string) {
  const suffix = stableShortHash(sourceUri)
  try {
    const url = new URL(sourceUri)
    const path = url.pathname.replace(/\.[A-Za-z0-9]+$/, '')
    return `${slugify(`${url.hostname}${path}`)}-${suffix}`
  } catch {
    return `${slugify(sourceUri)}-${suffix}`
  }
}

function rangeValue(range: SourceIngestRange) {
  return `${range.start}..${range.end}`
}

function rangesEqual(left: SourceIngestRange, right: SourceIngestRange) {
  return left.start === right.start && left.end === right.end
}

function withNonEnumerableAlias<T extends object, K extends string, V>(
  target: T,
  key: K,
  getValue: () => V,
): T & Record<K, V> {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: false,
    get: getValue,
  })
  return target as T & Record<K, V>
}

export function withSourceIngestLegacyAliases<T extends SourceIngestManifestPrimary>(
  manifest: T,
): SourceIngestManifestWithLegacyAliases<T> {
  const withRanges = withNonEnumerableAlias(manifest, 'indexedRanges', () => manifest.ingestedRanges)
  return withNonEnumerableAlias(withRanges, 'lastIndexedAt', () => manifest.lastIngestedAt)
}

function unescapeTurtleString(value: string) {
  return value
    .replace(/\\"/g, '"')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\')
}

function matchUri(source: string, predicate: string) {
  return source.match(new RegExp(`${predicate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+<([^>]+)>`))?.[1] ?? null
}

function matchString(source: string, predicate: string) {
  const escapedPredicate = predicate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escapedPredicate}\\s+"((?:\\\\.|[^"\\\\])*)"`))
  return match ? unescapeTurtleString(match[1]) : null
}

function matchNumber(source: string, predicate: string) {
  const escapedPredicate = predicate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const value = source.match(new RegExp(`${escapedPredicate}\\s+(\\d+)`))?.[1]
  return value ? Number.parseInt(value, 10) : null
}

function matchStrings(source: string, predicate: string) {
  const escapedPredicate = predicate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...source.matchAll(new RegExp(`${escapedPredicate}\\s+"((?:\\\\.|[^"\\\\])*)"`, 'g'))]
    .map((match) => unescapeTurtleString(match[1]))
}

const SOURCE_INGEST_MANIFEST_TYPES = [
  'udfs:ParserIndexManifest',
  '<https://undefineds.co/vocab/ParserIndexManifest>',
  'udfs:SourceIndexManifest',
  '<https://undefineds.co/vocab/SourceIndexManifest>',
  'udfs:SourceIngestManifest',
  '<https://undefineds.co/vocab/SourceIngestManifest>',
] as const

// Canonical product terminology is Ingest record. SourceIngestManifest remains
// the persisted RDF record type. New writes use ingest* / ingested* predicates.
// index* / parser* / parsed* tokens are read aliases; the deprecated SourceIndex
// writer emits them only for legacy .data/index resources.
const SOURCE_INGEST_MANIFEST_PREDICATES = {
  sourceUri: ['dcterms:source', '<http://purl.org/dc/terms/source>'],
  sourceHash: ['udfs:sourceHash', '<https://undefineds.co/vocab/sourceHash>'],
  ingestVersion: [
    'udfs:ingestVersion',
    '<https://undefineds.co/vocab/ingestVersion>',
    'udfs:parserVersion',
    '<https://undefineds.co/vocab/parserVersion>',
  ],
  status: [
    'udfs:ingestStatus',
    '<https://undefineds.co/vocab/ingestStatus>',
    'udfs:parserStatus',
    '<https://undefineds.co/vocab/parserStatus>',
  ],
  readChunks: ['udfs:readChunks', '<https://undefineds.co/vocab/readChunks>'],
  totalChunks: ['udfs:totalChunks', '<https://undefineds.co/vocab/totalChunks>'],
  ingestedRange: [
    'udfs:ingestedRange',
    '<https://undefineds.co/vocab/ingestedRange>',
    'udfs:indexedRange',
    '<https://undefineds.co/vocab/indexedRange>',
    'udfs:parsedRange',
    '<https://undefineds.co/vocab/parsedRange>',
  ],
  pendingRange: ['udfs:pendingRange', '<https://undefineds.co/vocab/pendingRange>'],
  priorityQueue: ['udfs:priorityQueue', '<https://undefineds.co/vocab/priorityQueue>'],
  lastIngestedAt: [
    'udfs:lastIngestedAt',
    '<https://undefineds.co/vocab/lastIngestedAt>',
    'udfs:lastIndexedAt',
    '<https://undefineds.co/vocab/lastIndexedAt>',
    'udfs:lastParsedAt',
    '<https://undefineds.co/vocab/lastParsedAt>',
  ],
  writesCanonicalContent: ['udfs:writesCanonicalContent', '<https://undefineds.co/vocab/writesCanonicalContent>'],
} as const

function matchesAnyType(source: string) {
  return SOURCE_INGEST_MANIFEST_TYPES.some((type) => source.includes(type))
}

function matchAnyUri(source: string, predicates: readonly string[]) {
  for (const predicate of predicates) {
    const value = matchUri(source, predicate)
    if (value) return value
  }
  return null
}

function matchAnyString(source: string, predicates: readonly string[]) {
  for (const predicate of predicates) {
    const value = matchString(source, predicate)
    if (value) return value
  }
  return null
}

function matchAnyNumber(source: string, predicates: readonly string[]) {
  for (const predicate of predicates) {
    const value = matchNumber(source, predicate)
    if (value !== null) return value
  }
  return null
}

function matchAnyStrings(source: string, predicates: readonly string[]) {
  for (const predicate of predicates) {
    const values = matchStrings(source, predicate)
    if (values.length > 0) return values
  }
  return []
}

function matchAnyBoolean(source: string, predicates: readonly string[]) {
  for (const predicate of predicates) {
    const escapedPredicate = predicate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const value = source.match(new RegExp(`${escapedPredicate}\\s+(true|false)`))?.[1]
    if (value) return value
  }
  return null
}

function parseRangeValue(value: string): SourceIngestRange | null {
  const separatorIndex = value.indexOf('..')
  if (separatorIndex < 0) return null
  const start = value.slice(0, separatorIndex)
  const end = value.slice(separatorIndex + 2)
  if (!start || !end) return null
  return { start, end }
}

function resolveSourceManifestUri(input: { documentUri: string; sourceUri: string; podRootUri?: string }, folder: 'index' | 'ingest') {
  const podRoot = input.podRootUri ? ensureFilesContainerUri(input.podRootUri) : resolveFilesPodRootUri(input.documentUri)
  return filesDataResourceUri(podRoot, `${folder}/sources/${sourceSlug(input.sourceUri)}/manifest.ttl`)
}

export function resolveSourceIndexManifestUri(input: { documentUri: string; sourceUri: string; podRootUri?: string }) {
  return resolveSourceManifestUri(input, 'index')
}

export function resolveSourceIngestManifestUri(input: { documentUri: string; sourceUri: string; podRootUri?: string }) {
  return resolveSourceManifestUri(input, 'ingest')
}

export function createSourceIndexManifest(input: SourceIndexManifestInput): SourceIndexManifest {
  const manifestUri = input.manifestUri ?? resolveSourceIndexManifestUri(input)
  const ingestedRanges = input.ingestedRanges ?? input.indexedRanges ?? input.parsedRanges ?? []
  return withSourceIngestLegacyAliases({
    id: `${manifestUri}#manifest`,
    kind: 'source-index-manifest',
    manifestUri,
    sourceUri: input.sourceUri,
    sourceHash: input.sourceHash?.trim() || 'pending-source-hash',
    ingestVersion: input.ingestVersion?.trim() || input.parserVersion?.trim() || 'linx-ingest-v1',
    status: input.status ?? 'partial',
    ingestedRanges,
    pendingRanges: input.pendingRanges ?? [],
    priorityQueue: input.priorityQueue ?? [],
    readChunks: input.readChunks ?? ingestedRanges.length,
    totalChunks: input.totalChunks ?? Math.max(ingestedRanges.length, input.pendingRanges?.length ?? 0),
    lastIngestedAt: input.lastIngestedAt ?? input.lastIndexedAt ?? input.lastParsedAt ?? new Date().toISOString(),
    writesCanonicalContent: false,
  })
}

export function canReuseSourceIngestManifest(
  manifest: Pick<SourceIngestManifest, 'sourceUri' | 'sourceHash' | 'ingestVersion' | 'status'>,
  input: { sourceUri: string; sourceHash: string; ingestVersion: string },
) {
  return (
    (manifest.status === 'partial' || manifest.status === 'complete') &&
    manifest.sourceUri === input.sourceUri &&
    manifest.sourceHash === input.sourceHash &&
    manifest.ingestVersion === input.ingestVersion
  )
}

export function sourceIngestManifestTurtleMatches(
  sourceText: string,
  manifest: Pick<SourceIngestManifest, 'sourceUri' | 'sourceHash' | 'ingestVersion'>,
) {
  const status = matchAnyString(sourceText, SOURCE_INGEST_MANIFEST_PREDICATES.status)
  return (
    (status === 'partial' || status === 'complete') &&
    matchAnyUri(sourceText, SOURCE_INGEST_MANIFEST_PREDICATES.sourceUri) === manifest.sourceUri &&
    matchAnyString(sourceText, SOURCE_INGEST_MANIFEST_PREDICATES.sourceHash) === manifest.sourceHash &&
    matchAnyString(sourceText, SOURCE_INGEST_MANIFEST_PREDICATES.ingestVersion) === manifest.ingestVersion
  )
}

export function parseSourceIndexManifestTurtle(source: string, manifestUri: string): SourceIndexManifest | null {
  if (!matchesAnyType(source)) return null

  const sourceUri = matchAnyUri(source, SOURCE_INGEST_MANIFEST_PREDICATES.sourceUri)
  const sourceHash = matchAnyString(source, SOURCE_INGEST_MANIFEST_PREDICATES.sourceHash)
  const ingestVersion = matchAnyString(source, SOURCE_INGEST_MANIFEST_PREDICATES.ingestVersion)
  const status = matchAnyString(source, SOURCE_INGEST_MANIFEST_PREDICATES.status)
  const readChunks = matchAnyNumber(source, SOURCE_INGEST_MANIFEST_PREDICATES.readChunks)
  const totalChunks = matchAnyNumber(source, SOURCE_INGEST_MANIFEST_PREDICATES.totalChunks)
  const lastIngestedAt = matchAnyString(source, SOURCE_INGEST_MANIFEST_PREDICATES.lastIngestedAt)
  const writesCanonicalContent = matchAnyBoolean(source, SOURCE_INGEST_MANIFEST_PREDICATES.writesCanonicalContent)

  if (
    !sourceUri ||
    !sourceHash ||
    !ingestVersion ||
    (status !== 'partial' && status !== 'complete' && status !== 'stale' && status !== 'failed') ||
    readChunks === null ||
    totalChunks === null ||
    !lastIngestedAt ||
    writesCanonicalContent !== 'false'
  ) {
    return null
  }

  return withSourceIngestLegacyAliases({
    id: `${manifestUri}#manifest`,
    kind: 'source-index-manifest',
    manifestUri,
    sourceUri,
    sourceHash,
    ingestVersion,
    status,
    ingestedRanges: matchAnyStrings(source, SOURCE_INGEST_MANIFEST_PREDICATES.ingestedRange).map(parseRangeValue).filter((range): range is SourceIngestRange => !!range),
    pendingRanges: matchAnyStrings(source, SOURCE_INGEST_MANIFEST_PREDICATES.pendingRange).map(parseRangeValue).filter((range): range is SourceIngestRange => !!range),
    priorityQueue: matchAnyStrings(source, SOURCE_INGEST_MANIFEST_PREDICATES.priorityQueue),
    readChunks,
    totalChunks,
    lastIngestedAt,
    writesCanonicalContent: false,
  })
}

export function markSourceIngestRangeIngested(
  manifest: SourceIngestManifest,
  input: { range: SourceIngestRange; ingestedAt?: string },
): SourceIngestManifest {
  const ingestedRangeValue = rangeValue(input.range)
  const ingestedRanges = manifest.ingestedRanges.some((range) => rangesEqual(range, input.range))
    ? manifest.ingestedRanges
    : [...manifest.ingestedRanges, input.range]
  const pendingRanges = manifest.pendingRanges.filter((range) => !rangesEqual(range, input.range))
  const priorityQueue = manifest.priorityQueue.filter((item) => item !== ingestedRangeValue && item !== input.range.start)
  const status: SourceIngestStatus = pendingRanges.length === 0 && priorityQueue.length === 0 ? 'complete' : 'partial'

  return withSourceIngestLegacyAliases({
    id: manifest.id,
    kind: manifest.kind,
    manifestUri: manifest.manifestUri,
    sourceUri: manifest.sourceUri,
    sourceHash: manifest.sourceHash,
    ingestVersion: manifest.ingestVersion,
    status,
    ingestedRanges,
    pendingRanges,
    priorityQueue,
    readChunks: ingestedRanges.length,
    totalChunks: manifest.totalChunks,
    lastIngestedAt: input.ingestedAt ?? new Date().toISOString(),
    writesCanonicalContent: false,
  })
}

export function queueSourceIngestRange(
  manifest: SourceIngestManifest,
  range: SourceIngestRange,
): { manifest: SourceIngestManifest; changed: boolean } {
  const queuedRangeValue = rangeValue(range)
  const alreadyIngested = manifest.ingestedRanges.some((candidate) => rangesEqual(candidate, range))
  if (alreadyIngested) return { manifest, changed: false }

  const hasPendingRange = manifest.pendingRanges.some((candidate) => rangesEqual(candidate, range))
  const hasPriority = manifest.priorityQueue.includes(queuedRangeValue)
  if (hasPendingRange && hasPriority) return { manifest, changed: false }

  return {
    changed: true,
    manifest: withSourceIngestLegacyAliases({
      ...manifest,
      status: 'partial',
      pendingRanges: hasPendingRange ? manifest.pendingRanges : [...manifest.pendingRanges, range],
      priorityQueue: hasPriority ? manifest.priorityQueue : [...manifest.priorityQueue, queuedRangeValue],
      writesCanonicalContent: false,
    }),
  }
}

export function queueSourceIngestRanges(
  manifest: SourceIngestManifest,
  ranges: readonly SourceIngestRange[] = [],
): { manifest: SourceIngestManifest; changed: boolean } {
  return ranges.reduce<{ manifest: SourceIngestManifest; changed: boolean }>(
    (current, range) => {
      const next = queueSourceIngestRange(current.manifest, range)
      return {
        manifest: next.manifest,
        changed: current.changed || next.changed,
      }
    },
    { manifest, changed: false },
  )
}

/** @deprecated Use markSourceIngestRangeIngested. */
export function markSourceIngestRangeIndexed(
  manifest: SourceIngestManifest,
  input: { range: SourceIngestRange; indexedAt?: string },
): SourceIngestManifest {
  return markSourceIngestRangeIngested(manifest, {
    range: input.range,
    ingestedAt: input.indexedAt,
  })
}

export function renderSourceIndexManifestTurtle(manifest: SourceIndexManifest) {
  const indexedLines = manifest.ingestedRanges.flatMap((range) => [
    `  udfs:indexedRange ${turtleString(rangeValue(range))} ;`,
    `  udfs:parsedRange ${turtleString(rangeValue(range))} ;`,
  ])
  const pendingLines = manifest.pendingRanges.map((range) => `  udfs:pendingRange ${turtleString(rangeValue(range))} ;`)
  const priorityLines = manifest.priorityQueue.map((item) => `  udfs:priorityQueue ${turtleString(item)} ;`)
  return [
    '@prefix udfs: <https://undefineds.co/vocab/> .',
    '@prefix dcterms: <http://purl.org/dc/terms/> .',
    '',
    '<#manifest> a udfs:SourceIndexManifest ;',
    `  dcterms:source <${manifest.sourceUri}> ;`,
    `  udfs:sourceHash ${turtleString(manifest.sourceHash)} ;`,
    `  udfs:ingestVersion ${turtleString(manifest.ingestVersion)} ;`,
    `  udfs:ingestStatus ${turtleString(manifest.status)} ;`,
    `  udfs:parserVersion ${turtleString(manifest.ingestVersion)} ;`,
    `  udfs:parserStatus ${turtleString(manifest.status)} ;`,
    `  udfs:readChunks ${manifest.readChunks} ;`,
    `  udfs:totalChunks ${manifest.totalChunks} ;`,
    ...indexedLines,
    ...pendingLines,
    ...priorityLines,
    `  udfs:lastIndexedAt ${turtleString(manifest.lastIngestedAt)} ;`,
    `  udfs:lastParsedAt ${turtleString(manifest.lastIngestedAt)} ;`,
    `  udfs:writesCanonicalContent ${manifest.writesCanonicalContent ? 'true' : 'false'} .`,
  ].join('\n')
}

// SourceIndex names remain exported for compatibility with first-phase code
// and the legacy .data/index path.
/** @deprecated Use canReuseSourceIngestManifest. */
export const canReuseSourceIndexManifest = canReuseSourceIngestManifest
/** @deprecated Use sourceIngestManifestTurtleMatches. */
export const sourceIndexManifestTurtleMatches = sourceIngestManifestTurtleMatches
/** @deprecated Use markSourceIngestRangeIngested. */
export const markSourceIndexRangeIndexed = markSourceIngestRangeIndexed

export function createSourceIngestManifest(input: SourceIngestManifestInput): SourceIngestManifest {
  const manifest = createSourceIndexManifest({
    ...input,
    manifestUri: input.manifestUri ?? resolveSourceIngestManifestUri(input),
  })
  return withSourceIngestLegacyAliases({
    ...manifest,
    kind: 'source-ingest-manifest',
  })
}

export function parseSourceIngestManifestTurtle(source: string, manifestUri: string): SourceIngestManifest | null {
  const manifest = parseSourceIndexManifestTurtle(source, manifestUri)
  if (!manifest) return null
  return withSourceIngestLegacyAliases({
    ...manifest,
    kind: 'source-ingest-manifest',
  })
}

export function renderSourceIngestManifestTurtle(manifest: SourceIngestManifest) {
  const ingestedLines = manifest.ingestedRanges.map((range) => `  udfs:ingestedRange ${turtleString(rangeValue(range))} ;`)
  const pendingLines = manifest.pendingRanges.map((range) => `  udfs:pendingRange ${turtleString(rangeValue(range))} ;`)
  const priorityLines = manifest.priorityQueue.map((item) => `  udfs:priorityQueue ${turtleString(item)} ;`)
  return [
    '@prefix udfs: <https://undefineds.co/vocab/> .',
    '@prefix dcterms: <http://purl.org/dc/terms/> .',
    '',
    '<#manifest> a udfs:SourceIngestManifest ;',
    `  dcterms:source <${manifest.sourceUri}> ;`,
    `  udfs:sourceHash ${turtleString(manifest.sourceHash)} ;`,
    `  udfs:ingestVersion ${turtleString(manifest.ingestVersion)} ;`,
    `  udfs:ingestStatus ${turtleString(manifest.status)} ;`,
    `  udfs:readChunks ${manifest.readChunks} ;`,
    `  udfs:totalChunks ${manifest.totalChunks} ;`,
    ...ingestedLines,
    ...pendingLines,
    ...priorityLines,
    `  udfs:lastIngestedAt ${turtleString(manifest.lastIngestedAt)} ;`,
    `  udfs:writesCanonicalContent ${manifest.writesCanonicalContent ? 'true' : 'false'} .`,
  ].join('\n')
}
