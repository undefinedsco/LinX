import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { StructuredCellWriteProposal, StructuredTableProjection } from '../../domain/structured/structured-table'
import {
  findStructuredKanbanColumnForSubject,
  hasStructuredKanbanMoveTargets,
  projectStructuredKanbanCardBySubject,
  projectStructuredKanbanDndDragEndPlan,
  projectStructuredKanbanDisplayColumns,
  projectStructuredKanbanMoveTargets,
  projectStructuredKanbanSourceModel,
  type StructuredCardProjection,
  type StructuredKanbanColumn,
  type StructuredKanbanDisplayColumn,
} from './structured-kanban-view-model'
import { useStructuredKanbanMoveController } from './useStructuredKanbanMoveController'

type DndDragEndEvent = {
  active: { id: string | number }
  over?: { id: string | number } | null
}

type DndDragStartEvent = {
  active: { id: string | number }
}

type DndDragOverEvent = DndDragEndEvent

type LaneKeyboardReorderDirection = 'left' | 'right'
export type CardKeyboardMoveDirection = 'up' | 'down' | 'left' | 'right'

const LANE_DND_ID_PREFIX = 'lane:'

export function useStructuredKanbanViewController({
  documentUri,
  projection,
  groupPredicate,
  kanbanOrder,
  laneOrder = [],
  initialCollapsedLaneIds = [],
  onColumnOrderChange,
  onLaneOrderChange,
  onCollapsedLaneIdsChange,
  onCommitCellWriteProposal,
  onCreateSubject,
}: {
  documentUri: string
  projection: StructuredTableProjection
  groupPredicate: string | null
  kanbanOrder: Record<string, string[]>
  laneOrder?: string[]
  initialCollapsedLaneIds?: string[]
  onColumnOrderChange: (columnId: string, subjects: string[]) => void
  onLaneOrderChange?: (laneOrder: string[]) => void
  onCollapsedLaneIdsChange?: (collapsedLaneIds: string[]) => void
  onCommitCellWriteProposal?: (proposal: StructuredCellWriteProposal) => boolean | Promise<boolean>
  onCreateSubject?: (input: { columnId: string; columnValue: string | null; subject: string }) => boolean | Promise<boolean>
}) {
  const [activeDragSubject, setActiveDragSubject] = useState<string | null>(null)
  const [activeDropColumnId, setActiveDropColumnId] = useState<string | null>(null)
  const [activeDropSubject, setActiveDropSubject] = useState<string | null>(null)
  const [selectedCardSubjects, setSelectedCardSubjects] = useState<string[]>([])
  const [collapsedLaneIds, setCollapsedLaneIds] = useState<string[]>(() => [...initialCollapsedLaneIds])
  const collapsedLaneIdsRef = useRef(collapsedLaneIds)
  const hydratedCollapsedLaneIdsRef = useRef([...initialCollapsedLaneIds])
  const lastPublishedLaneOrderRef = useRef<string[] | null>(null)
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
    () => orderStructuredKanbanDisplayColumns(
      projectStructuredKanbanDisplayColumns(move.displayColumns),
      laneOrder,
    ),
    [laneOrder, move.displayColumns],
  )
  const displayColumnIds = useMemo(() => displayColumns.map((column) => column.id), [displayColumns])
  const cardBySubject = useMemo(
    () => projectStructuredKanbanCardBySubject(displayColumns),
    [displayColumns],
  )
  const columnById = useMemo(
    () => new Map(displayColumns.map((column) => [column.id, column])),
    [displayColumns],
  )
  const activeDragCard = activeDragSubject ? cardBySubject.get(activeDragSubject) : undefined
  const collapsedLaneIdSet = useMemo(() => new Set(collapsedLaneIds), [collapsedLaneIds])

  useEffect(() => {
    collapsedLaneIdsRef.current = collapsedLaneIds
  }, [collapsedLaneIds])

  useEffect(() => {
    if (arraysEqual(hydratedCollapsedLaneIdsRef.current, initialCollapsedLaneIds)) return
    const nextCollapsedLaneIds = [...initialCollapsedLaneIds]
    hydratedCollapsedLaneIdsRef.current = nextCollapsedLaneIds
    collapsedLaneIdsRef.current = nextCollapsedLaneIds
    setCollapsedLaneIds(nextCollapsedLaneIds)
  }, [initialCollapsedLaneIds])

  useEffect(() => {
    if (!onLaneOrderChange) return
    if (arraysEqual(displayColumnIds, laneOrder)) {
      lastPublishedLaneOrderRef.current = null
      return
    }
    if (lastPublishedLaneOrderRef.current && arraysEqual(lastPublishedLaneOrderRef.current, displayColumnIds)) return
    lastPublishedLaneOrderRef.current = [...displayColumnIds]
    onLaneOrderChange(displayColumnIds)
  }, [displayColumnIds, laneOrder, onLaneOrderChange])

  const clearDragState = useCallback(() => {
    setActiveDragSubject(null)
    setActiveDropColumnId(null)
    setActiveDropSubject(null)
  }, [])
  const selectCard = useCallback((subject: string, options: { extend?: boolean } = {}) => {
    setSelectedCardSubjects((current) => {
      if (!options.extend) return [subject]
      return current.includes(subject)
        ? current.filter((candidate) => candidate !== subject)
        : [...current, subject]
    })
  }, [])
  const isCardSelected = useCallback((subject: string) => selectedCardSubjects.includes(subject), [selectedCardSubjects])

  const sourceColumnForSubject = useCallback((subject: string) => (
    findStructuredKanbanColumnForSubject(displayColumns, subject)
  ), [displayColumns])

  const commitCrossColumnMove = useCallback(async (
    subject: string,
    targetColumn: Pick<StructuredKanbanColumn, 'id' | 'label' | 'value'>,
  ) => {
    const card = cardBySubject.get(subject)
    if (!card) return false
    const sourceColumn = sourceColumnForSubject(subject)
    if (sourceColumn?.id === targetColumn.id) return false
    if (!move.canCommitCrossColumnMoves) return false
    return move.commitKanbanMove(card, targetColumn)
  }, [cardBySubject, move, sourceColumnForSubject])

  const moveSelectionToColumn = useCallback(async (
    anchorSubject: string,
    targetColumn: Pick<StructuredKanbanColumn, 'id' | 'label' | 'value'>,
    overSubject?: string,
    persistOrder = false,
  ) => {
    const subjects = selectedCardSubjects.includes(anchorSubject) && selectedCardSubjects.length > 1
      ? selectedCardSubjects
      : [anchorSubject]
    const movedSubjects: string[] = []
    for (const subject of subjects) {
      if (await commitCrossColumnMove(subject, {
        ...targetColumn,
        ...(overSubject ? { overSubject } : {}),
      })) movedSubjects.push(subject)
    }
    if (movedSubjects.length === 0 || !persistOrder) return
    const currentSubjects = displayColumns
      .find((column) => column.id === targetColumn.id)
      ?.cardSubjects.filter((subject) => !movedSubjects.includes(subject)) ?? []
    const insertionIndex = overSubject ? currentSubjects.indexOf(overSubject) : currentSubjects.length
    const targetIndex = insertionIndex < 0 ? currentSubjects.length : insertionIndex
    onColumnOrderChange(targetColumn.id, [
      ...currentSubjects.slice(0, targetIndex),
      ...movedSubjects,
      ...currentSubjects.slice(targetIndex),
    ])
  }, [commitCrossColumnMove, displayColumns, onColumnOrderChange, selectedCardSubjects])

  const moveCardByKeyboard = useCallback(async (subject: string, direction: CardKeyboardMoveDirection) => {
    const sourceColumn = sourceColumnForSubject(subject)
    if (!sourceColumn) return
    if (direction === 'up' || direction === 'down') {
      const sourceIndex = sourceColumn.cardSubjects.indexOf(subject)
      const targetIndex = direction === 'up' ? sourceIndex - 1 : sourceIndex + 1
      const overSubject = sourceColumn.cardSubjects[targetIndex]
      if (sourceIndex === -1 || !overSubject) return
      move.reorderColumnSubjects(sourceColumn.id, subject, overSubject)
      return
    }
    const sourceLaneIndex = displayColumnIds.indexOf(sourceColumn.id)
    const targetLaneIndex = direction === 'left' ? sourceLaneIndex - 1 : sourceLaneIndex + 1
    const targetColumn = displayColumns[targetLaneIndex]
    if (!targetColumn) return
    await moveSelectionToColumn(subject, targetColumn)
  }, [displayColumnIds, displayColumns, move, moveSelectionToColumn, sourceColumnForSubject])

  const publishLaneOrder = useCallback((nextLaneOrder: string[]) => {
    if (arraysEqual(nextLaneOrder, displayColumnIds)) return
    onLaneOrderChange?.(nextLaneOrder)
  }, [displayColumnIds, onLaneOrderChange])

  const reorderLaneBefore = useCallback((columnId: string, targetColumnId: string) => {
    if (columnId === targetColumnId) return
    const sourceIndex = displayColumnIds.indexOf(columnId)
    const targetIndex = displayColumnIds.indexOf(targetColumnId)
    if (sourceIndex === -1 || targetIndex === -1) return
    publishLaneOrder(arrayMove(displayColumnIds, sourceIndex, targetIndex))
  }, [displayColumnIds, publishLaneOrder])

  const reorderLaneByKeyboard = useCallback((columnId: string, direction: LaneKeyboardReorderDirection) => {
    const sourceIndex = displayColumnIds.indexOf(columnId)
    if (sourceIndex === -1) return
    const targetIndex = direction === 'left' ? sourceIndex - 1 : sourceIndex + 1
    if (targetIndex < 0 || targetIndex >= displayColumnIds.length) return
    publishLaneOrder(arrayMove(displayColumnIds, sourceIndex, targetIndex))
  }, [displayColumnIds, publishLaneOrder])

  const handleDndDragStart = useCallback((event: DndDragStartEvent) => {
    const activeId = String(event.active.id)
    setActiveDragSubject(parseLaneDndId(activeId) ? null : activeId)
    setActiveDropColumnId(null)
    setActiveDropSubject(null)
  }, [])

  const handleDndDragOver = useCallback((event: DndDragOverEvent) => {
    const activeId = String(event.active.id)
    if (parseLaneDndId(activeId)) {
      setActiveDropColumnId(null)
      setActiveDropSubject(null)
      return
    }
    const overId = event.over ? String(event.over.id) : null
    setActiveDropColumnId(resolveLaneDndTargetId({
      displayColumns,
      overId,
    }))
    setActiveDropSubject(overId && cardBySubject.has(overId) ? overId : null)
  }, [cardBySubject, displayColumns])

  const handleDndDragEnd = useCallback(async (event: DndDragEndEvent) => {
    clearDragState()
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    const activeLaneId = parseLaneDndId(activeId)
    if (activeLaneId) {
      const targetLaneId = resolveLaneDndTargetId({
        displayColumns,
        overId,
      })
      if (targetLaneId) reorderLaneBefore(activeLaneId, targetLaneId)
      return
    }
    const subject = activeId
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
      await moveSelectionToColumn(plan.subject, plan.targetColumn, plan.overSubject, true)
      return
    }
  }, [clearDragState, displayColumns, move, moveSelectionToColumn, reorderLaneBefore])

  const toggleLaneCollapsed = useCallback((columnId: string) => {
    const current = collapsedLaneIdsRef.current
    const next = current.includes(columnId)
      ? current.filter((id) => id !== columnId)
      : [...current, columnId]
    collapsedLaneIdsRef.current = next
    setCollapsedLaneIds(next)
    onCollapsedLaneIdsChange?.(next)
  }, [onCollapsedLaneIdsChange])

  const quickCreateSubject = useCallback(async (columnId: string, subjectDraft: string) => {
    const subject = subjectDraft.trim()
    if (!subject || !onCreateSubject) return false
    const column = columnById.get(columnId) ?? (
      !sourceModel.hasColumns && columnId === 'unassigned'
        ? { id: 'unassigned', value: null }
        : undefined
    )
    if (!column) return false
    return onCreateSubject({ columnId, columnValue: column.value, subject })
  }, [columnById, onCreateSubject, sourceModel.hasColumns])

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
    activeDragCard,
    activeDropColumnId,
    activeDropSubject,
    isLaneDropTarget: (columnId: string) => activeDropColumnId === columnId,
    selectedCardSubject: selectedCardSubjects[selectedCardSubjects.length - 1] ?? null,
    selectedCardSubjects,
    selectedCardCount: selectedCardSubjects.length,
    selectCard,
    isCardSelected,
    collapsedLaneIds,
    isLaneCollapsed: (columnId: string) => collapsedLaneIdSet.has(columnId),
    displayColumns,
    moveTargetColumnsFor,
    pendingMoveViewForSubject: move.pendingMoveViewForSubject,
    retryKanbanMove: move.retryKanbanMove,
    moveCardToColumn,
    moveSelectionToColumn,
    moveCardByKeyboard,
    laneDragIdFor: toLaneDndId,
    reorderLaneByKeyboard,
    toggleLaneCollapsed,
    quickCreateSubject,
    handleDndDragStart,
    handleDndDragOver,
    handleDndDragEnd,
    clearDragState,
  }
}

