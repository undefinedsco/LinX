import {
  createSourceIngestManifest,
  type SourceIngestManifest,
} from './source-ingest-manifest'
import {
  createSourceUpdateProposal,
  type SourceUpdateProposal,
} from './source-approval-model'

export type SourceIngestKind = 'url' | 'pdf' | 'doc' | 'ppt'

export interface SourceIngestPlan {
  sourceKind: SourceIngestKind
  sourceUri: string
  mimeType: string
  title: string
  subject: string
  targetResourceUri: string
  bodyResourceUri: string
  bodyResource: SourceLinkedCardBodyResource
  sourceIngestManifestUri: string
  sourceIngestManifest: SourceIngestManifest
  sourceProposal: SourceUpdateProposal
  snapshotAt: string
  writesCanonicalContent: false
}

export interface SourceRefreshPlan {
  action: 'unchanged' | 'changed'
  sourceKind: SourceIngestKind
  sourceUri: string
  mimeType: string
  title: string
  subject: string
  targetResourceUri: string
  sourceIngestManifestUri: string
  sourceIngestManifest: SourceIngestManifest
  sourceProposal: SourceUpdateProposal | null
  snapshotAt: string
  writesCanonicalContent: false
}

export interface SourceIngestSnapshot {
  content: string
  sourceHash?: string
  mimeType?: string
  totalChunks?: number
  pendingRanges?: { start: string; end: string }[]
  priorityQueue?: string[]
  adapterFailure?: string
}

/** @deprecated Use SourceIngestSnapshot. */
export type ExtractedSourceSnapshot = SourceIngestSnapshot

export interface SourceIngestPlanInput {
  documentUri: string
  containerUri: string
  sourceUri: string
  sourceKind: SourceIngestKind
  title: string
  mimeType?: string
  sourceHash?: string
  ingestVersion?: string
  snapshotAt?: string
  ingestSnapshot?: SourceIngestSnapshot
  podRootUri?: string
}

interface SourceIngestPlanCompatibilityInput {
  /** @deprecated Legacy alias from the earlier xpod extractor wording. */
  extractorVersion?: string
  /** @deprecated Legacy Files-local alias for ingestVersion. */
  parserVersion?: string
  /** @deprecated Use ingestSnapshot. */
  extractedSource?: SourceIngestSnapshot
}

export interface SourceRefreshPlanInput {
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
  snapshotAt?: string
  ingestSnapshot?: SourceIngestSnapshot
  podRootUri?: string
}

interface SourceRefreshPlanCompatibilityInput {
  /** @deprecated Legacy alias from the earlier xpod extractor wording. */
  extractorVersion?: string
  /** @deprecated Legacy Files-local alias for ingestVersion. */
  parserVersion?: string
  /** @deprecated Use sourceIngestManifestUri. */
  sourceIndexManifestUri?: string
  /** @deprecated Legacy Files-local alias for sourceIndexManifestUri. */
  parserManifestUri?: string
  /** @deprecated Use ingestSnapshot. */
  extractedSource?: SourceIngestSnapshot
}

export interface SourceLinkedCardBodyResource {
  uri: string
  mimeType: 'text/markdown'
  content: string
  writesCanonicalContent: false
}

export interface SourceLinkedCardDescriptor {
  title: string
  tags: string[]
  tagsPreviousValues: string[]
  reviewStatus: string
  reviewStatusPreviousValues: string[]
  sourceUri: string
  mimeType: string
  sourceKind: SourceIngestKind
  sourceHash: string
  ingestVersion: string
  sourceIngestManifestUri: string
  bodyResourceUri?: string
  createdAt: string
  writesCanonicalContent: false
}

type SourceRange = NonNullable<SourceIngestSnapshot['pendingRanges']>[number]

