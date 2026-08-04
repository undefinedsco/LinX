import {
  normalizeStructuredCellResourceValue,
  unquoteStructuredCellLiteral,
} from './structured-cell-editor-plan'
import { localPredicateLabel } from './structured-table-vocab'
import type { StructuredTableProjection } from './structured-table'
import {
  resolveStructuredSubjectContainingResourceUri,
  resolveStructuredSubjectExternalUri,
  resolveStructuredSubjectResourceUri,
} from '../resource/structured-subject-uri'

export type StructuredSubjectPeekKind = 'resource' | 'term' | 'external'

export type StructuredSubjectOpenTarget = {
  targetUri: string
  kind: StructuredSubjectPeekKind
  canNavigateDirectly: boolean
}

export type StructuredSubjectPeek = {
  subject: string
  targetUri: string
  kind: StructuredSubjectPeekKind
  rowIndex: number | null
  scrollTop: number
  title: string
  className: string
  summary: string
  source: string
  sourceLinkedCard?: {
    bodyResourceUri: string
    ingestManifestUri: string
    ingestVersion: string
    sourceHash: string
  } | null
  facts: { predicate: string; values: string[] }[]
  predicates: { predicate: string; values: string[] }[]
  backlinks: { subject: string; predicate: string; values: string[] }[]
} | null

const TYPED_LITERAL_PATTERN = /^"((?:[^"\\]|\\.)*)"\^\^(?:<([^>]+)>|([A-Za-z][\w.-]*:[\w.-]+))$/

const STRUCTURED_TITLE_PREDICATES = [
  'dcterms:title',
  'title',
  'rdfs:label',
  'schema:name',
  'label',
  'name',
]
const STRUCTURED_SUMMARY_PREDICATES = [
  'summary',
  'description',
  'about',
  'rdfs:comment',
  'schema:description',
  'dcterms:description',
]
const STRUCTURED_SOURCE_PREDICATES = [
  'dcterms:source',
  'http://purl.org/dc/terms/source',
  'source',
  'schema:url',
  'schema:sameAs',
  'foaf:page',
]
const STRUCTURED_BODY_RESOURCE_PREDICATES = [
  'udfs:bodyResource',
  'https://undefineds.co/vocab/bodyResource',
  'bodyResource',
]
const STRUCTURED_INGEST_MANIFEST_PREDICATES = [
  'udfs:ingestManifest',
  'https://undefineds.co/vocab/ingestManifest',
  'ingestManifest',
  'udfs:parserManifest',
  'https://undefineds.co/vocab/parserManifest',
  'parserManifest',
]
const STRUCTURED_INGEST_VERSION_PREDICATES = [
  'udfs:ingestVersion',
  'https://undefineds.co/vocab/ingestVersion',
  'ingestVersion',
  'udfs:parserVersion',
  'https://undefineds.co/vocab/parserVersion',
  'parserVersion',
]
const STRUCTURED_SOURCE_HASH_PREDICATES = [
  'udfs:sourceHash',
  'https://undefineds.co/vocab/sourceHash',
  'sourceHash',
]
const STRUCTURED_CARD_HEADER_PREDICATES = new Set([
  ...STRUCTURED_TITLE_PREDICATES,
  ...STRUCTURED_SUMMARY_PREDICATES,
  ...STRUCTURED_SOURCE_PREDICATES,
  ...STRUCTURED_BODY_RESOURCE_PREDICATES,
  ...STRUCTURED_INGEST_MANIFEST_PREDICATES,
  ...STRUCTURED_INGEST_VERSION_PREDICATES,
  ...STRUCTURED_SOURCE_HASH_PREDICATES,
])

