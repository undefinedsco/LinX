import type { StructuredVocabTermDefinition } from '../../domain/structured/structured-table'
import { localPredicateLabel } from '../../domain/structured/structured-table-vocab'

export function projectStructuredResourcePreviewHeaderModel({
  classDefinition,
  pendingClassScopeProposal,
  selectedClassName,
}: {
  classDefinition?: StructuredVocabTermDefinition
  pendingClassScopeProposal?: { label: string; uri: string }
  selectedClassName?: string | null
}) {
  const classScopeDisplayLabel = selectedClassName
    ? classDefinition?.label || pendingClassScopeProposal?.label || localPredicateLabel(selectedClassName)
    : '选择或创建类型'

  return {
    classScopeButtonLabel: selectedClassName
      ? `当前类型：${classScopeDisplayLabel}`
      : '选择类型',
    classScopeDisplayLabel,
    classScopeLabel: selectedClassName ? classScopeDisplayLabel : '选择或创建类型',
  }
}

const ROW_NAME_PREDICATES = new Set(['rdfs:label', 'http://www.w3.org/2000/01/rdf-schema#label'])

/**
 * rdfs:label is the row's own name and shows under 名称, not as a column of its own.
 * Vocabulary registries (`/.vocab/`) keep it as a column: there it is a defined field.
 */
export function projectStructuredTableWithoutNameColumn<TProjection extends { predicates: string[] }>(
  projection: TProjection,
  documentUri: string,
): TProjection {
  if (documentUri.includes('/.vocab/')) return projection
  if (!projection.predicates.some((predicate) => ROW_NAME_PREDICATES.has(predicate))) return projection
  return { ...projection, predicates: projection.predicates.filter((predicate) => !ROW_NAME_PREDICATES.has(predicate)) }
}

/** Local class name -> the label people gave the class, so cards say 「任务」 instead of Task. */
export function projectStructuredCardClassLabels({
  classes,
  scopeClassName,
  scopeLabel,
}: {
  classes: ReadonlyMap<string, StructuredVocabTermDefinition> | undefined
  scopeClassName: string | null
  scopeLabel: string
}): Record<string, string> {
  const labels: Record<string, string> = {}
  for (const [key, definition] of classes ?? []) {
    const label = definition.label?.trim()
    const local = localPredicateLabel(key)
    if (label && local) labels[local] = label
  }
  if (scopeClassName) labels[localPredicateLabel(scopeClassName)] = scopeLabel
  return labels
}
