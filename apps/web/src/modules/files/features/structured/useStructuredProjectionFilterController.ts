import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  type StructuredTableProjection,
  type StructuredVocabDefinitionIndex,
} from '../../domain/structured/structured-table'
import {
  createStructuredProjectionFilterState,
  projectStructuredExistingPredicateSelection,
  projectStructuredProjectionFilterNamespaceVisibility,
  projectStructuredProjectionFilterStateDocumentReset,
  projectStructuredProjectionFilterStatePatch,
  projectStructuredProjectionFilterModel,
  type StructuredPredicateTypeFilter,
  type StructuredVocabTermFilter,
} from './structured-projection-filter-model'
import type { StructuredSortDirection } from '../../domain/structured/structured-view-metadata'

export function useStructuredProjectionFilterController({
  classScope,
  documentUri,
  hiddenPredicates,
  projection,
  structuredSearchText,
  structuredSortDirection,
  structuredSortKey,
  togglePredicateVisibilityFromUi,
  vocabDefinitionIndex,
}: {
  classScope: string | null
  documentUri: string
  hiddenPredicates: ReadonlySet<string>
  projection: StructuredTableProjection
  structuredSearchText: string
  structuredSortDirection: StructuredSortDirection
  structuredSortKey: string | null
  togglePredicateVisibilityFromUi: (predicate: string) => void
  vocabDefinitionIndex: StructuredVocabDefinitionIndex
}) {
  const [filterState, setFilterState] = useState(createStructuredProjectionFilterState)
  const setShowNamespaces = useCallback((showNamespaces: boolean) => {
    setFilterState((current) => projectStructuredProjectionFilterNamespaceVisibility({
      current,
      showNamespaces,
    }))
  }, [])
  const setPredicateTypeFilter = useCallback((predicateTypeFilter: StructuredPredicateTypeFilter) => {
    setFilterState((current) => projectStructuredProjectionFilterStatePatch({
      current,
      patch: { predicateTypeFilter },
    }))
  }, [])
  const setPredicateNamespaceFilter = useCallback((predicateNamespaceFilter: string | null) => {
    setFilterState((current) => projectStructuredProjectionFilterStatePatch({
      current,
      patch: { predicateNamespaceFilter },
    }))
  }, [])
  const setVocabTermFilter = useCallback((vocabTermFilter: StructuredVocabTermFilter) => {
    setFilterState((current) => projectStructuredProjectionFilterStatePatch({
      current,
      patch: { vocabTermFilter },
    }))
  }, [])
  const selectExistingPredicate = useCallback((predicate: string) => {
    const selection = projectStructuredExistingPredicateSelection({
      hiddenPredicates,
      predicate,
    })
    if (selection.shouldRevealPredicate) togglePredicateVisibilityFromUi(predicate)
    setFilterState((current) => projectStructuredProjectionFilterStatePatch({
      current,
      patch: {
        predicateNamespaceFilter: selection.predicateNamespaceFilter,
        predicateTypeFilter: selection.predicateTypeFilter,
        vocabTermFilter: selection.vocabTermFilter,
      },
    }))
  }, [hiddenPredicates, togglePredicateVisibilityFromUi])
  const {
    availablePredicateNamespaces,
    classDefinition,
    schemaPredicateControls,
    schemaProjection,
    scopedProjection,
    unfilteredTableProjection,
    viewProjection,
  } = useMemo(() => projectStructuredProjectionFilterModel({
    classScope,
    predicateNamespaceFilter: filterState.predicateNamespaceFilter,
    predicateTypeFilter: filterState.predicateTypeFilter,
    projection,
    structuredSearchText,
    structuredSortDirection,
    structuredSortKey,
    vocabDefinitionIndex,
    vocabTermFilter: filterState.vocabTermFilter,
  }), [
    classScope,
    filterState.predicateNamespaceFilter,
    filterState.predicateTypeFilter,
    filterState.vocabTermFilter,
    projection,
    structuredSearchText,
    structuredSortDirection,
    structuredSortKey,
    vocabDefinitionIndex,
  ])

  useEffect(() => {
    setFilterState((current) => projectStructuredProjectionFilterStateDocumentReset(current))
  }, [documentUri])

  return {
    availablePredicateNamespaces,
    classDefinition,
    predicateNamespaceFilter: filterState.predicateNamespaceFilter,
    predicateTypeFilter: filterState.predicateTypeFilter,
    schemaPredicateControls,
    schemaProjection,
    scopedProjection,
    selectExistingPredicate,
    setPredicateNamespaceFilter,
    setPredicateTypeFilter,
    setShowNamespaces,
    setVocabTermFilter,
    showNamespaces: filterState.showNamespaces,
    unfilteredTableProjection,
    viewProjection,
    vocabTermFilter: filterState.vocabTermFilter,
  }
}
