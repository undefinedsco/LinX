import {
  type StructuredWhiteboardVisualRelation,
} from '../../domain/structured/structured-projections'
import type { StructuredCellWriteProposal, StructuredTableProjection } from '../../domain/structured/structured-table'
import type {
  StructuredWhiteboardPosition,
  StructuredWhiteboardSnapshotV1,
} from '../../domain/structured/structured-view-metadata'
import { LinxWhiteboardCanvas } from './whiteboard/LinxWhiteboardCanvas'
import {
  useStructuredWhiteboardViewController,
  type StructuredWhiteboardSubjectOpenOptions,
} from './useStructuredWhiteboardViewController'

const EMPTY_WHITEBOARD_LAYOUT: Record<string, { x: number; y: number }> = {}
const EMPTY_WHITEBOARD_SUBJECTS: string[] = []

export function StructuredWhiteboardView({
  documentUri,
  layout = EMPTY_WHITEBOARD_LAYOUT,
  projection,
  selectedSubjects = EMPTY_WHITEBOARD_SUBJECTS,
  visualRelations = [],
  snapshot,
  relationPredicateOptions = [],
  onAddSubject,
  onCreateSubject,
  onRemoveSubject,
  onClearSubjects,
  onNodePositionChange,
  onVisualRelationsChange,
  onSnapshotChange,
  onOpenSubject,
  onCommitCellWriteProposal,
}: {
  documentUri: string
  layout?: Record<string, StructuredWhiteboardPosition>
  projection: StructuredTableProjection
  selectedSubjects?: string[]
  visualRelations?: StructuredWhiteboardVisualRelation[]
  snapshot?: StructuredWhiteboardSnapshotV1
  relationPredicateOptions?: readonly string[]
  onAddSubject?: (subject: string) => void
  onCreateSubject?: (subject: string) => boolean | Promise<boolean>
  onRemoveSubject?: (subject: string) => void
  onClearSubjects?: () => void
  onNodePositionChange?: (subject: string, position: StructuredWhiteboardPosition) => void
  onVisualRelationsChange?: (relations: StructuredWhiteboardVisualRelation[]) => void
  onSnapshotChange?: (snapshot: StructuredWhiteboardSnapshotV1) => void
  onOpenSubject?: (subject: string, options?: StructuredWhiteboardSubjectOpenOptions) => void
  onCommitCellWriteProposal?: (proposal: StructuredCellWriteProposal) => boolean | Promise<boolean>
}) {
  const whiteboard = useStructuredWhiteboardViewController({
    documentUri,
    layout,
    projection,
    selectedSubjects,
    visualRelations,
    relationPredicateOptions,
    onCommitCellWriteProposal,
    onNodePositionChange,
    onVisualRelationsChange,
    onOpenSubject,
  })

  return (
    <LinxWhiteboardCanvas
      model={whiteboard}
      snapshot={snapshot}
      onAddSubject={onAddSubject}
      onCreateSubject={onCreateSubject}
      onClearSubjects={onClearSubjects}
      onNodePositionChange={onNodePositionChange}
      onRemoveSubject={onRemoveSubject}
      onSnapshotChange={onSnapshotChange}
      onOpenRelationEditor={whiteboard.openRelationEditor}
      onOpenSubject={onOpenSubject}
      relation={whiteboard}
    />
  )
}
