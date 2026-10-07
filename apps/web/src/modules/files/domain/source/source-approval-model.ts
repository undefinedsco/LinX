import {
  filesDataResourceUri,
  filesProposalInstanceSuffix,
  resolveFilesPodRootUri,
  turtleString,
} from '../resource/files-rdf-contract'
import { readProposalIri, readProposalIris, readProposalLiteral } from '../proposal/proposal-rdf'
import { resolveSourceIngestManifestUri } from './source-ingest-manifest'

export const FILES_SOURCE_APPROVAL_POLICY_VERSION = 'files-source-proposal-v1'
export const FILES_SOURCE_APPROVAL_TOOL_NAME = 'files.source.proposal'
export const FILES_SOURCE_APPROVAL_ACTION = 'https://undefineds.co/vocab/reviewSourceUpdateProposal'

export type SourceUpdateOperation = 'refresh-card' | 'replace-blocks' | 'append-blocks' | 'keep-local'

export interface SourceUpdateCardMetadata {
  title: string | null
  links: string[]
}

export interface SourceUpdateProposal {
  id: string
  kind: 'source-update-proposal'
  status: 'pending' | 'approved' | 'rejected'
  operation: SourceUpdateOperation
  proposalResourceUri: string
  documentUri: string
  subject: string
  targetResourceUri: string
  sourceUri: string
  sourceIngestManifestUri: string
  ingestVersion: string
  sourceHash: string
  snapshotAt: string
  summary: string
  diff: string
  proposedContent: string | null
  cardMetadata: SourceUpdateCardMetadata
  createdAt: string
  writesCanonicalContent: false
}

export interface SourceUpdateProposalInput {
  documentUri: string
  subject: string
  targetResourceUri: string
  sourceUri: string
  ingestVersion?: string
  sourceHash?: string
  sourceIngestManifestUri?: string
  snapshotAt?: string
  operation?: SourceUpdateOperation
  summary?: string
  diff?: string
  proposedContent?: string | null
  cardMetadata?: Partial<SourceUpdateCardMetadata> | null
  createdAt?: string
  podRootUri?: string
}