export function displayStructuredFactValue(value: string) {
  const match = value.match(TYPED_LITERAL_PATTERN)
  if (match) return match[1].replace(/\\"/g, '"')
  return unquoteStructuredCellLiteral(value)
}

function firstCellValue(row: StructuredTableProjection['rows'][number] | undefined, predicates: string[]) {
  if (!row) return ''
  for (const predicate of predicates) {
    const value = row.cells.find((cell) => cell.predicate === predicate)?.values[0]
    if (value) return displayStructuredFactValue(value)
  }
  return ''
}

function firstResourceCellValue(row: StructuredTableProjection['rows'][number] | undefined, predicates: string[]) {
  if (!row) return ''
  for (const predicate of predicates) {
    const value = row.cells.find((cell) => cell.predicate === predicate)?.values[0]
    if (value) return normalizeStructuredCellResourceValue(displayStructuredFactValue(value))
  }
  return ''
}

function structuredResourceIdentity(value: string) {
  return normalizeStructuredCellResourceValue(displayStructuredFactValue(value)).trim()
}

function structuredProjectionRowIsSourceLinkedCard(row: StructuredTableProjection['rows'][number]) {
  const typeValues = row.cells.find((cell) => cell.predicate === 'rdf:type')?.values ?? []
  return row.subject.includes('.card.ttl')
    || typeValues.some((value) => localPredicateLabel(normalizeStructuredCellResourceValue(value)) === 'SourceLinkedCard')
}

function resolveStructuredSourceLinkedCardResourceUri(documentUri: string, subject: string) {
  return resolveStructuredSubjectResourceUri(documentUri, subject)
    ?? resolveStructuredSubjectContainingResourceUri(documentUri, subject)
}

export function resolveStructuredSourceLinkedCardOpenTarget(
  documentUri: string,
  subject: string,
  projection?: StructuredTableProjection,
): StructuredSubjectOpenTarget | null {
  if (!projection) return null
  const normalizedSubject = structuredResourceIdentity(subject)
  const directRow = projection.rows.find((row) => row.subject === subject)
  const sourceLinkedRow = directRow && structuredProjectionRowIsSourceLinkedCard(directRow)
    ? directRow
    : projection.rows.find((row) => (
      structuredProjectionRowIsSourceLinkedCard(row)
      && firstResourceCellValue(row, STRUCTURED_SOURCE_PREDICATES) === normalizedSubject
    ))
  if (!sourceLinkedRow) return null

  const targetUri = resolveStructuredSourceLinkedCardResourceUri(documentUri, sourceLinkedRow.subject)
  if (!targetUri) return null
  return {
    targetUri,
    kind: 'resource',
    canNavigateDirectly: true,
  }
}

const PREFIXED_NAME_PATTERN = /^([A-Za-z][\w-]*)?:([^\s]+)$/

export function expandStructuredPrefixedName(
  value: string,
  projection?: StructuredTableProjection,
): string {
  if (!projection) return value
  const trimmed = value.trim()
  if (trimmed.startsWith('#') || trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('/')) {
    return value
  }
  const match = trimmed.match(PREFIXED_NAME_PATTERN)
  if (!match) return value
  const base = projection.prefixes[match[1] ?? '']
  return base ? `${base}${match[2]}` : value
}

export function resolveStructuredSubjectOpenTarget(
  documentUri: string,
  subject: string,
  options: { fallbackToDocument?: boolean; projection?: StructuredTableProjection } = {},
): StructuredSubjectOpenTarget | null {
  const sourceLinkedCardTarget = resolveStructuredSourceLinkedCardOpenTarget(documentUri, subject, options.projection)
  if (sourceLinkedCardTarget) return sourceLinkedCardTarget

  const expandedSubject = expandStructuredPrefixedName(subject, options.projection)

  const externalTargetUri = resolveStructuredSubjectExternalUri(documentUri, expandedSubject)
  if (externalTargetUri) {
    return {
      targetUri: externalTargetUri,
      kind: 'external',
      canNavigateDirectly: false,
    }
  }

  const resourceTargetUri = resolveStructuredSubjectResourceUri(documentUri, expandedSubject)
  if (resourceTargetUri) {
    return {
      targetUri: resourceTargetUri,
      kind: 'resource',
      canNavigateDirectly: true,
    }
  }

  const containingTargetUri = resolveStructuredSubjectContainingResourceUri(documentUri, expandedSubject)
  if (containingTargetUri) {
    return {
      targetUri: containingTargetUri,
      kind: containingTargetUri === documentUri ? 'resource' : 'term',
      canNavigateDirectly: false,
    }
  }

  if (options.fallbackToDocument) {
    return {
      targetUri: documentUri,
      kind: 'resource',
      canNavigateDirectly: false,
    }
  }

  return null
}

export function resolveStructuredRelationOpenTarget(
  documentUri: string,
  value: string,
  projection?: StructuredTableProjection,
): StructuredSubjectOpenTarget | null {
  const normalizedValue = expandStructuredPrefixedName(
    normalizeStructuredCellResourceValue(value).trim(),
    projection,
  )

  const externalTargetUri = resolveStructuredSubjectExternalUri(documentUri, normalizedValue)
  if (externalTargetUri) {
    return {
      targetUri: externalTargetUri,
      kind: 'external',
      canNavigateDirectly: false,
    }
  }

  const resourceTargetUri = resolveStructuredSubjectResourceUri(documentUri, normalizedValue)
  if (resourceTargetUri) {
    return {
      targetUri: resourceTargetUri,
      kind: 'resource',
      canNavigateDirectly: true,
    }
  }

  const containingTargetUri = resolveStructuredSubjectContainingResourceUri(documentUri, normalizedValue)
  if (containingTargetUri) {
    return {
      targetUri: containingTargetUri,
      kind: containingTargetUri === documentUri ? 'resource' : 'term',
      canNavigateDirectly: false,
    }
  }

  return null
}

export function deriveStructuredSubjectPeekFacts({
  projection,
  visibleProjection,
  subject,
}: {
  projection: StructuredTableProjection
  visibleProjection: StructuredTableProjection
  subject: string
}) {
  const sourceRow = projection.rows.find((row) => row.subject === subject)
  const visibleRow = visibleProjection.rows.find((row) => row.subject === subject)
  const title = firstCellValue(visibleRow ?? sourceRow, STRUCTURED_TITLE_PREDICATES)
  const summary = firstCellValue(visibleRow ?? sourceRow, STRUCTURED_SUMMARY_PREDICATES)
  const source = firstCellValue(visibleRow ?? sourceRow, STRUCTURED_SOURCE_PREDICATES)
  const className = firstCellValue(sourceRow, ['rdf:type'])
  const typeValues = sourceRow?.cells.find((cell) => cell.predicate === 'rdf:type')?.values ?? []
  const isSourceLinkedCard = subject.includes('.card.ttl') || typeValues.some((value) => localPredicateLabel(normalizeStructuredCellResourceValue(value)) === 'SourceLinkedCard')
  const sourceLinkedCard = isSourceLinkedCard
    ? {
        bodyResourceUri: firstResourceCellValue(sourceRow, STRUCTURED_BODY_RESOURCE_PREDICATES),
        ingestManifestUri: firstResourceCellValue(sourceRow, STRUCTURED_INGEST_MANIFEST_PREDICATES),
        ingestVersion: firstCellValue(sourceRow, STRUCTURED_INGEST_VERSION_PREDICATES),
        sourceHash: firstCellValue(sourceRow, STRUCTURED_SOURCE_HASH_PREDICATES),
      }
    : null
  const rawFacts = sourceRow?.cells.filter((cell) => cell.predicate !== 'rdf:type') ?? []
  const cardFacts = rawFacts.filter((cell) => (
    cell.predicate !== 'rdf:type' && !STRUCTURED_CARD_HEADER_PREDICATES.has(cell.predicate)
  )) ?? []
  const backlinks = projection.rows
    .filter((row) => row.subject !== subject)
    .flatMap((row) => row.cells
      .filter((cell) => cell.values.some((value) => normalizeStructuredCellResourceValue(value) === subject))
      .map((cell) => ({
        subject: row.subject,
        predicate: cell.predicate,
        values: cell.values,
      })))
    .slice(0, 6)

  return {
    title: title || localPredicateLabel(subject),
    className,
    summary,
    source,
    sourceLinkedCard,
    facts: rawFacts.slice(0, 6),
    predicates: cardFacts.slice(0, 8),
    backlinks,
  }
}