const DEFAULT_MIME_BY_KIND: Record<SourceIngestKind, string> = {
  url: 'text/html',
  pdf: 'application/pdf',
  doc: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

function slugify(value: string) {
  const slug = value
    .trim()
    .replace(/^[#./]+/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return slug || 'source'
}

function ensureContainerUri(value: string) {
  return value.endsWith('/') ? value : `${value}/`
}

function turtleString(value: string) {
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/"/g, '\\"')}"`
}

export function displaySourceIngestVersion(value: string) {
  return value.trim().replace(/(^|[-_.])parser(?=$|[-_.])/gi, '$1ingest')
}

function createStagedSourceIngestContent(input: {
  title: string
  sourceUri: string
  sourceKind: SourceIngestKind
  mimeType: string
  sourceIngestManifestUri: string
  sourceHash: string
  ingestVersion: string
  snapshotAt: string
}) {
  return [
    `<!-- linx-source-block id="chunk:1" hash="${input.sourceHash}" origin="source" -->`,
    `# ${input.title}`,
    '',
    `Source: ${input.sourceUri}`,
    `Kind: ${input.sourceKind}`,
    `Format: ${input.mimeType}`,
    `Source hash: ${input.sourceHash}`,
    `Ingest: ${displaySourceIngestVersion(input.ingestVersion)}`,
    `Ingest record: ${input.sourceIngestManifestUri}`,
    `Snapshot: ${input.snapshotAt}`,
    '',
    'This staged content is waiting for approval before it becomes the canonical card body.',
  ].join('\n')
}

function isKnownByteRange(range: SourceRange) {
  return range.start.startsWith('bytes:') && range.end.startsWith('bytes:') && !range.end.includes('*')
}

function createSourceIngestProgress(input: {
  ingestSnapshot?: SourceIngestSnapshot
  pendingRanges: SourceRange[]
  priorityQueue: string[]
}) {
  const ingestedRanges = [{ start: 'chunk:1', end: 'chunk:1' }]
  const readChunks = 1
  const hasPendingWork = input.pendingRanges.length > 0 || input.priorityQueue.length > 0
  const hasKnownByteRanges = input.pendingRanges.length > 0 && input.pendingRanges.every(isKnownByteRange)
  const totalChunks = hasKnownByteRanges
    ? Math.max(readChunks + input.pendingRanges.length, readChunks + (input.ingestSnapshot?.totalChunks ?? 0))
    : hasPendingWork
      ? input.ingestSnapshot?.totalChunks ?? 0
      : Math.max(readChunks, input.ingestSnapshot?.totalChunks ?? readChunks)

  return {
    status: hasPendingWork ? 'partial' : 'complete',
    ingestedRanges,
    readChunks,
    totalChunks,
  } as const
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

function withSourceIngestCompatibilityAliases<T extends {
  sourceIngestManifestUri: string
  sourceIngestManifest: SourceIngestManifest
}>(target: T): T & {
  sourceIndexManifestUri: string
  sourceIndexManifest: SourceIngestManifest
} {
  const withManifestUri = withNonEnumerableAlias(target, 'sourceIndexManifestUri', () => target.sourceIngestManifestUri)
  return withNonEnumerableAlias(withManifestUri, 'sourceIndexManifest', () => target.sourceIngestManifest)
}

function withSourceIngestDescriptorCompatibilityAlias<T extends {
  sourceIngestManifestUri: string
}>(target: T): T & {
  sourceIndexManifestUri: string
} {
  return withNonEnumerableAlias(target, 'sourceIndexManifestUri', () => target.sourceIngestManifestUri)
}

function normalizeSourceIngestContent(input: {
  title: string
  sourceUri: string
  sourceKind: SourceIngestKind
  mimeType: string
  sourceIngestManifestUri: string
  sourceHash: string
  ingestVersion: string
  snapshotAt: string
  ingestContent: string
}) {
  const content = input.ingestContent.trim()
  if (!content) {
    return createStagedSourceIngestContent({
      title: input.title,
      sourceUri: input.sourceUri,
      sourceKind: input.sourceKind,
      mimeType: input.mimeType,
      sourceIngestManifestUri: input.sourceIngestManifestUri,
      sourceHash: input.sourceHash,
      ingestVersion: input.ingestVersion,
      snapshotAt: input.snapshotAt,
    })
  }
  return [
    `<!-- linx-source-block id="chunk:1" hash="${input.sourceHash}" origin="source" -->`,
    content,
  ].join('\n')
}

export function createSourceIngestPlan<T extends SourceIngestPlanInput>(input: T): SourceIngestPlan {
  const compatibilityInput = input as T & SourceIngestPlanCompatibilityInput
  const title = input.title.trim() || 'Ingest source'
  const targetResourceUri = `${ensureContainerUri(input.containerUri)}${slugify(title)}.card.ttl`
  const bodyResourceUri = `${ensureContainerUri(input.containerUri)}${slugify(title)}.md`
  const subject = `${targetResourceUri}#card`
  const ingestSnapshot = input.ingestSnapshot ?? compatibilityInput.extractedSource
  const mimeType = ingestSnapshot?.mimeType?.trim() || input.mimeType?.trim() || DEFAULT_MIME_BY_KIND[input.sourceKind]
  const ingestVersion = input.ingestVersion?.trim()
    || compatibilityInput.extractorVersion?.trim()
    || compatibilityInput.parserVersion?.trim()
    || `${input.sourceKind}-ingest-v1`
  const snapshotAt = input.snapshotAt ?? new Date().toISOString()
  const sourceHash = ingestSnapshot?.sourceHash?.trim() || input.sourceHash
  const pendingRanges = ingestSnapshot?.pendingRanges ?? [{ start: 'chunk:2', end: 'chunk:*' }]
  const priorityQueue = ingestSnapshot?.priorityQueue ?? ['chunk:2']
  const ingestProgress = createSourceIngestProgress({
    ingestSnapshot,
    pendingRanges,
    priorityQueue,
  })
  const sourceIngestManifest = createSourceIngestManifest({
    documentUri: input.documentUri,
    sourceUri: input.sourceUri,
    sourceHash,
    ingestVersion,
    status: ingestProgress.status,
    ingestedRanges: ingestProgress.ingestedRanges,
    pendingRanges,
    priorityQueue,
    readChunks: ingestProgress.readChunks,
    totalChunks: ingestProgress.totalChunks,
    lastIngestedAt: snapshotAt,
    podRootUri: input.podRootUri,
  })
  const bodyResource: SourceLinkedCardBodyResource = {
    uri: bodyResourceUri,
    mimeType: 'text/markdown',
    content: ingestSnapshot
      ? normalizeSourceIngestContent({
        title,
        sourceUri: input.sourceUri,
        sourceKind: input.sourceKind,
        mimeType,
        sourceIngestManifestUri: sourceIngestManifest.manifestUri,
        sourceHash: sourceIngestManifest.sourceHash,
        ingestVersion,
        snapshotAt,
        ingestContent: ingestSnapshot.content,
      })
      : createStagedSourceIngestContent({
        title,
        sourceUri: input.sourceUri,
        sourceKind: input.sourceKind,
        mimeType,
        sourceIngestManifestUri: sourceIngestManifest.manifestUri,
        sourceHash: sourceIngestManifest.sourceHash,
        ingestVersion,
        snapshotAt,
      }),
    writesCanonicalContent: false,
  }
  const sourceProposal = createSourceUpdateProposal({
    documentUri: input.documentUri,
    subject,
    targetResourceUri: bodyResourceUri,
    sourceUri: input.sourceUri,
    ingestVersion,
    sourceHash: sourceIngestManifest.sourceHash,
    sourceIngestManifestUri: sourceIngestManifest.manifestUri,
    snapshotAt,
    summary: `审阅 ${title} 的来源。`,
    diff: `为 ${input.sourceUri} 创建 source-linked card；canonical card 内容需审批后更新。`,
    proposedContent: bodyResource.content,
    podRootUri: input.podRootUri,
  })

  return withSourceIngestCompatibilityAliases({
    sourceKind: input.sourceKind,
    sourceUri: input.sourceUri,
    mimeType,
    title,
    subject,
    targetResourceUri,
    bodyResourceUri,
    bodyResource,
    sourceIngestManifestUri: sourceIngestManifest.manifestUri,
    sourceIngestManifest,
    sourceProposal,
    snapshotAt,
    writesCanonicalContent: false as const,
  })
}

export function createSourceRefreshPlan<T extends SourceRefreshPlanInput>(input: T): SourceRefreshPlan {
  const compatibilityInput = input as T & SourceRefreshPlanCompatibilityInput
  const title = input.title.trim() || 'Ingest source'
  const ingestSnapshot = input.ingestSnapshot ?? compatibilityInput.extractedSource
  if (!ingestSnapshot) throw new Error('Cannot refresh source without an Ingest snapshot.')
  const mimeType = ingestSnapshot.mimeType?.trim() || input.mimeType?.trim() || DEFAULT_MIME_BY_KIND[input.sourceKind]
  const ingestVersion = input.ingestVersion?.trim()
    || compatibilityInput.extractorVersion?.trim()
    || compatibilityInput.parserVersion?.trim()
    || `${input.sourceKind}-ingest-v1`
  const snapshotAt = input.snapshotAt ?? new Date().toISOString()
  const sourceHash = ingestSnapshot.sourceHash?.trim() || input.currentSourceHash
  const pendingRanges = ingestSnapshot.pendingRanges ?? []
  const priorityQueue = ingestSnapshot.priorityQueue ?? []
  const ingestProgress = createSourceIngestProgress({
    ingestSnapshot,
    pendingRanges,
    priorityQueue,
  })
  const sourceIngestManifest = createSourceIngestManifest({
    documentUri: input.documentUri,
    sourceUri: input.sourceUri,
    sourceHash,
    ingestVersion,
    manifestUri: input.sourceIngestManifestUri
      ?? compatibilityInput.sourceIndexManifestUri
      ?? compatibilityInput.parserManifestUri,
    status: ingestProgress.status,
    ingestedRanges: ingestProgress.ingestedRanges,
    pendingRanges,
    priorityQueue,
    readChunks: ingestProgress.readChunks,
    totalChunks: ingestProgress.totalChunks,
    lastIngestedAt: snapshotAt,
    podRootUri: input.podRootUri,
  })
  const action: SourceRefreshPlan['action'] = sourceHash === input.currentSourceHash ? 'unchanged' : 'changed'
  const sourceProposal = action === 'changed'
    ? createSourceUpdateProposal({
        documentUri: input.documentUri,
        subject: input.subject,
        targetResourceUri: input.targetResourceUri,
        sourceUri: input.sourceUri,
        ingestVersion,
        sourceHash: sourceIngestManifest.sourceHash,
        sourceIngestManifestUri: sourceIngestManifest.manifestUri,
        snapshotAt,
        summary: `审阅 ${title} 的来源刷新。`,
        diff: `来源 ${input.sourceUri} 已变化；Ingest 输出已进入审批。`,
        proposedContent: normalizeSourceIngestContent({
          title,
          sourceUri: input.sourceUri,
          sourceKind: input.sourceKind,
          mimeType,
          sourceIngestManifestUri: sourceIngestManifest.manifestUri,
          sourceHash: sourceIngestManifest.sourceHash,
          ingestVersion,
          snapshotAt,
          ingestContent: ingestSnapshot.content,
        }),
        podRootUri: input.podRootUri,
      })
    : null

  return withSourceIngestCompatibilityAliases({
    action,
    sourceKind: input.sourceKind,
    sourceUri: input.sourceUri,
    mimeType,
    title,
    subject: input.subject,
    targetResourceUri: input.targetResourceUri,
    sourceIngestManifestUri: sourceIngestManifest.manifestUri,
    sourceIngestManifest,
    sourceProposal,
    snapshotAt,
    writesCanonicalContent: false as const,
  })
}

export function renderSourceLinkedCardTurtle(plan: SourceIngestPlan) {
  return [
    '@prefix udfs: <https://undefineds.co/vocab/> .',
    '@prefix dcterms: <http://purl.org/dc/terms/> .',
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
    '',
    '<#card> a udfs:SourceLinkedCard ;',
    `  rdfs:label ${turtleString(plan.title)} ;`,
    `  dcterms:source <${plan.sourceUri}> ;`,
    `  dcterms:format ${turtleString(plan.mimeType)} ;`,
    `  udfs:sourceKind ${turtleString(plan.sourceKind)} ;`,
    `  udfs:sourceHash ${turtleString(plan.sourceIngestManifest.sourceHash)} ;`,
    `  udfs:ingestVersion ${turtleString(plan.sourceIngestManifest.ingestVersion)} ;`,
    `  udfs:ingestManifest <${plan.sourceIngestManifestUri}> ;`,
    `  udfs:bodyResource <${plan.bodyResourceUri}> ;`,
    `  dcterms:created ${turtleString(plan.snapshotAt)} ;`,
    `  udfs:writesCanonicalContent ${plan.writesCanonicalContent ? 'true' : 'false'} .`,
  ].join('\n')
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

function matchStringTokens(source: string, predicate: string) {
  const escapedPredicate = predicate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escapedPredicate}\\s+((?:"(?:\\\\.|[^"\\\\])*"\\s*,?\\s*)+)`))
  if (!match?.[1]) return []
  return Array.from(match[1].matchAll(/"((?:\\.|[^"\\])*)"/g)).map((tokenMatch) => `"${tokenMatch[1]}"`)
}

function displayStringToken(token: string) {
  return token.length >= 2 && token.startsWith('"') && token.endsWith('"')
    ? unescapeTurtleString(token.slice(1, -1))
    : token
}

const SOURCE_LINKED_CARD_TYPES = [
  'udfs:SourceLinkedCard',
  '<https://undefineds.co/vocab/SourceLinkedCard>',
] as const

const SOURCE_LINKED_CARD_PREDICATES = {
  title: ['rdfs:label', '<http://www.w3.org/2000/01/rdf-schema#label>'],
  tags: ['udfs:tags', '<https://undefineds.co/vocab/tags>'],
  reviewStatus: ['udfs:reviewStatus', '<https://undefineds.co/vocab/reviewStatus>'],
  sourceUri: ['dcterms:source', '<http://purl.org/dc/terms/source>'],
  mimeType: ['dcterms:format', '<http://purl.org/dc/terms/format>'],
  sourceKind: ['udfs:sourceKind', '<https://undefineds.co/vocab/sourceKind>'],
  sourceHash: ['udfs:sourceHash', '<https://undefineds.co/vocab/sourceHash>'],
  ingestVersion: [
    'udfs:ingestVersion',
    '<https://undefineds.co/vocab/ingestVersion>',
    'udfs:parserVersion',
    '<https://undefineds.co/vocab/parserVersion>',
  ],
  ingestManifestUri: [
    'udfs:ingestManifest',
    '<https://undefineds.co/vocab/ingestManifest>',
    'udfs:parserManifest',
    '<https://undefineds.co/vocab/parserManifest>',
  ],
  bodyResourceUri: ['udfs:bodyResource', '<https://undefineds.co/vocab/bodyResource>'],
  createdAt: ['dcterms:created', '<http://purl.org/dc/terms/created>'],
  writesCanonicalContent: ['udfs:writesCanonicalContent', '<https://undefineds.co/vocab/writesCanonicalContent>'],
} as const

function matchesAnyType(source: string) {
  return SOURCE_LINKED_CARD_TYPES.some((type) => source.includes(type))
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

function matchAnyStringTokens(source: string, predicates: readonly string[]) {
  for (const predicate of predicates) {
    const values = matchStringTokens(source, predicate)
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

function isSourceIngestKind(value: string | null): value is SourceIngestKind {
  return value === 'url' || value === 'pdf' || value === 'doc' || value === 'ppt'
}

export function parseSourceLinkedCardTurtle(source: string): SourceLinkedCardDescriptor | null {
  if (!matchesAnyType(source)) return null

  const title = matchAnyString(source, SOURCE_LINKED_CARD_PREDICATES.title)
  const tagsPreviousValues = matchAnyStringTokens(source, SOURCE_LINKED_CARD_PREDICATES.tags)
  const reviewStatusPreviousValues = matchAnyStringTokens(source, SOURCE_LINKED_CARD_PREDICATES.reviewStatus)
  const sourceUri = matchAnyUri(source, SOURCE_LINKED_CARD_PREDICATES.sourceUri)
  const mimeType = matchAnyString(source, SOURCE_LINKED_CARD_PREDICATES.mimeType)
  const sourceKind = matchAnyString(source, SOURCE_LINKED_CARD_PREDICATES.sourceKind)
  const sourceHash = matchAnyString(source, SOURCE_LINKED_CARD_PREDICATES.sourceHash)
  const ingestVersion = matchAnyString(source, SOURCE_LINKED_CARD_PREDICATES.ingestVersion)
  const sourceIngestManifestUri = matchAnyUri(source, SOURCE_LINKED_CARD_PREDICATES.ingestManifestUri)
  const bodyResourceUri = matchAnyUri(source, SOURCE_LINKED_CARD_PREDICATES.bodyResourceUri)
  const createdAt = matchAnyString(source, SOURCE_LINKED_CARD_PREDICATES.createdAt)
  const writesCanonicalContent = matchAnyBoolean(source, SOURCE_LINKED_CARD_PREDICATES.writesCanonicalContent)

  if (
    !title ||
    !sourceUri ||
    !mimeType ||
    !sourceHash ||
    !ingestVersion ||
    !sourceIngestManifestUri ||
    !createdAt ||
    writesCanonicalContent !== 'false' ||
    !isSourceIngestKind(sourceKind)
  ) {
    return null
  }

  return withSourceIngestDescriptorCompatibilityAlias({
    title,
    tags: tagsPreviousValues.map(displayStringToken),
    tagsPreviousValues,
    reviewStatus: reviewStatusPreviousValues[0] ? displayStringToken(reviewStatusPreviousValues[0]) : '',
    reviewStatusPreviousValues,
    sourceUri,
    mimeType,
    sourceKind,
    sourceHash,
    ingestVersion,
    sourceIngestManifestUri,
    bodyResourceUri: bodyResourceUri ?? undefined,
    createdAt,
    writesCanonicalContent: false as const,
  })
}
