import { useEffect, useMemo, useState } from 'react'

import {
  type StructuredCellWriteProposal,
  type StructuredTableProjection,
  type StructuredVocabDefinitionIndex,
} from '../../domain/structured/structured-table'
import {
  type StructuredPredicateTypeFilter,
  type StructuredVocabTermFilter,
} from '../../domain/structured/structured-view-projection'
import {
  createStructuredProjectionReviewState,
  projectStructuredProjectionReviewModel,
  projectStructuredProjectionReviewPendingWritesOnly,
  projectStructuredProjectionReviewReset,
  projectStructuredProjectionReviewWarningRowsOnly,
} from './structured-projection-review-model'

export function useStructuredProjectionReviewController({
  allPendingWriteSubjects,
  classScope,
  documentUri,
  effectiveCellWriteProposals,
  hiddenPredicates,
  predicateNamespaceFilter,
  predicateTypeFilter,
  resourceUpdateFilteredProjection,
  schemaProjection,
  sourceUpdatesOnly,
  viewProjection,
  vocabDefinitionIndex,
  vocabTermFilter,
}: {
  allPendingWriteSubjects: ReadonlySet<string>
  classScope: string | null
  documentUri: string
  effectiveCellWriteProposals: readonly StructuredCellWriteProposal[]
  hiddenPredicates: ReadonlySet<string>
  predicateNamespaceFilter: string | null
  predicateTypeFilter: StructuredPredicateTypeFilter
  resourceUpdateFilteredProjection: StructuredTableProjection
  schemaProjection: StructuredTableProjection
  sourceUpdatesOnly: boolean
  viewProjection: StructuredTableProjection
  vocabDefinitionIndex: StructuredVocabDefinitionIndex
  vocabTermFilter: StructuredVocabTermFilter
}) {
  const [reviewState, setReviewState] = useState(createStructuredProjectionReviewState)
  const { pendingWritesOnly, warningRowsOnly } = reviewState

  const {
    effectiveRawText,
    effectiveViewProjection,
    shapeWarnings,
    structuredStatus,
    tableProjection,
  } = useMemo(
    () => projectStructuredProjectionReviewModel({
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
    }),
    [
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
    ],
  )

  useEffect(() => {
    setReviewState((current) => projectStructuredProjectionReviewReset(current))
  }, [documentUri])

  const setPendingWritesOnly = (nextPendingWritesOnly: boolean) => {
    setReviewState((current) => projectStructuredProjectionReviewPendingWritesOnly({
      current,
      pendingWritesOnly: nextPendingWritesOnly,
    }))
  }

  const setWarningRowsOnly = (nextWarningRowsOnly: boolean) => {
    setReviewState((current) => projectStructuredProjectionReviewWarningRowsOnly({
      current,
      warningRowsOnly: nextWarningRowsOnly,
    }))
  }

  return {
    effectiveRawText,
    effectiveViewProjection,
    pendingWritesOnly,
    setPendingWritesOnly,
    setWarningRowsOnly,
    shapeWarnings,
    structuredStatus,
    tableProjection,
    warningRowsOnly,
  }
}
