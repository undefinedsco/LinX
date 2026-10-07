import {
  projectStructuredEffectiveViewProjection,
  renderStructuredProjectionAsRawText,
  validateStructuredTableShapeConstraints,
  type StructuredCellWriteProposal,
  type StructuredShapeValidationWarning,
  type StructuredTableProjection,
  type StructuredVocabDefinitionIndex,
} from '../../domain/structured/structured-table'
import {
  filterShapeWarningsForProjection,
  projectStructuredRowsFromSubjects,
  projectStructuredWarningRows,
  type StructuredPredicateTypeFilter,
  type StructuredVocabTermFilter,
} from '../../domain/structured/structured-view-projection'

export interface StructuredProjectionReviewModel {
  effectiveRawText: string
  effectiveViewProjection: StructuredTableProjection
  shapeWarnings: StructuredShapeValidationWarning[]
  structuredStatus: string
  tableProjection: StructuredTableProjection
}

export type StructuredProjectionReviewState = {
  pendingWritesOnly: boolean
  warningRowsOnly: boolean
}

export function createStructuredProjectionReviewState(): StructuredProjectionReviewState {
  return {
    pendingWritesOnly: false,
    warningRowsOnly: false,
  }
}

export function projectStructuredProjectionReviewReset(
  _current: StructuredProjectionReviewState,
): StructuredProjectionReviewState {
  return createStructuredProjectionReviewState()
}

export function projectStructuredProjectionReviewWarningRowsOnly({
  current,
  warningRowsOnly,
}: {
  current: StructuredProjectionReviewState
  warningRowsOnly: boolean
}): StructuredProjectionReviewState {
  return {
    ...current,
    warningRowsOnly,
  }
}

export function projectStructuredProjectionReviewPendingWritesOnly({
  current,
  pendingWritesOnly,
}: {
  current: StructuredProjectionReviewState
  pendingWritesOnly: boolean
}): StructuredProjectionReviewState {
  return {
    ...current,
    pendingWritesOnly,
  }
}

export function projectStructuredProjectionReviewModel({
  allPendingWriteSubjects,
  classScope,
  documentUri,
  effectiveCellWriteProposals,
  hiddenPredicates,
  pendingWritesOnly,
  predicateNamespaceFilter,
  predicateTypeFilter,
  resourceUpdateFilteredProjection,
  schemaProjection,
  sourceUpdatesOnly,
  viewProjection,
  vocabDefinitionIndex,
  vocabTermFilter,
  warningRowsOnly,
}: {
  allPendingWriteSubjects: ReadonlySet<string>
  classScope: string | null
  documentUri: string
  effectiveCellWriteProposals: readonly StructuredCellWriteProposal[]
  hiddenPredicates: ReadonlySet<string>
  pendingWritesOnly: boolean
  predicateNamespaceFilter: string | null
  predicateTypeFilter: StructuredPredicateTypeFilter
  resourceUpdateFilteredProjection: StructuredTableProjection
  schemaProjection: StructuredTableProjection
  sourceUpdatesOnly: boolean
  viewProjection: StructuredTableProjection
  vocabDefinitionIndex: StructuredVocabDefinitionIndex
  vocabTermFilter: StructuredVocabTermFilter
  warningRowsOnly: boolean
}): StructuredProjectionReviewModel {
  const effectiveViewProjection = projectStructuredEffectiveViewProjection(viewProjection, {
    documentUri,
    pendingCellWriteProposals: effectiveCellWriteProposals,
    hiddenPredicates,
  })
  const effectiveRawText = renderStructuredProjectionAsRawText(effectiveViewProjection)
  const shapeValidationProjection = projectStructuredRowsFromSubjects(schemaProjection, resourceUpdateFilteredProjection)
  const unfilteredShapeWarnings = validateStructuredTableShapeConstraints(
    shapeValidationProjection,
    vocabDefinitionIndex,
    classScope,
  )
  const tableScopedShapeWarnings = filterShapeWarningsForProjection(
    unfilteredShapeWarnings,
    resourceUpdateFilteredProjection,
    hiddenPredicates,
  )
  const tableProjection = warningRowsOnly
    ? projectStructuredWarningRows(resourceUpdateFilteredProjection, tableScopedShapeWarnings)
    : resourceUpdateFilteredProjection
  const shapeWarningScopeProjection = pendingWritesOnly
    ? {
        ...tableProjection,
        rows: tableProjection.rows.filter((row) => allPendingWriteSubjects.has(row.subject)),
      }
    : tableProjection
  const shapeWarnings = filterShapeWarningsForProjection(
    tableScopedShapeWarnings,
    shapeWarningScopeProjection,
    hiddenPredicates,
  )

  return {
    effectiveRawText,
    effectiveViewProjection,
    shapeWarnings,
    structuredStatus: projectStructuredProjectionReviewStatus({
      hiddenPredicates,
      pendingWritesOnly,
      predicateNamespaceFilter,
      predicateTypeFilter,
      sourceUpdatesOnly,
      tableProjection,
      vocabTermFilter,
      warningRowsOnly,
    }),
    tableProjection,
  }
}

function projectStructuredProjectionReviewStatus({
  hiddenPredicates,
  pendingWritesOnly,
  predicateNamespaceFilter,
  predicateTypeFilter,
  sourceUpdatesOnly,
  tableProjection,
  vocabTermFilter,
  warningRowsOnly,
}: {
  hiddenPredicates: ReadonlySet<string>
  pendingWritesOnly: boolean
  predicateNamespaceFilter: string | null
  predicateTypeFilter: StructuredPredicateTypeFilter
  sourceUpdatesOnly: boolean
  tableProjection: StructuredTableProjection
  vocabTermFilter: StructuredVocabTermFilter
  warningRowsOnly: boolean
}) {
  return [
    `${tableProjection.rows.length} 行`,
    formatPredicateCount(tableProjection.predicates.length),
    predicateNamespaceFilter ? `${predicateNamespaceFilter} 命名空间` : null,
    vocabTermFilter !== 'all' ? `${vocabTermFilter === 'defined' ? '已定义 predicate' : '仅观察到 predicate'}` : null,
    predicateTypeFilter !== 'all' ? predicateTypeFilter : null,
    warningRowsOnly ? '仅校验提醒' : null,
    pendingWritesOnly ? '仅待确认更改' : null,
    sourceUpdatesOnly ? '仅 Ingest 更新' : null,
    hiddenPredicates.size > 0 ? formatHiddenPredicateCount(hiddenPredicates.size) : null,
  ].filter(Boolean).join(' · ')
}

function formatPredicateCount(count: number) {
  return `${count} predicate${count === 1 ? '' : 's'}`
}

function formatHiddenPredicateCount(count: number) {
  return `${count} hidden predicate${count === 1 ? '' : 's'}`
}
