import {
  filesDataResourceUri,
  filesProposalInstanceSuffix,
  filesVocabRegistryUri,
  resolveFilesPodRootUri,
  turtleString,
} from '../resource/files-rdf-contract'
import {
  canonicalPredicateKey,
  localName,
  termLookupKeys,
} from './structured-term-keys'

export {
  validateStructuredTableShapeConstraints,
} from './structured-shape-validation'
export type {
  StructuredShapeValidationWarning,
} from './structured-shape-validation'

export interface StructuredTableCell {
  predicate: string
  values: string[]
}

export interface StructuredTableRow {
  subject: string
  cells: StructuredTableCell[]
}

export interface StructuredTableProjection {
  prefixes: Record<string, string>
  predicates: string[]
  rows: StructuredTableRow[]
  warnings: string[]
}

export interface StructuredClassScopedProjection extends StructuredTableProjection {
  className: string | null
  classOptions: string[]
}

export interface StructuredTableViewOptions {
  searchText?: string | null
  sortKey?: string | null
  sortDirection?: 'asc' | 'desc'
}

export interface StructuredResourceProjectionOptions {
  uri: string
  mimeType?: string | null
  source: string | null | undefined
}

export type LockedVocabRegistryKind = 'terms' | 'shapes' | 'namespaces'

export interface LockedVocabRegistryRow {
  registryKind?: LockedVocabRegistryKind
  uri: string
  label: string
  definition: string
  kind: string
  range: string
  status: string
  shape: string
  predicate: string
  term: string
  classScope: string
  constraint: string
  minCount?: string
  maxCount?: string
  datatype?: string
  pattern?: string
  prefix: string
  namespace: string
}

export interface StructuredVocabShapeRuleDefinition {
  uri: string
  label: string
  classScope: string
  constraint: string
  minCount?: number
  maxCount?: number
  datatype?: string
  pattern?: string
  status: string
}

export interface StructuredVocabTermDefinition {
  uri: string
  label: string
  description: string
  status: string
}

export interface StructuredVocabPredicateDefinition extends StructuredVocabTermDefinition {
  valueType: string
  shape: string
  predicateUri?: string
  shapeRules: StructuredVocabShapeRuleDefinition[]
}

export interface StructuredVocabDefinitionIndex {
  classes: Map<string, StructuredVocabTermDefinition>
  predicates: Map<string, StructuredVocabPredicateDefinition>
  enumOptionsByPredicate: Map<string, StructuredVocabTermDefinition[]>
  shapesByTerm: Map<string, StructuredVocabShapeRuleDefinition[]>
  namespaces: Map<string, string>
}

export interface StructuredCellWriteProposal {
  id: string
  kind: 'cell-write'
  status: 'pending-write'
  documentUri: string
  subject: string
  predicate: string
  vocabTermProposalResourceUri?: string
  previousValues: string[]
  nextValues: string[]
  writesCanonicalResource: true
}

export interface VocabTermProposal {
  id: string
  kind: 'vocab-term-proposal'
  status: 'pending' | 'approved' | 'rejected'
  operation: 'create'
  documentUri: string
  proposalResourceUri: string
  targetVocabUri: string
  targetShapesUri: string
  classScope: string | null
  termUri: string
  termKind: 'class' | 'predicate' | 'enum-option' | 'shape'
  label: string
  valueType: string
  description: string
  shape: string
  predicate?: string
  createdAt: string
  writesCanonicalVocab: false
}

export const FILES_VOCAB_APPROVAL_POLICY_VERSION = 'files-vocab-proposal-v1'
export const FILES_VOCAB_APPROVAL_TOOL_NAME = 'files.vocab.proposal'
export const FILES_VOCAB_APPROVAL_ACTION = 'https://undefineds.co/vocab/approveVocabTermProposal'

export function createStructuredCellWriteProposal({
  documentUri,
  subject,
  predicate,
  vocabTermProposalResourceUri,
  previousValues,
  nextValues,
}: {
  documentUri: string
  subject: string
  predicate: string
  vocabTermProposalResourceUri?: string
  previousValues: string[]
  nextValues: string[]
}): StructuredCellWriteProposal {
  return {
    id: `${documentUri}|${subject}|${predicate}`,
    kind: 'cell-write',
    status: 'pending-write',
    documentUri,
    subject,
    predicate,
    ...(vocabTermProposalResourceUri ? { vocabTermProposalResourceUri } : {}),
    previousValues,
    nextValues,
    writesCanonicalResource: true,
  }
}

function localTermName(uri: string) {
  const hashIndex = uri.lastIndexOf('#')
  if (hashIndex >= 0 && hashIndex < uri.length - 1) return uri.slice(hashIndex + 1)
  const slashIndex = uri.lastIndexOf('/')
  if (slashIndex >= 0 && slashIndex < uri.length - 1) return uri.slice(slashIndex + 1)
  const colonIndex = uri.lastIndexOf(':')
  if (colonIndex >= 0 && colonIndex < uri.length - 1) return uri.slice(colonIndex + 1)
  return uri
}

