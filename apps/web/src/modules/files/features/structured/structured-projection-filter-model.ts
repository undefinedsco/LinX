import {
  projectStructuredClassScope,
  projectStructuredTableView,
  projectStructuredVocabSchemaColumns,
  type StructuredTableProjection,
  type StructuredVocabDefinitionIndex,
} from '../../domain/structured/structured-table'
import {
  projectStructuredPredicateNamespaceFilter,
  projectStructuredPredicateTypeFilter,
  projectStructuredVocabTermFilter,
  structuredPredicateNamespace,
  type StructuredPredicateTypeFilter,
  type StructuredVocabTermFilter,
} from '../../domain/structured/structured-view-projection'
import { localPredicateLabel } from '../../domain/structured/structured-table-vocab'
import type { StructuredSortDirection } from '../../domain/structured/structured-view-metadata'

export type {
  StructuredPredicateTypeFilter,
  StructuredVocabTermFilter,
}

export type StructuredProjectionFilterState = {
  predicateNamespaceFilter: string | null
  predicateTypeFilter: StructuredPredicateTypeFilter
  showNamespaces: boolean
  vocabTermFilter: StructuredVocabTermFilter
}

export function createStructuredProjectionFilterState(): StructuredProjectionFilterState {
  return {
    predicateNamespaceFilter: null,
    predicateTypeFilter: 'all',
    showNamespaces: false,
    vocabTermFilter: 'all',
  }
}

export function projectStructuredProjectionFilterStatePatch({
  current,
  patch,
}: {
  current: StructuredProjectionFilterState
  patch: Partial<StructuredProjectionFilterState>
}): StructuredProjectionFilterState {
  const next = {
    ...current,
    ...patch,
  }
  return next.predicateNamespaceFilter === current.predicateNamespaceFilter
    && next.predicateTypeFilter === current.predicateTypeFilter
    && next.showNamespaces === current.showNamespaces
    && next.vocabTermFilter === current.vocabTermFilter
    ? current
    : next
}

export function projectStructuredProjectionFilterNamespaceVisibility({
  current,
  showNamespaces,
}: {
  current: StructuredProjectionFilterState
  showNamespaces: boolean
}): StructuredProjectionFilterState {
  return projectStructuredProjectionFilterStatePatch({
    current,
    patch: { showNamespaces },
  })
}

export function projectStructuredProjectionFilterStateReset(): StructuredProjectionFilterState {
  return createStructuredProjectionFilterState()
}

export function projectStructuredProjectionFilterStateDocumentReset(
  current: StructuredProjectionFilterState,
): StructuredProjectionFilterState {
  return {
    ...createStructuredProjectionFilterState(),
    showNamespaces: current.showNamespaces,
  }
}

export function projectStructuredProjectionFilterStateForExistingPredicate({
  hiddenPredicates,
  predicate,
}: {
  hiddenPredicates: ReadonlySet<string>
  predicate: string
}): {
  filterState: StructuredProjectionFilterState
  shouldRevealPredicate: boolean
} {
  return {
    filterState: createStructuredProjectionFilterState(),
    shouldRevealPredicate: hiddenPredicates.has(predicate),
  }
}

export function projectStructuredProjectionFilterModel({
  classScope,
  predicateNamespaceFilter,
  predicateTypeFilter,
  projection,
  structuredSearchText,
  structuredSortDirection,
  structuredSortKey,
  vocabDefinitionIndex,
  vocabTermFilter,
}: {
  classScope: string | null
  predicateNamespaceFilter: string | null
  predicateTypeFilter: StructuredPredicateTypeFilter
  projection: StructuredTableProjection
  structuredSearchText: string
  structuredSortDirection: StructuredSortDirection
  structuredSortKey: string | null
  vocabDefinitionIndex: StructuredVocabDefinitionIndex
  vocabTermFilter: StructuredVocabTermFilter
}) {
  const scopedProjection = projectStructuredClassScope(projection, classScope)
  const schemaProjection = projectStructuredVocabSchemaColumns(scopedProjection, vocabDefinitionIndex, scopedProjection.className)
  const schemaPredicateControls = schemaProjection.predicates
  const classDefinition = scopedProjection.className
    ? vocabDefinitionIndex.classes.get(scopedProjection.className)
      ?? vocabDefinitionIndex.classes.get(localPredicateLabel(scopedProjection.className))
    : undefined
  const availablePredicateNamespaces = Array.from(new Set(
    schemaProjection.predicates.map((predicate) => structuredPredicateNamespace(predicate, vocabDefinitionIndex.namespaces)),
  )).sort((left, right) => left.localeCompare(right))
  const viewProjection = projectStructuredTableView(schemaProjection, {
    searchText: structuredSearchText,
    sortKey: structuredSortKey,
    sortDirection: structuredSortDirection,
  })
  const tableNamespaceFilteredProjection = projectStructuredPredicateNamespaceFilter(
    schemaProjection,
    predicateNamespaceFilter,
    vocabDefinitionIndex.namespaces,
  )
  const tableVocabFilteredProjection = projectStructuredVocabTermFilter(
    tableNamespaceFilteredProjection,
    vocabTermFilter,
    vocabDefinitionIndex,
  )
  const tableTypeFilteredProjection = projectStructuredPredicateTypeFilter(
    tableVocabFilteredProjection,
    predicateTypeFilter,
    vocabDefinitionIndex,
  )
  const unfilteredTableProjection = projectStructuredTableView(tableTypeFilteredProjection, {
    searchText: structuredSearchText,
  })

  return {
    availablePredicateNamespaces,
    classDefinition,
    schemaPredicateControls,
    schemaProjection,
    scopedProjection,
    unfilteredTableProjection,
    viewProjection,
  }
}

export function projectStructuredExistingPredicateSelection({
  hiddenPredicates,
  predicate,
}: {
  hiddenPredicates: ReadonlySet<string>
  predicate: string
}) {
  const selection = projectStructuredProjectionFilterStateForExistingPredicate({
    hiddenPredicates,
    predicate,
  })

  return {
    predicateNamespaceFilter: selection.filterState.predicateNamespaceFilter,
    predicateTypeFilter: selection.filterState.predicateTypeFilter,
    shouldRevealPredicate: selection.shouldRevealPredicate,
    vocabTermFilter: selection.filterState.vocabTermFilter,
  }
}
