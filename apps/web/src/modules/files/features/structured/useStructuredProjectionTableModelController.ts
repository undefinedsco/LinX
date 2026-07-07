import { useMemo } from 'react'

import type {
  StructuredShapeValidationWarning,
  StructuredTableProjection,
} from '../../domain/structured/structured-table'
import {
  buildStructuredProjectionTableRows,
  buildStructuredShapeWarningMap,
  projectStructuredColumnVisibilityState,
  projectStructuredDisplayTableRows,
  projectStructuredFooterPredicates,
  resolveStructuredVisiblePredicates,
  type StructuredProjectionCellValueResolver,
} from './structured-projection-table-model'

export function useStructuredProjectionTableModelController({
  classScope,
  documentUri,
  hiddenPredicates,
  pendingPredicateIds,
  pendingSubjects,
  pendingWritesOnly,
  pendingWriteSubjects,
  projection,
  resolveCellValues,
  shapeWarnings,
}: {
  classScope?: string | null
  documentUri: string
  hiddenPredicates: ReadonlySet<string>
  pendingPredicateIds: readonly string[]
  pendingSubjects: readonly string[]
  pendingWritesOnly: boolean
  pendingWriteSubjects: ReadonlySet<string>
  projection: StructuredTableProjection
  resolveCellValues: StructuredProjectionCellValueResolver
  shapeWarnings: readonly StructuredShapeValidationWarning[]
}) {
  const tableRows = useMemo(
    () => buildStructuredProjectionTableRows({
      classScope,
      pendingPredicateIds,
      pendingSubjects,
      projection,
      resolveCellValues,
    }),
    [classScope, pendingPredicateIds, pendingSubjects, projection, resolveCellValues],
  )
  const displayTableRows = useMemo(
    () => projectStructuredDisplayTableRows({
      pendingWritesOnly,
      pendingWriteSubjects,
      tableRows,
    }),
    [pendingWriteSubjects, pendingWritesOnly, tableRows],
  )
  const visiblePredicates = useMemo(
    () => resolveStructuredVisiblePredicates({
      pendingPredicateIds,
      projectionPredicates: projection.predicates,
    }),
    [pendingPredicateIds, projection.predicates],
  )
  const columnVisibility = useMemo(
    () => projectStructuredColumnVisibilityState({
      hiddenPredicates,
      visiblePredicates,
    }),
    [hiddenPredicates, visiblePredicates],
  )
  const footerPredicates = useMemo(
    () => projectStructuredFooterPredicates({
      hiddenPredicates,
      visiblePredicates,
    }),
    [hiddenPredicates, visiblePredicates],
  )
  const shapeWarningByCell = useMemo(
    () => buildStructuredShapeWarningMap({
      documentUri,
      shapeWarnings,
    }),
    [documentUri, shapeWarnings],
  )

  return {
    columnVisibility,
    displayTableRows,
    footerPredicates,
    shapeWarningByCell,
    tableRows,
    visiblePredicates,
  }
}