function slugifyTerm(value: string) {
  const slug = value
    .trim()
    .replace(/^[#./]+/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return slug || 'term'
}

function stripIriDelimiters(value: string) {
  const trimmed = value.trim()
  return trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed.slice(1, -1).trim() : trimmed
}

function targetVocabDocumentUri(targetVocabUri: string) {
  const hashIndex = targetVocabUri.indexOf('#')
  return hashIndex >= 0 ? targetVocabUri.slice(0, hashIndex) : targetVocabUri
}

function assertTargetVocabTermUri(termUri: string, targetVocabUri: string) {
  const targetDocumentUri = targetVocabDocumentUri(targetVocabUri)
  if (!termUri.startsWith(`${targetDocumentUri}#`)) {
    throw new Error('Vocab term proposals must target the selected vocab terms registry.')
  }
}

function safeVocabFragment(value: string) {
  return value
    .trim()
    .replace(/^[#./]+/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || slugifyTerm(value)
}

export function predicateReferenceFromVocabShape(shape?: string | null) {
  const trimmed = shape?.trim() ?? ''
  return trimmed.match(/^predicate\s+(.+)$/i)?.[1]?.trim() ?? ''
}

export function resolveVocabTermReference(value: string | null | undefined, targetVocabUri: string) {
  const raw = stripIriDelimiters(value ?? '')
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw) || /^urn:/i.test(raw) || /^mailto:/i.test(raw)) return raw
  if (raw.startsWith('./') || raw.startsWith('../')) {
    try {
      return new URL(raw, targetVocabDocumentUri(targetVocabUri)).href
    } catch {
      return raw
    }
  }
  const targetDocumentUri = targetVocabDocumentUri(targetVocabUri)
  const fragment = raw.startsWith('#') ? raw.slice(1) : localTermName(raw)
  return `${targetDocumentUri}#${safeVocabFragment(fragment)}`
}

function turtleIri(value: string) {
  return `<${stripIriDelimiters(value)}>`
}

export function createVocabTermProposal({
  documentUri,
  classScope,
  termUri,
  termKind,
  label,
  valueType,
  description,
  shape,
  predicate,
  podRootUri,
  targetVocabUri,
  targetShapesUri,
  createdAt = new Date().toISOString(),
}: {
  documentUri: string
  classScope?: string | null
  termUri: string
  termKind: VocabTermProposal['termKind']
  label?: string
  valueType?: string
  description?: string
  shape?: string
  predicate?: string
  podRootUri?: string | null
  targetVocabUri?: string
  targetShapesUri?: string
  createdAt?: string
}): VocabTermProposal {
  const podRoot = resolveFilesPodRootUri(documentUri, { currentPodRootUri: podRootUri })
  const termLabel = label?.trim() || localTermName(termUri)
  const instanceSuffix = filesProposalInstanceSuffix([
    createdAt,
    documentUri,
    classScope,
    termUri,
    termKind,
    termLabel,
    valueType,
    description,
    shape,
    predicate,
  ])
  const proposalResourceUri = filesDataResourceUri(podRoot, `proposals/vocab/${slugifyTerm(termLabel)}-${instanceSuffix}.ttl`)
  const resolvedTargetVocabUri = targetVocabUri ?? filesVocabRegistryUri(podRoot, 'terms')
  const resolvedTargetShapesUri = targetShapesUri ?? filesVocabRegistryUri(podRoot, 'shapes')
  assertTargetVocabTermUri(termUri, resolvedTargetVocabUri)
  const predicateReference = termKind === 'enum-option'
    ? resolveVocabTermReference(predicate || predicateReferenceFromVocabShape(shape), resolvedTargetVocabUri)
    : predicate?.trim() ?? ''
  return {
    id: `${proposalResourceUri}#proposal`,
    kind: 'vocab-term-proposal',
    status: 'pending',
    operation: 'create',
    documentUri,
    proposalResourceUri,
    targetVocabUri: resolvedTargetVocabUri,
    targetShapesUri: resolvedTargetShapesUri,
    classScope: classScope ?? null,
    termUri,
    termKind,
    label: termLabel,
    valueType: valueType?.trim() || '',
    description: description?.trim() || '',
    shape: shape?.trim() || '',
    ...(predicateReference ? { predicate: predicateReference } : {}),
    createdAt,
    writesCanonicalVocab: false,
  }
}

export function renderVocabTermProposalTurtle(proposal: VocabTermProposal) {
  const lines = [
    '@prefix udfs: <https://undefineds.co/vocab/> .',
    '@prefix dcterms: <http://purl.org/dc/terms/> .',
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
    '',
    '<#proposal> a udfs:VocabTermProposal ;',
    `  udfs:status ${turtleString(proposal.status)} ;`,
    `  udfs:operation ${turtleString(proposal.operation)} ;`,
    `  udfs:term <${proposal.termUri}> ;`,
    `  udfs:termKind ${turtleString(proposal.termKind)} ;`,
    `  rdfs:label ${turtleString(proposal.label)} ;`,
    `  udfs:valueType ${turtleString(proposal.valueType)} ;`,
    `  rdfs:comment ${turtleString(proposal.description)} ;`,
    `  udfs:shape ${turtleString(proposal.shape)} ;`,
    ...(proposal.predicate ? [`  udfs:predicate ${turtleIri(proposal.predicate)} ;`] : []),
    `  udfs:sourceDocument <${proposal.documentUri}> ;`,
    `  udfs:targetVocab <${proposal.targetVocabUri}> ;`,
    `  udfs:targetShapes <${proposal.targetShapesUri}> ;`,
    `  dcterms:created ${turtleString(proposal.createdAt)} ;`,
    `  udfs:writesCanonicalVocab ${proposal.writesCanonicalVocab ? 'true' : 'false'} .`,
  ]
  if (proposal.classScope) {
    lines.splice(lines.length - 1, 0, `  udfs:classScope ${turtleString(proposal.classScope)} ;`)
  }
  return lines.join('\n')
}

const VOCAB_PROPOSAL_PREDICATE_IRIS: Record<string, string> = {
  'dcterms:created': 'http://purl.org/dc/terms/created',
  'rdfs:comment': 'http://www.w3.org/2000/01/rdf-schema#comment',
  'rdfs:label': 'http://www.w3.org/2000/01/rdf-schema#label',
  'udfs:classScope': 'https://undefineds.co/vocab/classScope',
  'udfs:sourceDocument': 'https://undefineds.co/vocab/sourceDocument',
  'udfs:predicate': 'https://undefineds.co/vocab/predicate',
  'udfs:shape': 'https://undefineds.co/vocab/shape',
  'udfs:status': 'https://undefineds.co/vocab/status',
  'udfs:targetShapes': 'https://undefineds.co/vocab/targetShapes',
  'udfs:targetVocab': 'https://undefineds.co/vocab/targetVocab',
  'udfs:term': 'https://undefineds.co/vocab/term',
  'udfs:termKind': 'https://undefineds.co/vocab/termKind',
  'udfs:valueType': 'https://undefineds.co/vocab/valueType',
}

function vocabProposalPredicatePattern(predicate: string): string {
  const fullIri = VOCAB_PROPOSAL_PREDICATE_IRIS[predicate]
  return [
    escapeRegExp(predicate),
    fullIri ? `<${escapeRegExp(fullIri)}>` : null,
  ].filter(Boolean).join('|')
}

function readVocabProposalIri(source: string, predicate: string): string | null {
  return source.match(new RegExp(`(?:${vocabProposalPredicatePattern(predicate)})\\s+<([^>]+)>`))?.[1] ?? null
}

function readVocabProposalLiteral(source: string, predicate: string): string | null {
  const match = source.match(new RegExp(`(?:${vocabProposalPredicatePattern(predicate)})\\s+"((?:\\\\.|[^"\\\\])*)"`))
  return match?.[1]
    ?.replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\') ?? null
}

function isVocabTermKind(value: string | null): value is VocabTermProposal['termKind'] {
  return value === 'class' || value === 'predicate' || value === 'enum-option' || value === 'shape'
}

function isVocabProposalStatus(value: string | null): value is VocabTermProposal['status'] {
  return value === 'pending' || value === 'approved' || value === 'rejected'
}

export function parseVocabTermProposalTurtle(source: string, proposalResourceUri: string): VocabTermProposal {
  const termUri = readVocabProposalIri(source, 'udfs:term')
  const targetVocabUri = readVocabProposalIri(source, 'udfs:targetVocab')
  const targetShapesUri = readVocabProposalIri(source, 'udfs:targetShapes')
  const documentUri = readVocabProposalIri(source, 'udfs:sourceDocument')
  const termKind = readVocabProposalLiteral(source, 'udfs:termKind')
  const status = readVocabProposalLiteral(source, 'udfs:status')
  if (!termUri || !targetVocabUri || !targetShapesUri || !documentUri || !isVocabTermKind(termKind)) {
    throw new Error('Invalid vocab term proposal: missing required fields.')
  }
  const shape = readVocabProposalLiteral(source, 'udfs:shape') ?? ''
  const rawPredicate = readVocabProposalIri(source, 'udfs:predicate')
    ?? readVocabProposalLiteral(source, 'udfs:predicate')
    ?? predicateReferenceFromVocabShape(shape)
  const predicate = resolveVocabTermReference(rawPredicate, targetVocabUri)

  return {
    id: `${proposalResourceUri}#proposal`,
    kind: 'vocab-term-proposal',
    status: isVocabProposalStatus(status) ? status : 'pending',
    operation: 'create',
    documentUri,
    proposalResourceUri,
    targetVocabUri,
    targetShapesUri,
    classScope: readVocabProposalLiteral(source, 'udfs:classScope'),
    termUri,
    termKind,
    label: readVocabProposalLiteral(source, 'rdfs:label') ?? '',
    valueType: readVocabProposalLiteral(source, 'udfs:valueType') ?? '',
    description: readVocabProposalLiteral(source, 'rdfs:comment') ?? '',
    shape,
    ...(predicate ? { predicate } : {}),
    createdAt: readVocabProposalLiteral(source, 'dcterms:created') ?? new Date().toISOString(),
    writesCanonicalVocab: false,
  }
}

function vocabTermRdfClass(termKind: VocabTermProposal['termKind']): string {
  switch (termKind) {
    case 'class': return 'udfs:ClassTerm'
    case 'predicate': return 'udfs:PredicateTerm'
    case 'enum-option': return 'udfs:EnumOptionTerm'
    case 'shape': return 'udfs:ShapeTerm'
  }
}

function shapeRuleUri(proposal: VocabTermProposal): string {
  const local = localTermName(proposal.termUri)
    .trim()
    .replace(/^[#./]+/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'shape'
  return `${proposal.targetShapesUri}#${local}-shape`
}

function isNormalizedTriplesSource(sourceText: string) {
  return sourceText.trim().length > 0 && !sourceText.includes('@prefix')
}

function expandVocabTermRdfClass(termKind: VocabTermProposal['termKind']): string {
  return `https://undefineds.co/vocab/${vocabTermRdfClass(termKind).replace('udfs:', '')}`
}

export function renderApprovedVocabTermNTriples(proposal: VocabTermProposal): string {
  const lines = [
    `<${proposal.termUri}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <${expandVocabTermRdfClass(proposal.termKind)}> .`,
    `<${proposal.termUri}> <http://www.w3.org/2000/01/rdf-schema#label> ${turtleString(proposal.label)} .`,
    `<${proposal.termUri}> <https://undefineds.co/vocab/termKind> ${turtleString(proposal.termKind)} .`,
    `<${proposal.termUri}> <https://undefineds.co/vocab/valueType> ${turtleString(proposal.valueType)} .`,
    `<${proposal.termUri}> <http://www.w3.org/2000/01/rdf-schema#comment> ${turtleString(proposal.description)} .`,
    `<${proposal.termUri}> <https://undefineds.co/vocab/shape> ${turtleString(proposal.shape)} .`,
    ...(proposal.predicate ? [`<${proposal.termUri}> <https://undefineds.co/vocab/predicate> ${turtleIri(proposal.predicate)} .`] : []),
    `<${proposal.termUri}> <https://undefineds.co/vocab/sourceProposal> <${proposal.id}> .`,
    `<${proposal.termUri}> <http://purl.org/dc/terms/created> ${turtleString(proposal.createdAt)} .`,
  ]
  if (proposal.classScope) {
    lines.push(`<${proposal.termUri}> <https://undefineds.co/vocab/classScope> ${turtleString(proposal.classScope)} .`)
  }
  return lines.join('\n')
}

function renderApprovedVocabShapeNTriples(proposal: VocabTermProposal, ruleUri: string): string {
  const lines = [
    `<${ruleUri}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://undefineds.co/vocab/ShapeRule> .`,
    `<${ruleUri}> <https://undefineds.co/vocab/term> <${proposal.termUri}> .`,
    `<${ruleUri}> <https://undefineds.co/vocab/constraint> ${turtleString(proposal.shape)} .`,
    `<${ruleUri}> <https://undefineds.co/vocab/valueType> ${turtleString(proposal.valueType)} .`,
    `<${ruleUri}> <https://undefineds.co/vocab/sourceProposal> <${proposal.id}> .`,
    `<${ruleUri}> <http://purl.org/dc/terms/created> ${turtleString(proposal.createdAt)} .`,
  ]
  if (proposal.classScope) {
    lines.push(`<${ruleUri}> <https://undefineds.co/vocab/classScope> ${turtleString(proposal.classScope)} .`)
  }
  return lines.join('\n')
}

export function renderApprovedVocabShapeProposalNTriples(proposal: VocabTermProposal): string {
  if (!proposal.shape.trim()) return ''
  return renderApprovedVocabShapeNTriples(proposal, shapeRuleUri(proposal))
}

export function applyApprovedVocabTermProposalToTurtle(sourceText: string, proposal: VocabTermProposal): string {
  if (sourceText.includes(`<${proposal.termUri}>`) || sourceText.includes(proposal.termUri)) {
    return sourceText
  }

  if (isNormalizedTriplesSource(sourceText)) {
    return `${sourceText.trimEnd()}\n\n${renderApprovedVocabTermNTriples(proposal)}\n`
  }

  const prefixBlock = [
    sourceText.includes('@prefix udfs:') ? null : '@prefix udfs: <https://undefineds.co/vocab/> .',
    sourceText.includes('@prefix rdfs:') ? null : '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
    sourceText.includes('@prefix dcterms:') ? null : '@prefix dcterms: <http://purl.org/dc/terms/> .',
  ].filter(Boolean).join('\n')
  const existing = sourceText.trimEnd()
  const header = [prefixBlock, existing].filter(Boolean).join('\n')
  const lines = [
    `<${proposal.termUri}> a ${vocabTermRdfClass(proposal.termKind)} ;`,
    `  rdfs:label ${turtleString(proposal.label)} ;`,
    `  udfs:termKind ${turtleString(proposal.termKind)} ;`,
    `  udfs:valueType ${turtleString(proposal.valueType)} ;`,
    `  rdfs:comment ${turtleString(proposal.description)} ;`,
    `  udfs:shape ${turtleString(proposal.shape)} ;`,
    ...(proposal.predicate ? [`  udfs:predicate ${turtleIri(proposal.predicate)} ;`] : []),
    `  udfs:sourceProposal <${proposal.id}> ;`,
    `  dcterms:created ${turtleString(proposal.createdAt)} .`,
  ]

  if (proposal.classScope) {
    lines.splice(lines.length - 1, 0, `  udfs:classScope ${turtleString(proposal.classScope)} ;`)
  }

  return `${header}\n\n${lines.join('\n')}\n`
}

export function applyApprovedVocabShapeProposalToTurtle(sourceText: string, proposal: VocabTermProposal): string {
  if (!proposal.shape.trim()) return sourceText

  const ruleUri = shapeRuleUri(proposal)
  if (sourceText.includes(`<${ruleUri}>`) || sourceText.includes(ruleUri)) {
    return sourceText
  }

  if (isNormalizedTriplesSource(sourceText)) {
    return `${sourceText.trimEnd()}\n\n${renderApprovedVocabShapeNTriples(proposal, ruleUri)}\n`
  }

  const prefixBlock = [
    sourceText.includes('@prefix udfs:') ? null : '@prefix udfs: <https://undefineds.co/vocab/> .',
    sourceText.includes('@prefix dcterms:') ? null : '@prefix dcterms: <http://purl.org/dc/terms/> .',
  ].filter(Boolean).join('\n')
  const existing = sourceText.trimEnd()
  const header = [prefixBlock, existing].filter(Boolean).join('\n')
  const lines = [
    `<${ruleUri}> a udfs:ShapeRule ;`,
    `  udfs:term <${proposal.termUri}> ;`,
    `  udfs:constraint ${turtleString(proposal.shape)} ;`,
    `  udfs:valueType ${turtleString(proposal.valueType)} ;`,
    `  udfs:sourceProposal <${proposal.id}> ;`,
    `  dcterms:created ${turtleString(proposal.createdAt)} .`,
  ]

  if (proposal.classScope) {
    lines.splice(lines.length - 1, 0, `  udfs:classScope ${turtleString(proposal.classScope)} ;`)
  }

  return `${header}\n\n${lines.join('\n')}\n`
}

function formatTurtlePredicatePatchValues(values: string[]) {
  return values.join(', ')
}

function formatTurtleSubjectToken(term: string): string {
  if (term.startsWith('#')) return `<${term}>`
  if (/^https?:\/\//.test(term)) return `<${term}>`
  return term
}

function formatTurtlePredicateToken(term: string): string {
  if (/^https?:\/\//.test(term)) return `<${term}>`
  return term
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values))
}

function turtleSubjectTokenCandidates(proposal: StructuredCellWriteProposal): string[] {
  const tokens = [formatTurtleSubjectToken(proposal.subject)]
  const hashSubjectPrefix = `${proposal.documentUri}#`

  if (proposal.subject.startsWith(hashSubjectPrefix)) {
    tokens.push(`<#${proposal.subject.slice(hashSubjectPrefix.length)}>`)
  }

  if (proposal.subject.startsWith('#')) {
    tokens.push(`<${proposal.documentUri}${proposal.subject}>`)
  }

  return uniqueValues(tokens)
}

function turtlePredicateTokenCandidates(predicate: string): string[] {
  return uniqueValues([predicate, formatTurtlePredicateToken(predicate)])
}

const TURTLE_PREDICATE_PREFIX_PATTERN = '(?:^\\s*\\S+\\s+|[;\\r\\n]\\s*)'

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findStatementEnd(source: string, statementStart: number) {
  let inIri = false
  let inLiteral = false
  let escaped = false

  for (let index = statementStart; index < source.length; index += 1) {
    const char = source[index]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === '\\' && inLiteral) {
      escaped = true
      continue
    }

    if (char === '<' && !inLiteral) inIri = true
    if (char === '>' && inIri) inIri = false
    if (char === '"' && !inIri) inLiteral = !inLiteral

    const nextChar = source[index + 1]
    if (char === '.' && !inIri && !inLiteral && (!nextChar || /\s/.test(nextChar))) {
      return index
    }
  }

  return -1
}

interface TurtleStatementMatch {
  start: number
  end: number
  statement: string
}

function findSubjectStatements(source: string, proposal: StructuredCellWriteProposal): TurtleStatementMatch[] {
  const statements: TurtleStatementMatch[] = []

  for (const subjectToken of turtleSubjectTokenCandidates(proposal)) {
    const subjectPattern = new RegExp(`(^|[\\r\\n])(?<indent>\\s*)${escapeRegExp(subjectToken)}(?=\\s)`, 'gm')
    let subjectMatch: RegExpExecArray | null

    while ((subjectMatch = subjectPattern.exec(source)) !== null) {
      const statementStart = subjectMatch.index + (subjectMatch[1]?.length ?? 0)
      const statementEnd = findStatementEnd(source, statementStart)
      if (statementEnd >= statementStart) {
        statements.push({
          start: statementStart,
          end: statementEnd,
          statement: source.slice(statementStart, statementEnd + 1),
        })
      }
    }
  }

  return statements
}

function tryApplyStructuredCellWritePatchToTurtle(
  source: string,
  proposal: StructuredCellWriteProposal,
): string | null {
  const subjectStatements = findSubjectStatements(source, proposal)
  if (subjectStatements.length === 0) return null

  const predicateTokens = turtlePredicateTokenCandidates(proposal.predicate)
  if (proposal.previousValues.length === 0) {
    const hasExistingPredicate = subjectStatements.some(({ statement }) => (
      predicateTokens.some((predicateToken) => {
        const existingPredicatePattern = new RegExp(`${TURTLE_PREDICATE_PREFIX_PATTERN}${escapeRegExp(predicateToken)}(?=\\s)`, 'm')
        return existingPredicatePattern.test(statement)
      })
    ))
    if (hasExistingPredicate) return null

    const { start: statementStart, end: statementEnd, statement } = subjectStatements[0]
    const beforeEnd = statement.slice(0, -1).replace(/\s+$/, '')
    const trailingWhitespace = statement.slice(beforeEnd.length, -1)
    const insertedStatement = `${beforeEnd} ; ${formatTurtlePredicateToken(proposal.predicate)} ${formatTurtlePredicatePatchValues(proposal.nextValues)}${trailingWhitespace}.`
    return `${source.slice(0, statementStart)}${insertedStatement}${source.slice(statementEnd + 1)}`
  }

  const patchTarget = subjectStatements
    .map(({ start, end, statement }) => {
      const predicateMatch = predicateTokens
        .map((predicateToken) => {
          const predicatePattern = new RegExp(`(?<prefix>${TURTLE_PREDICATE_PREFIX_PATTERN})(?<predicate>${escapeRegExp(predicateToken)})(?<gap>\\s+)${escapeRegExp(proposal.previousValues.join(', '))}(?<suffix>\\s*(?:[;.]|(?=#)))`, 'm')
          return predicatePattern.exec(statement)
        })
        .find((match) => match?.groups)

      return predicateMatch?.groups ? { start, end, statement, predicateMatch } : null
    })
    .find(Boolean)
  if (!patchTarget) return null

  const { start: statementStart, end: statementEnd, statement, predicateMatch } = patchTarget
  if (!predicateMatch?.groups) return null

  const replacement = [
    predicateMatch.groups.prefix,
    predicateMatch.groups.predicate,
    predicateMatch.groups.gap,
    formatTurtlePredicatePatchValues(proposal.nextValues),
    predicateMatch.groups.suffix,
  ].join('')
  const nextStatement = `${statement.slice(0, predicateMatch.index)}${replacement}${statement.slice(predicateMatch.index + predicateMatch[0].length)}`

  return `${source.slice(0, statementStart)}${nextStatement}${source.slice(statementEnd + 1)}`
}

export function applyStructuredCellWriteProposalToTurtle(
  source: string | null | undefined,
  proposal: StructuredCellWriteProposal,
): string {
  const sourceText = source ?? ''
  const targetedPatch = tryApplyStructuredCellWritePatchToTurtle(sourceText, proposal)
  if (targetedPatch) return targetedPatch

  if (proposal.previousValues.length === 0) {
    const hasSubject = turtleSubjectTokenCandidates(proposal).some((subjectToken) => {
      const subjectPattern = new RegExp(`(^|[\\r\\n])\\s*${escapeRegExp(subjectToken)}(?=\\s)`, 'm')
      return subjectPattern.test(sourceText)
    })
    if (!hasSubject) {
      const subjectToken = formatTurtleSubjectToken(proposal.subject)
      const separator = sourceText.trimEnd().length > 0 ? '\n' : ''
      return `${sourceText.trimEnd()}${separator}${subjectToken} ${formatTurtlePredicateToken(proposal.predicate)} ${formatTurtlePredicatePatchValues(proposal.nextValues)} .\n`
    }
  }

  throw new Error('Cannot apply structured cell proposal without a lossless Turtle patch.')
}

interface Triple {
  subject: string
  predicate: string
  object: string
}

const PREFIX_PATTERN = /^@prefix\s+([A-Za-z][\w-]*):\s*<([^>]+)>\s*\.\s*$/
const DEFAULT_PREFIX_PATTERN = /^@prefix\s+:\s*<([^>]+)>\s*\.\s*$/
const SPARQL_PREFIX_PATTERN = /^PREFIX\s+([A-Za-z][\w-]*):\s*<([^>]+)>\s*$/i
const BASE_PATTERN = /^(?:@base|BASE)\s+<([^>]+)>\s*\.?$/i
const DIRECTIVE_WITHOUT_DOT_PATTERN = /^(?:PREFIX|BASE)\b/i
const UNSUPPORTED_DIRECTIVE_PATTERN = /^@[A-Za-z]/
const RDF_TYPE_IRI = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'

function stripComment(line: string): string {
  let inIri = false
  let inLiteral = false
  let escaped = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === '\\' && inLiteral) {
      escaped = true
      continue
    }

    if (char === '<' && !inLiteral) inIri = true
    if (char === '>' && inIri) inIri = false
    if (char === '"' && !inIri) inLiteral = !inLiteral
    if (char === '#' && !inIri && !inLiteral) return line.slice(0, index)
  }

  return line
}

function splitStatements(source: string): string[] {
  const statements: string[] = []
  let current = ''
  let inIri = false
  let inLiteral = false
  let escaped = false

  for (const rawLine of source.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim()
    if (!line) continue
    if (!current && DIRECTIVE_WITHOUT_DOT_PATTERN.test(line) && !line.endsWith('.')) {
      statements.push(line)
      continue
    }

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]
      current += char

      if (escaped) {
        escaped = false
        continue
      }

      if (char === '\\' && inLiteral) {
        escaped = true
        continue
      }

      if (char === '<' && !inLiteral) inIri = true
      if (char === '>' && inIri) inIri = false
      if (char === '"' && !inIri) inLiteral = !inLiteral

      const nextChar = line[index + 1]
      if (char === '.' && !inIri && !inLiteral && (!nextChar || /\s/.test(nextChar))) {
        statements.push(current.trim())
        current = ''
      }
    }

    if (current) current += ' '
  }

  if (current.trim()) statements.push(current.trim())

  return statements
}

