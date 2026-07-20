import { useCallback, useMemo } from 'react'

import type { StructuredCellWriteProposal, StructuredTableProjection } from '../../domain/structured/structured-table'
import type { StructuredWhiteboardPosition } from '../../domain/structured/structured-view-metadata'
import {
  projectStructuredWhiteboardViewModel,
  type StructuredWhiteboardVisualRelation,
} from './structured-whiteboard-view-model'
import { useStructuredWhiteboardRelationController } from './useStructuredWhiteboardRelationController'

const EMPTY_WHITEBOARD_LAYOUT: Record<string, { x: number; y: number }> = {}
const EMPTY_WHITEBOARD_SUBJECTS: string[] = []

export type StructuredWhiteboardSubjectOpenOptions = {
  navigate?: boolean
}

export function useStructuredWhiteboardViewController({
  documentUri,
  layout = EMPTY_WHITEBOARD_LAYOUT,
  projection,
  selectedSubjects = EMPTY_WHITEBOARD_SUBJECTS,
  visualRelations = [],
  relationPredicateOptions = [],
  onCommitCellWriteProposal,
  onVisualRelationsChange,
  onOpenSubject,
}: {
  documentUri: string
  layout?: Record<string, StructuredWhiteboardPosition>
  projection: StructuredTableProjection
  selectedSubjects?: string[]
  visualRelations?: StructuredWhiteboardVisualRelation[]
  relationPredicateOptions?: readonly string[]
  onCommitCellWriteProposal?: (proposal: StructuredCellWriteProposal) => boolean | Promise<boolean>
  onNodePositionChange?: (subject: string, position: StructuredWhiteboardPosition) => void
  onVisualRelationsChange?: (relations: StructuredWhiteboardVisualRelation[]) => void
  onOpenSubject?: (subject: string, options?: StructuredWhiteboardSubjectOpenOptions) => void
}) {
  const viewModel = useMemo(
    () => projectStructuredWhiteboardViewModel({
      layout,
      projection,
      selectedSubjects,
      visualRelations,
    }),
    [layout, projection, selectedSubjects, visualRelations],
  )

  const relation = useStructuredWhiteboardRelationController({
    documentUri,
    projection,
    relationPredicateOptions,
    relationSubjectOptions: viewModel.relationSubjectOptions,
    visualRelations,
    onCommitCellWriteProposal,
    onVisualRelationsChange,
  })

  const openSubject = useCallback((subject: string, options?: StructuredWhiteboardSubjectOpenOptions) => {
    onOpenSubject?.(subject, options)
  }, [onOpenSubject])

  return {
    ...relation,
    ...viewModel,
    layoutKey: documentUri,
    openSubject,
  }
}
