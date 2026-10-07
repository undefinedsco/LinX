import {
  type StructuredShapeValidationWarning,
  type StructuredTableProjection,
  type StructuredVocabDefinitionIndex,
  type StructuredVocabPredicateDefinition,
} from './structured-table'
import { isStructuredCellEnumDefinition } from './structured-cell-editor-plan'
import { inferStructuredPredicateKind } from './structured-table-cell-model'
import { localPredicateLabel } from './structured-table-vocab'

export type StructuredPredicateTypeFilter = 'all' | 'enum' | 'boolean' | 'number' | 'date' | 'relation' | 'text'
export type StructuredVocabTermFilter = 'all' | 'defined' | 'observed'

const EMPTY_HIDDEN_PREDICATES = new Set<string>()
const isEnumPredicateDefinition = isStructuredCellEnumDefinition

function definitionValueType(definition?: StructuredVocabPredicateDefinition) {
  return definition?.valueType.trim().toLowerCase() ?? ''
}

function isBooleanPredicateDefinition(definition?: StructuredVocabPredicateDefinition) {
  const valueType = definitionValueType(definition)
  return valueType.includes('boolean') || valueType.includes('checkbox')
}

export function structuredPredicateNamespace(
  predicate: string,
  namespaceRegistry?: ReadonlyMap<string, string>,
) {
  if (namespaceRegistry) {
    for (const [prefix, namespace] of namespaceRegistry) {
      if (namespace && predicate.startsWith(namespace)) return prefix
    }
  }
  const colonIndex = predicate.indexOf(':')
  if (
    colonIndex > 0
    && !predicate.slice(0, colonIndex).includes('/')
    && !predicate.slice(colonIndex + 1).startsWith('//')
  ) return predicate.slice(0, colonIndex)
  try {
    const url = new URL(predicate)
    return url.hostname
  } catch {
    return 'local'
  }
}

export function structuredPredicateHasDefinition(
  predicate: string,
  vocabDefinitionIndex?: StructuredVocabDefinitionIndex,
) {
  return Boolean(
    vocabDefinitionIndex?.predicates.get(predicate)
    ?? vocabDefinitionIndex?.predicates.get(localPredicateLabel(predicate)),
  )
}

export function projectStructuredPredicateNamespaceFilter<TProjection extends StructuredTableProjection>(
  projection: TProjection,
  namespace: string | null,
  namespaceRegistry?: ReadonlyMap<string, string>,
): TProjection {
  if (!namespace) return projection
  const predicates = projection.predicates.filter((predicate) => structuredPredicateNamespace(predicate, namespaceRegistry) === namespace)
  const predicateSet = new Set(predicates)
  return {
    ...projection,
    predicates,
    rows: projection.rows.map((row) => ({
      subject: row.subject,
      cells: row.cells.filter((cell) => predicateSet.has(cell.predicate)),
    })),
  }
}

export function projectStructuredVocabTermFilter<TProjection extends StructuredTableProjection>(
  projection: TProjection,
  filter: StructuredVocabTermFilter,
  vocabDefinitionIndex?: StructuredVocabDefinitionIndex,
): TProjection {
  if (filter === 'all') return projection
  const predicates = projection.predicates.filter((predicate) => {
    const hasDefinition = structuredPredicateHasDefinition(predicate, vocabDefinitionIndex)
    return filter === 'defined' ? hasDefinition : !hasDefinition
  })
  const predicateSet = new Set(predicates)
  return {
    ...projection,
    predicates,
    rows: projection.rows.map((row) => ({
      subject: row.subject,
      cells: row.cells.filter((cell) => predicateSet.has(cell.predicate)),
    })),
  }
}

function structuredPredicateValues(projection: StructuredTableProjection, predicate: string) {
  return projection.rows.flatMap((row) => row.cells.find((cell) => cell.predicate === predicate)?.values ?? [])
}

export function structuredPredicateMatchesTypeFilter(
  projection: StructuredTableProjection,
  predicate: string,
  filter: StructuredPredicateTypeFilter,
  vocabDefinitionIndex?: StructuredVocabDefinitionIndex,
) {
  if (filter === 'all') return true
  const definition = vocabDefinitionIndex?.predicates.get(predicate) ?? vocabDefinitionIndex?.predicates.get(localPredicateLabel(predicate))
  const valueType = definitionValueType(definition)
  if (filter === 'enum') return isEnumPredicateDefinition(definition)
  if (filter === 'boolean') return isBooleanPredicateDefinition(definition)
  if (filter === 'number') return valueType.includes('number') || valueType.includes('integer') || valueType.includes('decimal') || valueType.includes('float') || valueType.includes('double')
  if (filter === 'date') return valueType.includes('date')
  if (filter === 'relation') return valueType.includes('relation') || valueType.includes('resource') || valueType.includes('iri') || valueType.includes('uri') || valueType.includes('url')
  if (filter === 'text') return valueType.includes('text') || valueType.includes('string') || (!valueType && inferStructuredPredicateKind(structuredPredicateValues(projection, predicate)) === 'text')
  return true
}

export function projectStructuredPredicateTypeFilter<TProjection extends StructuredTableProjection>(
  projection: TProjection,
  filter: StructuredPredicateTypeFilter,
  vocabDefinitionIndex?: StructuredVocabDefinitionIndex,
): TProjection {
  if (filter === 'all') return projection
  const predicates = projection.predicates.filter((predicate) => (
    structuredPredicateMatchesTypeFilter(projection, predicate, filter, vocabDefinitionIndex)
  ))
  const predicateSet = new Set(predicates)
  return {
    ...projection,
    predicates,
    rows: projection.rows.map((row) => ({
      subject: row.subject,
      cells: row.cells.filter((cell) => predicateSet.has(cell.predicate)),
    })),
  }
}

export function projectStructuredWarningRows<TProjection extends StructuredTableProjection>(
  projection: TProjection,
  warnings: readonly StructuredShapeValidationWarning[],
): TProjection {
  if (warnings.length === 0) return { ...projection, rows: [] }
  const warningSubjects = new Set(warnings.map((warning) => warning.subject))
  return {
    ...projection,
    rows: projection.rows.filter((row) => warningSubjects.has(row.subject)),
  }
}

export function projectStructuredRowsFromSubjects<TProjection extends StructuredTableProjection>(
  projection: TProjection,
  subjectProjection: StructuredTableProjection,
): TProjection {
  const subjects = new Set(subjectProjection.rows.map((row) => row.subject))
  return {
    ...projection,
    rows: projection.rows.filter((row) => subjects.has(row.subject)),
  }
}

export function filterShapeWarningsForProjection(
  warnings: readonly StructuredShapeValidationWarning[],
  projection: StructuredTableProjection,
  hiddenPredicates: ReadonlySet<string> = EMPTY_HIDDEN_PREDICATES,
) {
  if (warnings.length === 0) return []
  const subjects = new Set(projection.rows.map((row) => row.subject))
  const predicates = new Set(projection.predicates)
  return warnings.filter((warning) => (
    subjects.has(warning.subject)
    && predicates.has(warning.predicate)
    && !hiddenPredicates.has(warning.predicate)
  ))
}