function tokenize(statement: string): string[] {
  const tokens: string[] = []
  const pattern = /"([^"\\]|\\.)*"(?:@[A-Za-z-]+|\^\^<[^>]+>|\^\^[A-Za-z][\w.-]*:[\w.-]+)?|<[^>]+>|[;,]|\.(?=\s|$)|[^\s;,]+/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(statement))) {
    tokens.push(match[0])
  }

  return tokens
}

function resolveIri(value: string, baseIri?: string): string {
  if (!baseIri) return value
  try {
    return new URL(value, baseIri).href
  } catch {
    return value
  }
}

function normalizeTerm(token: string, baseIri?: string): string {
  if (token === 'a') return 'rdf:type'
  if (token.startsWith('<') && token.endsWith('>')) {
    const resolved = resolveIri(token.slice(1, -1), baseIri)
    return resolved === RDF_TYPE_IRI ? 'rdf:type' : resolved
  }
  return token
}

function buildStructuredProjection(
  prefixes: Record<string, string>,
  triples: readonly Triple[],
  warnings: string[],
): StructuredTableProjection {
  const predicateSet = new Set<string>()
  const rowsBySubject = new Map<string, Map<string, string[]>>()

  for (const triple of triples) {
    predicateSet.add(triple.predicate)
    const row = rowsBySubject.get(triple.subject) ?? new Map<string, string[]>()
    const values = row.get(triple.predicate) ?? []
    values.push(triple.object)
    row.set(triple.predicate, values)
    rowsBySubject.set(triple.subject, row)
  }

  const predicates = Array.from(predicateSet).sort((left, right) => {
    if (left === 'rdf:type') return -1
    if (right === 'rdf:type') return 1
    return left.localeCompare(right)
  })

  const rows = Array.from(rowsBySubject.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([subject, cellMap]) => ({
      subject,
      cells: predicates
        .filter((predicate) => cellMap.has(predicate))
        .map((predicate) => ({
          predicate,
          values: cellMap.get(predicate) ?? [],
        })),
    }))

  return { prefixes, predicates, rows, warnings }
}

