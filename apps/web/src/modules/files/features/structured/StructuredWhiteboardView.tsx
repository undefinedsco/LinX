import type { StructuredWhiteboardVisualRelation } from '../../domain/structured/structured-projections'
import type { StructuredCellCommitResult, StructuredCellWriteProposal, StructuredTableProjection } from '../../domain/structured/structured-table'
import type {
  StructuredWhiteboardPosition,
  StructuredWhiteboardSnapshotV1,
} from '../../domain/structured/structured-view-metadata'
import { LinxWhiteboardCanvas } from './whiteboard/LinxWhiteboardCanvas'
import { useWhiteboardBoardController } from './whiteboard/useWhiteboardBoardController'
import type { StructuredWhiteboardSubjectOpenOptions } from './useStructuredWhiteboardViewController'

const EMPTY_WHITEBOARD_LAYOUT: Record<string, { x: number; y: number }> = {}
const EMPTY_WHITEBOARD_SUBJECTS: string[] = []

/**
 * The board's layout now lives in the Pod (JSON Canvas). The props that used to
 * carry positions and card lists in view settings are still accepted so callers
 * keep working; they only seed the first load of an existing board.
 */
export function StructuredWhiteboardView({
  documentUri,
  layout = EMPTY_WHITEBOARD_LAYOUT,
  projection,
  selectedSubjects = EMPTY_WHITEBOARD_SUBJECTS,
  visualRelations = [],
  snapshot,
  relationPredicateOptions = [],
  predicateLabel,
  onVisualRelationsChange,
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
  predicateLabel?: (predicate: string) => string
  onAddSubject?: (subject: string) => void
  onCreateSubject?: (subject: string) => boolean | Promise<boolean>
  onRemoveSubject?: (subject: string) => void
  onClearSubjects?: () => void
  onNodePositionChange?: (subject: string, position: StructuredWhiteboardPosition) => void
  onVisualRelationsChange?: (relations: StructuredWhiteboardVisualRelation[]) => void
  onSnapshotChange?: (snapshot: StructuredWhiteboardSnapshotV1) => void
  onOpenSubject?: (subject: string, options?: StructuredWhiteboardSubjectOpenOptions) => void
  onCommitCellWriteProposal?: (proposal: StructuredCellWriteProposal) => StructuredCellCommitResult | Promise<StructuredCellCommitResult>
}) {
  const board = useWhiteboardBoardController({
    documentUri,
    layout,
    projection,
    selectedSubjects,
    visualRelations,
    snapshot,
    relationPredicateOptions,
    predicateLabel,
    onCommitCellWriteProposal,
    onVisualRelationsChange,
    onOpenSubject,
  })

  return (
    <LinxWhiteboardCanvas
      documentUri={documentUri}
      model={board.model}
      cards={board.cards}
      canvasState={board.canvasState}
      relation={board.relation}
      rowFacts={board.rowFacts}
      onCommitCardBody={board.commitCardBody}
      onCommitCardTitle={board.commitCardTitle}
    />
  )
}