interface SourceUpdateProposalCompatibilityInput {
  /** @deprecated Legacy alias from the earlier xpod extractor wording. */
  extractorVersion?: string
  /** @deprecated Legacy Files-local alias for ingestVersion. */
  parserVersion?: string
  /** @deprecated Use sourceIngestManifestUri. */
  sourceIndexManifestUri?: string
  /** @deprecated Legacy Files-local alias for sourceIndexManifestUri. */
  parserManifestUri?: string
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

function withSourceIngestProposalCompatibilityAlias<T extends {
  sourceIngestManifestUri: string
}>(target: T): T & {
  sourceIndexManifestUri: string
} {
  return withNonEnumerableAlias(target, 'sourceIndexManifestUri', () => target.sourceIngestManifestUri)
}

export function createSourceUpdateProposal<T extends SourceUpdateProposalInput>(input: T): SourceUpdateProposal {
  const compatibilityInput = input as T & SourceUpdateProposalCompatibilityInput
  const createdAt = input.createdAt ?? new Date().toISOString()
  const snapshotAt = input.snapshotAt ?? createdAt
  const ingestVersion = input.ingestVersion?.trim()
    || compatibilityInput.extractorVersion?.trim()
    || compatibilityInput.parserVersion?.trim()
    || 'linx-ingest-v1'
  const sourceHash = input.sourceHash?.trim() || 'pending-source-hash'
  const podRoot = resolveFilesPodRootUri(input.documentUri, { currentPodRootUri: input.podRootUri })
  const sourceIngestManifestUri = input.sourceIngestManifestUri
    ?? compatibilityInput.sourceIndexManifestUri
    ?? compatibilityInput.parserManifestUri
    ?? resolveSourceIngestManifestUri({
      documentUri: input.documentUri,
      sourceUri: input.sourceUri,
      podRootUri: input.podRootUri,
    })
  const operation = input.operation ?? 'refresh-card'
  const summary = input.summary?.trim() || '审阅 Ingest 输出后再更新 source-linked card。'
  const diff = input.diff?.trim() || 'Ingest 输出已进入审批；canonical card 内容保持不变。'
  const proposedContent = input.proposedContent?.trim() ? input.proposedContent : null
  const cardMetadata = normalizeSourceUpdateCardMetadata(input.cardMetadata)
  const label = `${slugify(input.subject)}-${slugify(input.sourceUri)}`
  const instanceSuffix = filesProposalInstanceSuffix([
    createdAt,
    snapshotAt,
    input.documentUri,
    input.subject,
    input.targetResourceUri,
    input.sourceUri,
    sourceIngestManifestUri,
    ingestVersion,
    sourceHash,
    operation,
    summary,
    diff,
    proposedContent,
    cardMetadata.title,
    cardMetadata.links,
  ])
  const proposalResourceUri = filesDataResourceUri(podRoot, `proposals/source/${label}-${instanceSuffix}.ttl`)
  return withSourceIngestProposalCompatibilityAlias({
    id: `${proposalResourceUri}#proposal`,
    kind: 'source-update-proposal',
    status: 'pending',
    operation,
    proposalResourceUri,
    documentUri: input.documentUri,
    subject: input.subject,
    targetResourceUri: input.targetResourceUri,
    sourceUri: input.sourceUri,
    sourceIngestManifestUri,
    ingestVersion,
    sourceHash,
    snapshotAt,
    summary,
    diff,
    proposedContent,
    cardMetadata,
    createdAt,
    writesCanonicalContent: false,
  })
}

function normalizeSourceUpdateCardMetadata(metadata?: Partial<SourceUpdateCardMetadata> | null): SourceUpdateCardMetadata {
  return {
    title: metadata?.title?.trim() || null,
    links: Array.from(new Set((metadata?.links ?? []).map((link) => link.trim()).filter(Boolean))),
  }
}

export function renderSourceUpdateProposalTurtle(proposal: SourceUpdateProposal) {
  return [
    '@prefix udfs: <https://undefineds.co/vocab/> .',
    '@prefix dcterms: <http://purl.org/dc/terms/> .',
    '',
    '<#proposal> a udfs:SourceUpdateProposal ;',
    `  udfs:status ${turtleString(proposal.status)} ;`,
    `  udfs:operation ${turtleString(proposal.operation)} ;`,
    `  udfs:sourceDocument <${proposal.documentUri}> ;`,
    `  udfs:subject ${turtleString(proposal.subject)} ;`,
    `  udfs:targetResource <${proposal.targetResourceUri}> ;`,
    `  dcterms:source <${proposal.sourceUri}> ;`,
    `  udfs:ingestManifest <${proposal.sourceIngestManifestUri}> ;`,
    `  udfs:ingestVersion ${turtleString(proposal.ingestVersion)} ;`,
    `  udfs:sourceHash ${turtleString(proposal.sourceHash)} ;`,
    `  udfs:snapshotAt ${turtleString(proposal.snapshotAt)} ;`,
    `  dcterms:description ${turtleString(proposal.summary)} ;`,
    `  udfs:diff ${turtleString(proposal.diff)} ;`,
    ...(proposal.proposedContent ? [`  udfs:proposedContent ${turtleString(proposal.proposedContent)} ;`] : []),
    ...(proposal.cardMetadata.title ? [`  udfs:proposedCardTitle ${turtleString(proposal.cardMetadata.title)} ;`] : []),
    ...proposal.cardMetadata.links.map((link) => `  udfs:proposedCardLink <${link}> ;`),
    `  dcterms:created ${turtleString(proposal.createdAt)} ;`,
    `  udfs:writesCanonicalContent ${proposal.writesCanonicalContent ? 'true' : 'false'} .`,
  ].join('\n')
}

function isSourceUpdateOperation(value: string | null): value is SourceUpdateOperation {
  return value === 'refresh-card' || value === 'replace-blocks' || value === 'append-blocks' || value === 'keep-local'
}

function isSourceUpdateStatus(value: string | null): value is SourceUpdateProposal['status'] {
  return value === 'pending' || value === 'approved' || value === 'rejected'
}

export function parseSourceUpdateProposalTurtle(source: string, proposalResourceUri: string): SourceUpdateProposal {
  const operation = readProposalLiteral(source, 'udfs:operation')
  const status = readProposalLiteral(source, 'udfs:status')
  const documentUri = readProposalIri(source, 'udfs:sourceDocument')
  const targetResourceUri = readProposalIri(source, 'udfs:targetResource')
  const sourceUri = readProposalIri(source, 'dcterms:source')
  const sourceIngestManifestUri = readFirstProposalIri(source, ['udfs:ingestManifest', 'udfs:parserManifest'])
  if (!isSourceUpdateOperation(operation) || !documentUri || !targetResourceUri || !sourceUri || !sourceIngestManifestUri) {
    throw new Error('Invalid Ingest proposal: missing required fields.')
  }
  const ingestVersion = readFirstProposalLiteral(source, ['udfs:ingestVersion', 'udfs:parserVersion']) ?? 'linx-ingest-v1'

  return withSourceIngestProposalCompatibilityAlias({
    id: `${proposalResourceUri}#proposal`,
    kind: 'source-update-proposal',
    status: isSourceUpdateStatus(status) ? status : 'pending',
    operation,
    proposalResourceUri,
    documentUri,
    subject: readProposalLiteral(source, 'udfs:subject') ?? '',
    targetResourceUri,
    sourceUri,
    sourceIngestManifestUri,
    ingestVersion,
    sourceHash: readProposalLiteral(source, 'udfs:sourceHash') ?? 'pending-source-hash',
    snapshotAt: readProposalLiteral(source, 'udfs:snapshotAt') ?? new Date().toISOString(),
    summary: readProposalLiteral(source, 'dcterms:description') ?? '',
    diff: readProposalLiteral(source, 'udfs:diff') ?? '',
    proposedContent: readProposalLiteral(source, 'udfs:proposedContent'),
    cardMetadata: normalizeSourceUpdateCardMetadata({
      title: readProposalLiteral(source, 'udfs:proposedCardTitle'),
      links: readProposalIris(source, 'udfs:proposedCardLink'),
    }),
    createdAt: readProposalLiteral(source, 'dcterms:created') ?? new Date().toISOString(),
    writesCanonicalContent: false,
  })
}

function readFirstProposalIri(source: string, predicates: readonly string[]): string | null {
  for (const predicate of predicates) {
    const value = readProposalIri(source, predicate)
    if (value) return value
  }
  return null
}

function readFirstProposalLiteral(source: string, predicates: readonly string[]): string | null {
  for (const predicate of predicates) {
    const value = readProposalLiteral(source, predicate)
    if (value) return value
  }
  return null
}

type SourceBlockMarker = {
  id: string
  hash: string
  origin: 'source' | 'user' | 'ai'
}

type SourceMarkedBlock = SourceBlockMarker & {
  marker: string
  content: string
  raw: string
}

const SOURCE_BLOCK_MARKER_PATTERN = /^<!--\s*linx-source-block\s+([^>]*?)\s*-->\s*$/m

function readMarkerAttribute(attributes: string, name: string) {
  return attributes.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? ''
}

function parseSourceBlockMarker(line: string): SourceBlockMarker | null {
  const match = line.match(/^<!--\s*linx-source-block\s+([^>]*?)\s*-->$/)
  if (!match) return null
  const id = readMarkerAttribute(match[1], 'id')
  const hash = readMarkerAttribute(match[1], 'hash')
  const origin = readMarkerAttribute(match[1], 'origin')
  if (!id || !hash || (origin !== 'source' && origin !== 'user' && origin !== 'ai')) return null
  return { id, hash, origin }
}

function parseSourceMarkedBlocks(content: string) {
  const blocks: SourceMarkedBlock[] = []
  const lines = content.split('\n')
  let index = 0
  while (index < lines.length) {
    const marker = parseSourceBlockMarker(lines[index])
    if (!marker) {
      index += 1
      continue
    }
    const start = index
    index += 1
    while (index < lines.length && !parseSourceBlockMarker(lines[index])) {
      index += 1
    }
    const rawLines = lines.slice(start, index)
    blocks.push({
      ...marker,
      marker: rawLines[0],
      content: rawLines.slice(1).join('\n').replace(/\s+$/, ''),
      raw: rawLines.join('\n').replace(/\s+$/, ''),
    })
  }
  return blocks
}

function renderSourceConflictBlock(existing: SourceMarkedBlock, proposed: SourceMarkedBlock) {
  return [
    existing.raw,
    '',
    `<!-- linx-source-conflict id="${existing.id}" source-hash="${proposed.hash}" -->`,
    proposed.raw,
    '<!-- /linx-source-conflict -->',
  ].join('\n')
}

function mergeSourceMarkedBlocks(existingContent: string, proposedContent: string) {
  const existingHasMarkers = SOURCE_BLOCK_MARKER_PATTERN.test(existingContent)
  const proposedHasMarkers = SOURCE_BLOCK_MARKER_PATTERN.test(proposedContent)
  if (!proposedHasMarkers) {
    return proposedContent
  }
  if (!existingHasMarkers) {
    const proposedHash = parseSourceMarkedBlocks(proposedContent)[0]?.hash ?? 'unknown'
    return [
      existingContent.replace(/\s+$/, ''),
      '',
      `<!-- linx-source-conflict id="unmarked" source-hash="${proposedHash}" -->`,
      proposedContent.replace(/^\s+|\s+$/g, ''),
      '<!-- /linx-source-conflict -->',
    ].join('\n')
  }
  const existingBlocks = new Map(parseSourceMarkedBlocks(existingContent).map((block) => [block.id, block]))
  const proposedBlocks = parseSourceMarkedBlocks(proposedContent)
  if (proposedBlocks.length === 0) return proposedContent

  const mergedBlocks = proposedBlocks.map((proposed) => {
    const existing = existingBlocks.get(proposed.id)
    if (!existing) return proposed.raw
    if (existing.origin !== 'source' || existing.hash !== proposed.hash) {
      return renderSourceConflictBlock(existing, proposed)
    }
    return proposed.raw
  })
  return mergedBlocks.join('\n\n')
}

export function applySourceUpdateProposalToContent(existingContent: string, proposal: SourceUpdateProposal) {
  if (proposal.operation === 'keep-local') return existingContent
  const proposedContent = proposal.proposedContent
  if (!proposedContent) return existingContent
  if (proposal.operation === 'append-blocks') {
    return `${existingContent.replace(/\s+$/, '')}\n\n${proposedContent.replace(/^\s+/, '')}`
  }
  if (proposal.operation === 'replace-blocks' || proposal.operation === 'refresh-card') {
    return mergeSourceMarkedBlocks(existingContent, proposedContent)
  }
  return proposedContent
}

function replaceTurtleLiteralPredicate(source: string, predicate: string, value: string) {
  const escapedPredicate = predicate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(${escapedPredicate}|<https://undefineds\\.co/vocab/${escapedPredicate.replace(/^udfs:/, '')}>)\\s+"(?:\\\\.|[^"\\\\])*"`)
  return source.replace(pattern, `$1 ${turtleString(value)}`)
}

function replaceTurtleIriPredicate(source: string, predicate: string, iri: string) {
  const escapedPredicate = predicate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(${escapedPredicate}|<https://undefineds\\.co/vocab/${escapedPredicate.replace(/^udfs:/, '')}>)\\s+<[^>]*>`)
  return source.replace(pattern, `$1 <${iri}>`)
}

function removeTurtlePredicateLine(source: string, predicate: string) {
  const escapedPredicate = predicate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const absolutePredicate = `<https://undefineds\\.co/vocab/${escapedPredicate.replace(/^udfs:/, '')}>`
  const pattern = new RegExp(`^\\s*(?:${escapedPredicate}|${absolutePredicate})\\s+[^\\n]*[.;]\\n?`, 'gm')
  return source.replace(pattern, '')
}

function hasTurtlePredicate(source: string, predicate: string): boolean {
  const escapedPredicate = predicate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(?:${escapedPredicate}|<https://undefineds\\.co/vocab/${escapedPredicate.replace(/^udfs:/, '')}>)\\s+`)
  return pattern.test(source)
}

function insertTurtleLineAfterPredicate(source: string, afterPredicate: string, line: string): string {
  const escapedPredicate = afterPredicate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(^\\s*(?:${escapedPredicate}|<https://undefineds\\.co/vocab/${escapedPredicate.replace(/^udfs:/, '')}>)[^\\n]*;)(\\n)`, 'm')
  if (pattern.test(source)) {
    return source.replace(pattern, `$1$2${line}\n`)
  }
  return source.replace(/(^<#card>\s+a\s+[^;]+;)(\n)/m, `$1$2${line}\n`)
}

function replaceOrInsertTurtleLiteralPredicate(source: string, predicate: string, value: string, afterPredicate: string): string {
  if (hasTurtlePredicate(source, predicate)) {
    return replaceTurtleLiteralPredicate(source, predicate, value)
  }
  return insertTurtleLineAfterPredicate(source, afterPredicate, `  ${predicate} ${turtleString(value)} ;`)
}

function replaceOrInsertTurtleIriPredicate(source: string, predicate: string, iri: string, afterPredicate: string): string {
  if (hasTurtlePredicate(source, predicate)) {
    return replaceTurtleIriPredicate(source, predicate, iri)
  }
  return insertTurtleLineAfterPredicate(source, afterPredicate, `  ${predicate} <${iri}> ;`)
}

export function updateSourceLinkedCardDescriptorFromProposal(
  source: string,
  proposal: SourceUpdateProposal,
): string {
  if (!source.includes('SourceLinkedCard')) return source
  const withHash = replaceTurtleLiteralPredicate(source, 'udfs:sourceHash', proposal.sourceHash)
  const withIngestVersion = replaceOrInsertTurtleLiteralPredicate(
    withHash,
    'udfs:ingestVersion',
    proposal.ingestVersion,
    'udfs:sourceHash',
  )
  const withIngestManifest = replaceOrInsertTurtleIriPredicate(
    withIngestVersion,
    'udfs:ingestManifest',
    proposal.sourceIngestManifestUri,
    'udfs:ingestVersion',
  )
  return removeTurtlePredicateLine(
    removeTurtlePredicateLine(withIngestManifest, 'udfs:parserVersion'),
    'udfs:parserManifest',
  )
}