function parseStatement(statement: string, warnings: string[], baseIri?: string): Triple[] {
  if (PREFIX_PATTERN.test(statement) || DEFAULT_PREFIX_PATTERN.test(statement) || SPARQL_PREFIX_PATTERN.test(statement) || BASE_PATTERN.test(statement)) return []
  if (UNSUPPORTED_DIRECTIVE_PATTERN.test(statement)) {
    warnings.push(`Unsupported Turtle directive in readonly preview: ${statement.slice(0, 80)}`)
    return []
  }

  const tokens = tokenize(statement)
  const triples: Triple[] = []
  const subjectToken = tokens.shift()
  if (!subjectToken) return triples

  const subject = normalizeTerm(subjectToken, baseIri)
  let predicate = ''

  while (tokens.length > 0) {
    const token = tokens.shift()
    if (!token || token === '.') break
    if (token === ';') {
      predicate = ''
      continue
    }
    if (token === ',') continue

    if (!predicate) {
      predicate = normalizeTerm(token, baseIri)
      continue
    }

    triples.push({
      subject,
      predicate,
      object: normalizeTerm(token, baseIri),
    })
  }

  return triples
}

export function projectTurtleTable(
  source: string | null | undefined,
): StructuredTableProjection {
  const prefixes: Record<string, string> = {}
  const warnings: string[] = []
  const triples: Triple[] = []
  let baseIri: string | undefined

  for (const statement of splitStatements(source ?? '')) {
    const normalizedStatement = statement.trim()
    const prefixMatch = statement.match(PREFIX_PATTERN)
    if (prefixMatch) {
      prefixes[prefixMatch[1]] = prefixMatch[2]
      continue
    }
    const defaultPrefixMatch = statement.match(DEFAULT_PREFIX_PATTERN)
    if (defaultPrefixMatch) {
      prefixes[''] = defaultPrefixMatch[1]
      continue
    }
    const sparqlPrefixMatch = statement.match(SPARQL_PREFIX_PATTERN)
    if (sparqlPrefixMatch) {
      prefixes[sparqlPrefixMatch[1]] = sparqlPrefixMatch[2]
      continue
    }
    const baseMatch = statement.match(BASE_PATTERN)
    if (baseMatch) {
      baseIri = baseMatch[1]
      continue
    }
    if (!normalizedStatement.endsWith('.')) {
      warnings.push(`Skipped incomplete Turtle statement: ${normalizedStatement.slice(0, 80)}`)
      continue
    }

    triples.push(...parseStatement(normalizedStatement, warnings, baseIri))
  }

  return buildStructuredProjection(prefixes, triples, warnings)
}