function orderStructuredKanbanDisplayColumns<T extends { id: string }>(
  columns: readonly T[],
  laneOrder: readonly string[],
): T[] {
  if (laneOrder.length === 0) return [...columns]
  const columnById = new Map(columns.map((column) => [column.id, column]))
  const orderedColumns = laneOrder.flatMap((columnId) => {
    const column = columnById.get(columnId)
    return column ? [column] : []
  })
  const orderedIds = new Set(orderedColumns.map((column) => column.id))
  return [
    ...orderedColumns,
    ...columns.filter((column) => !orderedIds.has(column.id)),
  ]
}

function arraysEqual(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function toLaneDndId(columnId: string) {
  return `${LANE_DND_ID_PREFIX}${columnId}`
}

function parseLaneDndId(id: string) {
  return id.startsWith(LANE_DND_ID_PREFIX) ? id.slice(LANE_DND_ID_PREFIX.length) : null
}

function resolveLaneDndTargetId({
  displayColumns,
  overId,
}: {
  displayColumns: readonly StructuredKanbanDisplayColumn[]
  overId: string | null
}) {
  if (!overId) return null
  const explicitLaneId = parseLaneDndId(overId)
  if (explicitLaneId) return explicitLaneId
  if (displayColumns.some((column) => column.id === overId)) return overId
  const targetColumn = findStructuredKanbanColumnForSubject(displayColumns, overId)
  return targetColumn?.id ?? null
}

function arrayMove<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  if (item === undefined) return next
  next.splice(toIndex, 0, item)
  return next
}
