import { useCallback, useMemo, useState, type DragEvent } from 'react'

import type { StructuredCellWriteProposal, StructuredTableProjection } from '../../domain/structured/structured-table'
import {
  createStructuredKanbanNativeDragState,
  findStructuredKanbanColumnForSubject,
  hasStructuredKanbanMoveTargets,
  projectStructuredKanbanCardBySubject,
  projectStructuredKanbanDndDragEndPlan,
  projectStructuredKanbanDisplayColumns,
  projectStructuredKanbanNativeDragCleared,
  projectStructuredKanbanNativeDragLeftColumn,
  projectStructuredKanbanNativeDragOverColumn,
  projectStructuredKanbanNativeDragStarted,
  projectStructuredKanbanMoveTargets,
  projectStructuredKanbanSourceModel,
  type StructuredCardProjection,
  type StructuredKanbanColumn,
} from './structured-kanban-view-model'
import { useStructuredKanbanMoveController } from './useStructuredKanbanMoveController'

type DndDragEndEvent = {
  active: { id: string | number }
  over?: { id: string | number } | null
}

type NativeDragEvent<T extends Element = Element> = DragEvent<T>

export function useStructuredKanbanViewController({
  documentUri,
  projection,
  groupPredicate,
  kanbanOrder,
  onColumnOrderChange,
  onCommitCellWriteProposal,
}: {
  documentUri: string
  projection: StructuredTableProjection
  groupPredicate: string | null
  kanbanOrder: Record<string, string[]>
  onColumnOrderChange: (columnId: string, subjects: string[]) => void
  onCommitCellWriteProposal?: (proposal: StructuredCellWriteProposal) => boolean | Promise<boolean>
}) {
  const [nativeDragState, setNativeDragState] = useState(createStructuredKanbanNativeDragState)
  const sourceModel = useMemo(
    () => projectStructuredKanbanSourceModel({
      groupPredicate,
      kanbanOrder,
      projection,
    }),
    [groupPredicate, kanbanOrder, projection],
  )
  const move = useStructuredKanbanMoveController({
    documentUri,
    projectionRows: projection.rows,
    groupPredicate: sourceModel.kanban.groupPredicate,
    columns: sourceModel.kanban.columns,
    onColumnOrderChange,
    onCommitCellWriteProposal,
  })
  const displayColumns = useMemo(
    () => projectStructuredKanbanDisplayColumns(move.displayColumns),
    [move.displayColumns],
  )
  const cardBySubject = useMemo(
    () => projectStructuredKanbanCardBySubject(displayColumns),
    [displayColumns],
  )

  const clearNativeDragState = useCallback(() => {
    setNativeDragState(projectStructuredKanbanNativeDragCleared())
  }, [])

  const sourceColumnForSubject = useCallback((subject: string) => (
    findStructuredKanbanColumnForSubject(displayColumns, subject)
  ), [displayColumns])

  const commitCrossColumnMove = useCallback(async (
    subject: string,
    targetColumn: StructuredKanbanColumn,
  ) => {
    const card = cardBySubject.get(subject)
    if (!card) return
    const sourceColumn = sourceColumnForSubject(subject)
    if (sourceColumn?.id === targetColumn.id) return
    if (!move.canCommitCrossColumnMoves) return
    await move.commitKanbanMove(card, targetColumn)
  }, [cardBySubject, move, sourceColumnForSubject])

  const handleCardDragStart = useCallback((event: NativeDragEvent<HTMLDivElement>, card: StructuredCardProjection) => {
    setNativeDragState(projectStructuredKanbanNativeDragStarted({ subject: card.subject }))
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', card.subject)
  }, [])

  const handleColumnDragOver = useCallback((event: NativeDragEvent<HTMLElement>, column: StructuredKanbanColumn) => {
    if (!nativeDragState.draggingSubject) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    setNativeDragState((current) => projectStructuredKanbanNativeDragOverColumn({
      current,
      columnId: column.id,
    }))
  }, [nativeDragState.draggingSubject])

  const handleColumnDragLeave = useCallback((event: NativeDragEvent<HTMLElement>, column: StructuredKanbanColumn) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setNativeDragState((current) => projectStructuredKanbanNativeDragLeftColumn({
      current,
      columnId: column.id,
    }))
  }, [])

  const handleColumnDrop = useCallback(async (event: NativeDragEvent<HTMLElement>, column: StructuredKanbanColumn) => {
    event.preventDefault()
    const subject = nativeDragState.draggingSubject ?? event.dataTransfer.getData('text/plain')
    clearNativeDragState()
    if (!subject) return
    await commitCrossColumnMove(subject, column)
  }, [clearNativeDragState, commitCrossColumnMove, nativeDragState.draggingSubject])

  const handleCardDrop = useCallback(async (event: NativeDragEvent<HTMLDivElement>, targetCard: StructuredCardProjection) => {
    event.preventDefault()
    event.stopPropagation()
    const subject = nativeDragState.draggingSubject ?? event.dataTransfer.getData('text/plain')
    clearNativeDragState()
    if (!subject || subject === targetCard.subject) return
    const sourceColumn = sourceColumnForSubject(subject)
    const targetColumn = sourceColumnForSubject(targetCard.subject)
    if (!targetColumn) return
    if (sourceColumn?.id === targetColumn.id) {
      move.reorderColumnSubjects(targetColumn.id, subject, targetCard.subject)
      return
    }
    await commitCrossColumnMove(subject, targetColumn)
  }, [clearNativeDragState, commitCrossColumnMove, move, nativeDragState.draggingSubject, sourceColumnForSubject])

  const handleDndDragEnd = useCallback((event: DndDragEndEvent) => {
    clearNativeDragState()
    const subject = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    const plan = projectStructuredKanbanDndDragEndPlan({
      displayColumns,
      overId,
      subject,
    })
    if (plan.kind === 'reorder') {
      move.reorderColumnSubjects(plan.columnId, plan.subject, plan.overSubject)
      return
    }
    if (plan.kind === 'cross-column') {
      void commitCrossColumnMove(plan.subject, plan.targetColumn)
      return
    }
  }, [clearNativeDragState, commitCrossColumnMove, displayColumns, move])

  const moveTargetColumnsFor = useCallback((columnId: string) => (
    projectStructuredKanbanMoveTargets({
      canCommitCrossColumnMoves: move.canCommitCrossColumnMoves,
      columnId,
      columns: move.columns,
    })
  ), [move.canCommitCrossColumnMoves, move.columns])
  const canMoveCardsInColumn = useCallback((columnId: string) => (
    hasStructuredKanbanMoveTargets(moveTargetColumnsFor(columnId))
  ), [moveTargetColumnsFor])

  const moveCardToColumn = useCallback(
    async (card: StructuredCardProjection, column: Pick<StructuredKanbanColumn, 'id' | 'label' | 'value'>) => {
      await move.commitKanbanMove(card, column)
    },
    [move],
  )

  return {
    chrome: sourceModel.chrome,
    hasColumns: sourceModel.hasColumns,
    hasPredicateOptions: sourceModel.hasPredicateOptions,
    groupLabel: sourceModel.groupLabel,
    groupTriggerLabel: sourceModel.groupTriggerLabel,
    predicateOptions: sourceModel.predicateOptions,
    canCommitCrossColumnMoves: move.canCommitCrossColumnMoves,
    canMoveCardsInColumn,
    displayColumns,
    isColumnNativeDragOver: (columnId: string) => nativeDragState.dragOverColumnId === columnId,
    moveTargetColumnsFor,
    pendingMoveViewForSubject: move.pendingMoveViewForSubject,
    moveCardToColumn,
    handleCardDragStart,
    handleColumnDragOver,
    handleColumnDragLeave,
    handleColumnDrop,
    handleCardDrop,
    handleDndDragEnd,
    clearNativeDragState,
  }
}