function isJsonLdResource(uri: string, mimeType?: string | null): boolean {
  const normalizedMimeType = mimeType?.split(';')[0]?.trim().toLowerCase() ?? ''
  if (normalizedMimeType === 'application/ld+json') return true

  try {
    return new URL(uri).pathname.toLowerCase().endsWith('.jsonld')
  } catch {
    return uri.toLowerCase().endsWith('.jsonld')
  }
}

function isRdfXmlResource(uri: string, mimeType?: string | null): boolean {
  const normalizedMimeType = mimeType?.split(';')[0]?.trim().toLowerCase() ?? ''
  if (normalizedMimeType === 'application/rdf+xml') return true

  try {
    return new URL(uri).pathname.toLowerCase().endsWith('.rdf')
  } catch {
    return uri.toLowerCase().endsWith('.rdf')
  }
}

function collectJsonLdPrefixes(context: unknown): Record<string, string> {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return {}

  return Object.entries(context).reduce<Record<string, string>>((prefixes, [key, value]) => {
    if (typeof value === 'string') {
      prefixes[key] = value
    }
    return prefixes
  }, {})
}

function jsonLdValueToObjects(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(jsonLdValueToObjects)
  if (typeof value === 'string') return [JSON.stringify(value)]
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)]
  if (!value || typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  if (typeof record['@id'] === 'string') return [record['@id']]
  if ('@value' in record) return jsonLdValueToObjects(record['@value'])
  return [JSON.stringify(record)]
}

function jsonLdTypeValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  return typeof value === 'string' ? [value] : []
}

export function projectJsonLdTable(source: string | null | undefined): StructuredTableProjection {
  const warnings: string[] = []
  let document: unknown

  try {
    document = JSON.parse(source ?? '')
  } catch (error) {
    return {
      prefixes: {},
      predicates: [],
      rows: [],
      warnings: [`JSON-LD preview parse failed: ${error instanceof Error ? error.message : String(error)}`],
    }
  }

  const nodes: unknown[] = Array.isArray(document)
    ? document
    : document && typeof document === 'object' && Array.isArray((document as Record<string, unknown>)['@graph'])
      ? (document as Record<string, unknown>)['@graph'] as unknown[]
      : [document]

  const prefixes = collectJsonLdPrefixes(
    document && typeof document === 'object' && !Array.isArray(document)
      ? (document as Record<string, unknown>)['@context']
      : undefined,
  )
  const triples: Triple[] = []

  nodes.forEach((node, index) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      warnings.push(`Skipped unsupported JSON-LD node at index ${index}.`)
      return
    }

    const record = node as Record<string, unknown>
    const subject = typeof record['@id'] === 'string' ? record['@id'] : `_:jsonld${index + 1}`

    for (const typeValue of jsonLdTypeValues(record['@type'])) {
      triples.push({ subject, predicate: 'rdf:type', object: typeValue })
    }

    for (const [predicate, value] of Object.entries(record)) {
      if (predicate.startsWith('@')) continue
      for (const object of jsonLdValueToObjects(value)) {
        triples.push({ subject, predicate, object })
      }
    }
  })

  const predicateSet = new Set<string>()
  const rowsBySubject = new Map<string, Map<string, string[]>>()

  for (const triple of triples) {
    predicateSet.add(triple.predicate)
    const row = rowsBySubject.get(triple.subject) ?? new Map<string, string[]>()
    const values = row.get(triple.predicate) ?? []
    values.push(triple.object)
    row.set(triple.predicate, values)
    rowsBySubject.set(triple.subject, row)
  }

  const predicates = Array.from(predicateSet).sort((left, right) => {
    if (left === 'rdf:type') return -1
    if (right === 'rdf:type') return 1
    return left.localeCompare(right)
  })
  const rows = Array.from(rowsBySubject.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([subject, cellMap]) => ({
      subject,
      cells: predicates
        .filter((predicate) => cellMap.has(predicate))
        .map((predicate) => ({
          predicate,
          values: cellMap.get(predicate) ?? [],
        })),
    }))

  return { prefixes, predicates, rows, warnings }
}

function collectXmlNamespaces(source: string | null | undefined): Record<string, string> {
  const namespaces: Record<string, string> = {}
  const namespacePattern = /\sxmlns:([A-Za-z][\w.-]*)="([^"]+)"/g
  let match: RegExpExecArray | null

  while ((match = namespacePattern.exec(source ?? ''))) {
    namespaces[match[1]] = match[2]
  }

  return namespaces
}

function compactXmlTerm(namespaceUri: string | null | undefined, local: string, prefixes: Record<string, string>): string {
  if (namespaceUri === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#' && local === 'type') return 'rdf:type'
  const prefix = Object.entries(prefixes).find(([, uri]) => uri === namespaceUri)?.[0]
  return prefix ? `${prefix}:${local}` : local
}

function compactXmlResource(value: string, prefixes: Record<string, string>): string {
  for (const [prefix, namespaceUri] of Object.entries(prefixes)) {
    if (value.startsWith(namespaceUri)) return `${prefix}:${value.slice(namespaceUri.length)}`
  }
  return value
}

function appendTriplesToProjection(prefixes: Record<string, string>, triples: Triple[], warnings: string[]): StructuredTableProjection {
  const predicateSet = new Set<string>()
  const rowsBySubject = new Map<string, Map<string, string[]>>()

  for (const triple of triples) {
    predicateSet.add(triple.predicate)
    const row = rowsBySubject.get(triple.subject) ?? new Map<string, string[]>()
    const values = row.get(triple.predicate) ?? []
    values.push(triple.object)
    row.set(triple.predicate, values)
    rowsBySubject.set(triple.subject, row)
  }

  const predicates = Array.from(predicateSet).sort((left, right) => {
    if (left === 'rdf:type') return -1
    if (right === 'rdf:type') return 1
    return left.localeCompare(right)
  })

  const rows = Array.from(rowsBySubject.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([subject, cellMap]) => ({
      subject,
      cells: predicates
        .filter((predicate) => cellMap.has(predicate))
        .map((predicate) => ({
          predicate,
          values: cellMap.get(predicate) ?? [],
        })),
    }))

  return { prefixes, predicates, rows, warnings }
}

export function projectRdfXmlTable(source: string | null | undefined): StructuredTableProjection {
  const warnings: string[] = []
  const prefixes = collectXmlNamespaces(source)

  if (typeof DOMParser === 'undefined') {
    return {
      prefixes,
      predicates: [],
      rows: [],
      warnings: ['RDF/XML preview requires browser XML support.'],
    }
  }

  const document = new DOMParser().parseFromString(source ?? '', 'application/xml')
  const parseError = document.getElementsByTagName('parsererror')[0]
  if (parseError) {
    return {
      prefixes,
      predicates: [],
      rows: [],
      warnings: [`RDF/XML preview parse failed: ${parseError.textContent?.trim() || 'invalid XML'}`],
    }
  }

  const triples: Triple[] = []
  for (const description of Array.from(document.getElementsByTagNameNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'Description'))) {
    const subject = description.getAttributeNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'about')
      ?? description.getAttributeNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'ID')
      ?? ''
    if (!subject) {
      warnings.push('Skipped RDF/XML description without rdf:about.')
      continue
    }

    for (const child of Array.from(description.children)) {
      const predicate = compactXmlTerm(child.namespaceURI, child.localName, prefixes)
      const resourceObject = child.getAttributeNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'resource')
      const object = resourceObject
        ? compactXmlResource(resourceObject, prefixes)
        : JSON.stringify(child.textContent?.trim() ?? '')
      triples.push({ subject, predicate, object })
    }
  }

  return appendTriplesToProjection(prefixes, triples, warnings)
}

export function projectStructuredResourceTable(options: StructuredResourceProjectionOptions): StructuredTableProjection {
  if (isJsonLdResource(options.uri, options.mimeType)) {
    return projectJsonLdTable(options.source)
  }
  if (isRdfXmlResource(options.uri, options.mimeType)) {
    return projectRdfXmlTable(options.source)
  }

  return projectTurtleTable(options.source)
}

function valuesFor(row: StructuredTableRow, predicate: string): string[] {
  return row.cells.find((cell) => cell.predicate === predicate)?.values ?? []
}

function structuredClassOptionRank(className: string) {
  const parts = className.replace(/^<|>$/g, '').split(/[\/#:]/)
  const localName = parts[parts.length - 1] ?? className
  if (localName === 'SourceIngestManifest') return 0
  if (localName === 'SourceIndexManifest' || localName === 'ParserIndexManifest') return 20
  return 10
}

export function getStructuredClassOptions(projection: StructuredTableProjection): string[] {
  const classSet = new Set<string>()
  for (const row of projection.rows) {
    for (const className of valuesFor(row, 'rdf:type')) {
      classSet.add(className)
    }
  }
  return Array.from(classSet).sort((left, right) => {
    const rankDelta = structuredClassOptionRank(left) - structuredClassOptionRank(right)
    return rankDelta || left.localeCompare(right)
  })
}

export function projectStructuredClassScope(
  projection: StructuredTableProjection,
  requestedClassName?: string | null,
): StructuredClassScopedProjection {
  const classOptions = getStructuredClassOptions(projection)
  const className = requestedClassName && classOptions.includes(requestedClassName)
    ? requestedClassName
    : requestedClassName && classOptions.length === 0
      ? requestedClassName
    : classOptions[0] ?? null
  const rows = className
    ? projection.rows.filter((row) => valuesFor(row, 'rdf:type').includes(className))
    : []
  const predicateSet = new Set<string>()

  for (const row of rows) {
    for (const cell of row.cells) {
      if (cell.predicate !== 'rdf:type') {
        predicateSet.add(cell.predicate)
      }
    }
  }

  const predicates = projection.predicates.filter((predicate) => predicateSet.has(predicate))
  const scopedRows = rows.map((row) => ({
    subject: row.subject,
    cells: row.cells.filter((cell) => cell.predicate !== 'rdf:type'),
  }))

  return {
    ...projection,
    predicates,
    rows: scopedRows,
    className,
    classOptions,
  }
}

export function projectStructuredColumnVisibility<TProjection extends StructuredTableProjection>(
  projection: TProjection,
  hiddenPredicates: ReadonlySet<string>,
): TProjection {
  if (hiddenPredicates.size === 0) return projection

  const predicates = projection.predicates.filter((predicate) => !hiddenPredicates.has(predicate))
  const visiblePredicateSet = new Set(predicates)

  return {
    ...projection,
    predicates,
    rows: projection.rows.map((row) => ({
      subject: row.subject,
      cells: row.cells.filter((cell) => visiblePredicateSet.has(cell.predicate)),
    })),
  }
}

export function projectStructuredEffectiveViewProjection<TProjection extends StructuredTableProjection>(
  projection: TProjection,
  options: {
    documentUri: string
    pendingCellWriteProposals?: readonly StructuredCellWriteProposal[]
    hiddenPredicates?: ReadonlySet<string>
  },
): TProjection {
  const pendingByCell = new Map<string, StructuredCellWriteProposal>()
  for (const proposal of options.pendingCellWriteProposals ?? []) {
    if (proposal.documentUri !== options.documentUri) continue
    pendingByCell.set(`${proposal.subject}\u0000${proposal.predicate}`, proposal)
  }

  const withPendingValues = pendingByCell.size === 0
    ? projection
    : {
        ...projection,
        rows: projection.rows.map((row) => ({
          subject: row.subject,
          cells: row.cells.map((cell) => {
            const pending = pendingByCell.get(`${row.subject}\u0000${cell.predicate}`)
            return pending
              ? { predicate: cell.predicate, values: pending.nextValues }
              : cell
          }),
        })),
      } as TProjection

  return projectStructuredColumnVisibility(withPendingValues, options.hiddenPredicates ?? new Set())
}

export function renderStructuredProjectionAsRawText(projection: StructuredTableProjection): string {
  const lines = Object.entries(projection.prefixes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([prefix, iri]) => `@prefix ${prefix}: <${iri}> .`)

  if (lines.length > 0 && projection.rows.length > 0) lines.push('')

  for (const row of projection.rows) {
    const cells = row.cells.filter((cell) => cell.values.length > 0)
    if (cells.length === 0) {
      lines.push(`${row.subject} .`)
      continue
    }

    const [firstCell, ...remainingCells] = cells
    if (!firstCell) continue
    const firstValues = firstCell.values.join(', ')
    if (remainingCells.length === 0) {
      lines.push(`${row.subject} ${firstCell.predicate} ${firstValues} .`)
      continue
    }

    lines.push(`${row.subject} ${firstCell.predicate} ${firstValues} ;`)
    for (const [index, cell] of remainingCells.entries()) {
      const suffix = index === remainingCells.length - 1 ? ' .' : ' ;'
      lines.push(`  ${cell.predicate} ${cell.values.join(', ')}${suffix}`)
    }
  }

  return lines.join('\n')
}

export function projectStructuredVocabSchemaColumns<TProjection extends StructuredTableProjection>(
  projection: TProjection,
  vocabDefinitionIndex: StructuredVocabDefinitionIndex,
  classScope: string | null,
): TProjection {
  const predicates = [...projection.predicates]
  const seenKeys = new Set<string>()
  const seenRuleUris = new Set<string>()

  const markPredicate = (predicate: string) => {
    for (const key of termLookupKeys(predicate)) {
      seenKeys.add(key)
    }
  }

  const hasPredicateAlias = (predicate: string) => termLookupKeys(predicate).some((key) => seenKeys.has(key))

  const appendPredicate = (predicate: string, rules: readonly StructuredVocabShapeRuleDefinition[]) => {
    const activeRules = rules.filter((rule) => (
      rule.status !== 'deprecated'
      && !seenRuleUris.has(rule.uri)
      && matchesShapeClassScope(rule, classScope)
    ))
    if (activeRules.length === 0) return
    for (const rule of activeRules) {
      seenRuleUris.add(rule.uri)
    }
    if (hasPredicateAlias(predicate)) return
    predicates.push(predicate)
    markPredicate(predicate)
  }

  for (const predicate of predicates) {
    markPredicate(predicate)
    for (const rule of lookupPredicateDefinition(vocabDefinitionIndex, predicate)?.shapeRules ?? []) {
      seenRuleUris.add(rule.uri)
    }
  }

  const seenDefinitionUris = new Set<string>()
  for (const definition of vocabDefinitionIndex.predicates.values()) {
    if (seenDefinitionUris.has(definition.uri)) continue
    seenDefinitionUris.add(definition.uri)
    appendPredicate(definition.predicateUri || definition.uri, definition.shapeRules)
  }

  for (const [predicate, rules] of vocabDefinitionIndex.shapesByTerm.entries()) {
    appendPredicate(predicate, rules)
  }

  return {
    ...projection,
    predicates,
  }
}

function searchableText(row: StructuredTableRow): string {
  return [
    row.subject,
    ...row.cells.flatMap((cell) => [cell.predicate, ...cell.values]),
  ].join(' ').toLowerCase()
}

function sortValue(row: StructuredTableRow, sortKey: string): string {
  if (sortKey === 'subject') return row.subject
  return valuesFor(row, sortKey).join(' ')
}

export function projectStructuredTableView<TProjection extends StructuredTableProjection>(
  projection: TProjection,
  options: StructuredTableViewOptions,
): TProjection {
  const searchText = options.searchText?.trim().toLowerCase() ?? ''
  const sortKey = options.sortKey
  const sortDirection = options.sortDirection ?? 'asc'
  let rows = projection.rows

  if (searchText) {
    rows = rows.filter((row) => searchableText(row).includes(searchText))
  }

  if (sortKey) {
    rows = [...rows].sort((left, right) => {
      const cmp = sortValue(left, sortKey).localeCompare(sortValue(right, sortKey), 'zh-CN', {
        numeric: true,
        sensitivity: 'base',
      })
      return sortDirection === 'desc' ? -cmp : cmp
    })
  }

  return {
    ...projection,
    rows,
  }
}

const VOCAB_FIELD_ALIASES = {
  label: [
    'rdfs:label',
    'http://www.w3.org/2000/01/rdf-schema#label',
    'skos:prefLabel',
    'http://www.w3.org/2004/02/skos/core#prefLabel',
    'schema:name',
    'https://schema.org/name',
    'udfs:label',
    'https://undefineds.co/vocab/label',
  ],
  definition: [
    'skos:definition',
    'http://www.w3.org/2004/02/skos/core#definition',
    'rdfs:comment',
    'http://www.w3.org/2000/01/rdf-schema#comment',
    'schema:description',
    'https://schema.org/description',
    'udfs:definition',
    'https://undefineds.co/vocab/definition',
    'udfs:description',
    'https://undefineds.co/vocab/description',
  ],
  kind: ['rdf:type', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'],
  range: [
    'udfs:range',
    'https://undefineds.co/vocab/range',
    'udfs:valueType',
    'https://undefineds.co/vocab/valueType',
    'rdfs:range',
    'http://www.w3.org/2000/01/rdf-schema#range',
    'sh:datatype',
    'http://www.w3.org/ns/shacl#datatype',
    'sh:class',
    'http://www.w3.org/ns/shacl#class',
  ],
  status: [
    'udfs:status',
    'https://undefineds.co/vocab/status',
    'schema:status',
    'https://schema.org/status',
  ],
  deprecated: [
    'owl:deprecated',
    'http://www.w3.org/2002/07/owl#deprecated',
    'udfs:deprecated',
    'https://undefineds.co/vocab/deprecated',
  ],
  shape: [
    'udfs:shape',
    'https://undefineds.co/vocab/shape',
    'dcterms:conformsTo',
    'http://purl.org/dc/terms/conformsTo',
    'sh:property',
    'http://www.w3.org/ns/shacl#property',
    'sh:node',
    'http://www.w3.org/ns/shacl#node',
  ],
  predicate: [
    'udfs:predicate',
    'https://undefineds.co/vocab/predicate',
  ],
  term: [
    'udfs:term',
    'https://undefineds.co/vocab/term',
    'sh:path',
    'http://www.w3.org/ns/shacl#path',
    'sh:targetClass',
    'http://www.w3.org/ns/shacl#targetClass',
  ],
  classScope: [
    'udfs:classScope',
    'https://undefineds.co/vocab/classScope',
    'sh:targetClass',
    'http://www.w3.org/ns/shacl#targetClass',
  ],
  constraint: [
    'udfs:constraint',
    'https://undefineds.co/vocab/constraint',
  ],
  minCount: [
    'sh:minCount',
    'http://www.w3.org/ns/shacl#minCount',
    'udfs:minCount',
    'https://undefineds.co/vocab/minCount',
  ],
  maxCount: [
    'sh:maxCount',
    'http://www.w3.org/ns/shacl#maxCount',
    'udfs:maxCount',
    'https://undefineds.co/vocab/maxCount',
  ],
  datatype: [
    'sh:datatype',
    'http://www.w3.org/ns/shacl#datatype',
    'udfs:datatype',
    'https://undefineds.co/vocab/datatype',
  ],
  pattern: [
    'sh:pattern',
    'http://www.w3.org/ns/shacl#pattern',
    'udfs:pattern',
    'https://undefineds.co/vocab/pattern',
  ],
  prefix: [
    'sh:prefix',
    'http://www.w3.org/ns/shacl#prefix',
    'udfs:prefix',
    'https://undefineds.co/vocab/prefix',
    'vann:preferredNamespacePrefix',
    'http://purl.org/vocab/vann/preferredNamespacePrefix',
  ],
  namespace: [
    'sh:namespace',
    'http://www.w3.org/ns/shacl#namespace',
    'udfs:namespace',
    'https://undefineds.co/vocab/namespace',
    'vann:preferredNamespaceUri',
    'http://purl.org/vocab/vann/preferredNamespaceUri',
  ],
}

const DATE_TYPE_SUFFIX_PATTERN = /(?:#|:)date$/i
const TYPED_LITERAL_PATTERN = /^"((?:[^"\\]|\\.)*)"\^\^(?:<([^>]+)>|([A-Za-z][\w.-]*:[\w.-]+))$/

function displayRegistryValue(value: string) {
  const typedLiteral = value.match(TYPED_LITERAL_PATTERN)
  if (typedLiteral && DATE_TYPE_SUFFIX_PATTERN.test(typedLiteral[2] ?? typedLiteral[3] ?? '')) {
    return typedLiteral[1].replace(/\\"/g, '"')
  }
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1).replace(/\\"/g, '"')
  return value
}

function firstRegistryValue(cells: Map<string, string[]>, aliases: string[]) {
  for (const alias of aliases) {
    const values = cells.get(alias)
    if (values?.[0]) return displayRegistryValue(values[0])
  }
  return ''
}

function normalizeRegistryValueType(value: string) {
  const displayed = displayRegistryValue(value)
  const normalized = displayed.trim().replace(/^<(.+)>$/, '$1').toLowerCase()
  if (!normalized) return ''
  if (
    normalized === 'enum'
    || normalized === 'select'
    || normalized === 'multi-select'
    || normalized === 'multiselect'
  ) return displayed
  if (
    normalized === 'relation'
    || normalized === 'resource'
    || normalized === 'iri'
    || normalized === 'uri'
    || normalized === 'url'
    || normalized === 'anyuri'
    || normalized.endsWith('#anyuri')
    || normalized.endsWith(':anyuri')
  ) return 'relation'
  if (normalized === 'date' || normalized.endsWith('#date') || normalized.endsWith(':date')) return 'date'
  if (
    normalized === 'boolean'
    || normalized.endsWith('#boolean')
    || normalized.endsWith(':boolean')
  ) return 'boolean'
  if (
    normalized === 'number'
    || normalized === 'integer'
    || normalized === 'decimal'
    || normalized === 'float'
    || normalized === 'double'
    || normalized.endsWith('#integer')
    || normalized.endsWith('#decimal')
    || normalized.endsWith('#float')
    || normalized.endsWith('#double')
    || normalized.endsWith(':integer')
    || normalized.endsWith(':decimal')
    || normalized.endsWith(':float')
    || normalized.endsWith(':double')
  ) return 'number'
  if (
    normalized === 'text'
    || normalized === 'string'
    || normalized === 'langstring'
    || normalized === 'xmlliteral'
    || normalized === 'html'
    || normalized.endsWith('#string')
    || normalized.endsWith('#langstring')
    || normalized.endsWith('#xmlliteral')
    || normalized.endsWith('#html')
    || normalized.endsWith(':string')
    || normalized.endsWith(':langstring')
    || normalized.endsWith(':xmlliteral')
    || normalized.endsWith(':html')
  ) return 'text'
  if (
    normalized.startsWith('http://')
    || normalized.startsWith('https://')
    || /^[a-z][\w.-]*:[\w.-]+$/i.test(displayed.trim())
  ) return 'relation'
  return displayed
}

function firstRegistryRangeValue(cells: Map<string, string[]>) {
  for (const alias of VOCAB_FIELD_ALIASES.range) {
    const values = cells.get(alias)
    if (!values?.[0]) continue
    return displayRegistryValue(values[0])
  }
  return ''
}

function inferLockedVocabRegistryKind(uri?: string | null): LockedVocabRegistryKind {
  if (uri?.endsWith('/.vocab/shapes.ttl')) return 'shapes'
  if (uri?.endsWith('/.vocab/namespaces.ttl')) return 'namespaces'
  return 'terms'
}

export function projectLockedVocabRegistryRows(source: string | null | undefined, registryKind?: LockedVocabRegistryKind): LockedVocabRegistryRow[]
export function projectLockedVocabRegistryRows(options: StructuredResourceProjectionOptions & { registryKind?: LockedVocabRegistryKind }): LockedVocabRegistryRow[]
export function projectLockedVocabRegistryRows(
  input: string | null | undefined | (StructuredResourceProjectionOptions & { registryKind?: LockedVocabRegistryKind }),
  registryKind?: LockedVocabRegistryKind,
): LockedVocabRegistryRow[] {
  const projection = typeof input === 'object' && input !== null
    ? projectStructuredResourceTable(input)
    : projectTurtleTable(input)
  const resolvedRegistryKind = typeof input === 'object' && input !== null
    ? input.registryKind ?? inferLockedVocabRegistryKind(input.uri)
    : registryKind ?? 'terms'

  return projection.rows.map((row) => {
    const cells = new Map(row.cells.map((cell) => [cell.predicate, cell.values]))
    const deprecated = firstRegistryValue(cells, VOCAB_FIELD_ALIASES.deprecated).toLowerCase()
    const explicitStatus = firstRegistryValue(cells, VOCAB_FIELD_ALIASES.status)
    const minCount = firstRegistryValue(cells, VOCAB_FIELD_ALIASES.minCount)
    const maxCount = firstRegistryValue(cells, VOCAB_FIELD_ALIASES.maxCount)
    const datatype = firstRegistryValue(cells, VOCAB_FIELD_ALIASES.datatype)
    const pattern = firstRegistryValue(cells, VOCAB_FIELD_ALIASES.pattern)
    return {
      registryKind: resolvedRegistryKind,
      uri: row.subject,
      label: firstRegistryValue(cells, VOCAB_FIELD_ALIASES.label) || localName(row.subject),
      definition: firstRegistryValue(cells, VOCAB_FIELD_ALIASES.definition),
      kind: firstRegistryValue(cells, VOCAB_FIELD_ALIASES.kind),
      range: firstRegistryRangeValue(cells),
      status: explicitStatus || (deprecated === 'true' ? 'deprecated' : 'active'),
      shape: firstRegistryValue(cells, VOCAB_FIELD_ALIASES.shape),
      predicate: firstRegistryValue(cells, VOCAB_FIELD_ALIASES.predicate),
      term: firstRegistryValue(cells, VOCAB_FIELD_ALIASES.term),
      classScope: firstRegistryValue(cells, VOCAB_FIELD_ALIASES.classScope),
      constraint: firstRegistryValue(cells, VOCAB_FIELD_ALIASES.constraint),
      ...(minCount ? { minCount } : {}),
      ...(maxCount ? { maxCount } : {}),
      ...(datatype ? { datatype } : {}),
      ...(pattern ? { pattern } : {}),
      prefix: firstRegistryValue(cells, VOCAB_FIELD_ALIASES.prefix),
      namespace: firstRegistryValue(cells, VOCAB_FIELD_ALIASES.namespace),
    }
  })
}

function isVocabKind(row: LockedVocabRegistryRow, kind: 'class' | 'predicate' | 'enum-option') {
  const normalized = [row.kind, row.status, row.uri]
    .join(' ')
    .toLowerCase()
  switch (kind) {
    case 'class':
      return normalized.includes('classterm') || normalized.includes('class term') || /\bclass\b/.test(normalized)
    case 'predicate':
      return normalized.includes('predicateterm') || normalized.includes('predicate term') || /\bpredicate\b/.test(normalized)
    case 'enum-option':
      return normalized.includes('enumoptionterm') || normalized.includes('enum-option') || normalized.includes('enum option')
  }
}

function setTermAliases<T>(map: Map<string, T>, uri: string, value: T, namespaces?: ReadonlyMap<string, string>) {
  for (const key of termLookupKeys(uri, namespaces)) {
    map.set(key, value)
  }
}

function shapeRuleFromRegistryRow(row: LockedVocabRegistryRow): StructuredVocabShapeRuleDefinition {
  const minCount = parseRegistryCountValue(row.minCount)
  const maxCount = parseRegistryCountValue(row.maxCount)
  return {
    uri: row.uri,
    label: row.label,
    classScope: row.classScope,
    constraint: row.constraint,
    ...(minCount !== null ? { minCount } : {}),
    ...(maxCount !== null ? { maxCount } : {}),
    ...(row.datatype ? { datatype: row.datatype } : {}),
    ...(row.pattern ? { pattern: row.pattern } : {}),
    status: row.status || 'active',
  }
}

function shapeOnlyPredicateLabel(row: LockedVocabRegistryRow, termKey: string) {
  return row.label && row.label !== localName(row.uri) ? row.label : localName(termKey)
}

function termDefinitionFromRegistryRow(row: LockedVocabRegistryRow): StructuredVocabTermDefinition {
  return {
    uri: row.uri,
    label: row.label,
    description: row.definition,
    status: row.status || 'active',
  }
}

function isEnumRegistryValueType(valueType: string) {
  const normalized = normalizeRegistryValueType(valueType).trim().toLowerCase()
  return normalized === 'enum' || normalized === 'select' || normalized === 'multi-select' || normalized === 'multiselect'
}

function parsePredicateShapeEnumOptions(shape: string) {
  return shape
    .split(/\s+·\s+|\s*;\s*/)
    .map((part) => part.trim().match(/^option\s+(.+)$/i)?.[1]?.trim() ?? '')
    .map((value) => value.replace(/^"((?:[^"\\]|\\.)*)"$/, '$1').replace(/\\"/g, '"'))
    .filter(Boolean)
}

function optionUriForPredicateShape(predicateUri: string, label: string) {
  return `${predicateUri}#${safeVocabFragment(label) || localName(label)}`
}

function appendEnumOptionsByPredicate(
  enumOptionsByPredicate: Map<string, StructuredVocabTermDefinition[]>,
  predicate: string,
  options: StructuredVocabTermDefinition[],
  namespaces?: ReadonlyMap<string, string>,
) {
  if (!predicate || options.length === 0) return
  for (const key of termLookupKeys(predicate, namespaces)) {
    const existing = enumOptionsByPredicate.get(key) ?? []
    const existingUris = new Set(existing.map((option) => option.uri))
    enumOptionsByPredicate.set(key, [
      ...existing,
      ...options.filter((option) => !existingUris.has(option.uri)),
    ])
  }
}

export function buildStructuredVocabDefinitionIndex({
  terms,
  shapes = [],
  namespaces = [],
}: {
  terms: readonly LockedVocabRegistryRow[]
  shapes?: readonly LockedVocabRegistryRow[]
  namespaces?: readonly LockedVocabRegistryRow[]
}): StructuredVocabDefinitionIndex {
  const classes = new Map<string, StructuredVocabTermDefinition>()
  const predicates = new Map<string, StructuredVocabPredicateDefinition>()
  const enumOptionsByPredicate = new Map<string, StructuredVocabTermDefinition[]>()
  const shapesByTerm = new Map<string, StructuredVocabShapeRuleDefinition[]>()
  const shapeOnlyPredicates = new Map<string, StructuredVocabPredicateDefinition>()
  const namespaceByPrefix = new Map<string, string>()

  for (const row of namespaces) {
    const prefix = (row.prefix || row.label).trim()
    const namespace = row.namespace.trim()
    if (prefix && namespace) namespaceByPrefix.set(prefix, namespace)
  }

  for (const row of shapes) {
    const termKey = canonicalPredicateKey(row.term)
    if (!termKey) continue
    const rule = shapeRuleFromRegistryRow(row)
    for (const key of termLookupKeys(termKey, namespaceByPrefix)) {
      shapesByTerm.set(key, [...(shapesByTerm.get(key) ?? []), rule])
    }
    const definition = shapeOnlyPredicates.get(termKey) ?? {
      uri: termKey,
      label: shapeOnlyPredicateLabel(row, termKey),
      description: row.definition,
      status: row.status || 'active',
      valueType: normalizeRegistryValueType(row.range || row.datatype || ''),
      shape: row.shape || row.constraint,
      shapeRules: [],
    }
    definition.shapeRules = [...definition.shapeRules, rule]
    if (!definition.valueType && (row.range || row.datatype)) definition.valueType = normalizeRegistryValueType(row.range || row.datatype || '')
    if (!definition.description && row.definition) definition.description = row.definition
    if (!definition.shape && (row.shape || row.constraint)) definition.shape = row.shape || row.constraint
    shapeOnlyPredicates.set(termKey, definition)
  }

  for (const definition of shapeOnlyPredicates.values()) {
    setTermAliases(predicates, definition.uri, definition, namespaceByPrefix)
  }

  for (const row of terms) {
    if (isVocabKind(row, 'class')) {
      setTermAliases(classes, row.uri, termDefinitionFromRegistryRow(row), namespaceByPrefix)
      continue
    }
    if (isVocabKind(row, 'predicate')) {
      const shapeRules = shapesByTerm.get(canonicalPredicateKey(row.uri)) ?? shapesByTerm.get(localName(row.uri)) ?? []
      const valueType = normalizeRegistryValueType(row.range)
      const definition = {
        ...termDefinitionFromRegistryRow(row),
        valueType,
        shape: row.shape,
        ...(row.predicate ? { predicateUri: row.predicate } : {}),
        shapeRules,
      }
      setTermAliases(predicates, row.uri, definition, namespaceByPrefix)
      if (row.predicate) {
        setTermAliases(predicates, row.predicate, definition, namespaceByPrefix)
      }
      const embeddedOptions = isEnumRegistryValueType(valueType)
        ? parsePredicateShapeEnumOptions(row.shape).map((label) => ({
          uri: optionUriForPredicateShape(row.uri, label),
          label,
          description: `Option for ${row.label || localName(row.uri)}.`,
          status: 'active',
        }))
        : []
      appendEnumOptionsByPredicate(enumOptionsByPredicate, row.uri, embeddedOptions, namespaceByPrefix)
      if (row.predicate) {
        appendEnumOptionsByPredicate(enumOptionsByPredicate, row.predicate, embeddedOptions, namespaceByPrefix)
      }
      continue
    }
    if (isVocabKind(row, 'enum-option')) {
      const predicateKey = canonicalPredicateKey(row.predicate || row.shape)
      if (!predicateKey) continue
      const option = termDefinitionFromRegistryRow(row)
      appendEnumOptionsByPredicate(enumOptionsByPredicate, predicateKey, [option], namespaceByPrefix)
    }
  }

  return {
    classes,
    predicates,
    enumOptionsByPredicate,
    shapesByTerm,
    namespaces: namespaceByPrefix,
  }
}

function parseRegistryCountValue(value: string | undefined) {
  if (!value) return null
  const count = Number(unquoteRdfLiteral(value))
  return Number.isInteger(count) && count >= 0 ? count : null
}

function parseTypedLiteral(value: string) {
  const match = value.match(TYPED_LITERAL_PATTERN)
  if (!match) return null
  return {
    lexical: match[1].replace(/\\"/g, '"'),
    datatype: match[2] ?? match[3] ?? '',
  }
}

function unquoteRdfLiteral(value: string) {
  const typedLiteral = parseTypedLiteral(value)
  if (typedLiteral) return typedLiteral.lexical
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"')
  }
  return value
}

function matchesShapeClassScope(rule: StructuredVocabShapeRuleDefinition, classScope: string | null) {
  if (!rule.classScope) return true
  if (!classScope) return false
  return termLookupKeys(rule.classScope).some((key) => termLookupKeys(classScope).includes(key))
}

function lookupPredicateDefinition(
  vocabDefinitionIndex: StructuredVocabDefinitionIndex,
  predicate: string,
) {
  return vocabDefinitionIndex.predicates.get(predicate)
    ?? vocabDefinitionIndex.predicates.get(canonicalPredicateKey(predicate))
    ?? vocabDefinitionIndex.predicates.get(localName(predicate))
}
