import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { MoreHorizontal } from 'lucide-react'
import { Fragment, useCallback, useEffect, useRef } from 'react'
import {
  type StructuredCellWriteProposal,
  type StructuredTableProjection,
} from '../../domain/structured/structured-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StructuredKanbanCard } from './StructuredKanbanCard'
import { StructuredKanbanLane } from './StructuredKanbanLane'
import { useStructuredKanbanViewController } from './useStructuredKanbanViewController'

type StructuredSubjectOpenOptions = {
  navigate?: boolean
  rowIndex?: number | null
  scrollTop?: number
}

export function StructuredKanbanView({
  documentUri,
  projection,
  groupPredicate,
  kanbanOrder,
  laneOrder,
  initialCollapsedLaneIds,
  initialScrollLeft,
  onGroupPredicateChange,
  onColumnOrderChange,
  onLaneOrderChange,
  onCollapsedLaneIdsChange,
  onHorizontalScrollLeftChange,
  onCommitCellWriteProposal,
  onCreateSubject,
  onOpenSubject,
}: {
  documentUri: string
  projection: StructuredTableProjection
  groupPredicate: string | null
  kanbanOrder: Record<string, string[]>
  laneOrder?: string[]
  initialCollapsedLaneIds?: string[]
  initialScrollLeft?: number
  onGroupPredicateChange: (predicate: string | null) => void
  onColumnOrderChange: (columnId: string, subjects: string[]) => void
  onLaneOrderChange?: (laneOrder: string[]) => void
  onCollapsedLaneIdsChange?: (collapsedLaneIds: string[]) => void
  onHorizontalScrollLeftChange?: (scrollLeft: number) => void
  onCommitCellWriteProposal?: (proposal: StructuredCellWriteProposal) => boolean | Promise<boolean>
  onCreateSubject?: (input: { columnId: string; columnValue: string | null; subject: string }) => boolean | Promise<boolean>
  onOpenSubject?: (subject: string, options?: StructuredSubjectOpenOptions) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const horizontalBoardRef = useRef<HTMLDivElement | null>(null)
  const horizontalScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const kanban = useStructuredKanbanViewController({
    documentUri,
    projection,
    groupPredicate,
    kanbanOrder,
    laneOrder,
    initialCollapsedLaneIds,
    onColumnOrderChange,
    onLaneOrderChange,
    onCollapsedLaneIdsChange,
    onCommitCellWriteProposal,
    onCreateSubject,
  })
  useEffect(() => {
    const board = horizontalBoardRef.current
    if (!board || typeof initialScrollLeft !== 'number') return
    board.scrollLeft = Math.max(0, Math.round(initialScrollLeft))
  }, [initialScrollLeft])

  useEffect(() => () => {
    if (horizontalScrollTimerRef.current) clearTimeout(horizontalScrollTimerRef.current)
  }, [])

  const handleHorizontalScroll = useCallback(() => {
    if (!onHorizontalScrollLeftChange) return
    if (horizontalScrollTimerRef.current) clearTimeout(horizontalScrollTimerRef.current)
    horizontalScrollTimerRef.current = setTimeout(() => {
      horizontalScrollTimerRef.current = null
      onHorizontalScrollLeftChange(horizontalBoardRef.current?.scrollLeft ?? 0)
    }, 150)
  }, [onHorizontalScrollLeftChange])

  const displayColumns = kanban.hasColumns ? kanban.displayColumns : [{
    id: 'unassigned',
    label: 'Unassigned',
    value: null,
    cards: [],
    cardSubjects: [],
    cardCountLabel: '0',
    ariaLabel: 'Kanban column Unassigned',
  }]

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="min-w-0 truncate text-[11px] text-muted-foreground">
          {kanban.groupLabel}
        </p>
        {kanban.selectedCardCount > 1 ? (
          <span className="text-[11px] text-primary">已选 {kanban.selectedCardCount}</span>
        ) : null}
        {kanban.hasPredicateOptions ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={kanban.chrome.groupPredicateButtonAriaLabel}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                title={kanban.groupTriggerLabel}
              >
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {kanban.predicateOptions.map(({ predicate, label }) => (
                <DropdownMenuItem key={predicate} title={predicate} onSelect={() => onGroupPredicateChange(predicate)}>
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={kanban.handleDndDragStart}
        onDragOver={kanban.handleDndDragOver}
        onDragCancel={kanban.clearDragState}
        onDragEnd={kanban.handleDndDragEnd}
      >
        <div
          ref={horizontalBoardRef}
          className="flex min-w-0 overflow-x-auto pb-2"
          data-kanban-board="horizontal"
          onScroll={handleHorizontalScroll}
        >
          <SortableContext
            items={displayColumns.map((column) => kanban.laneDragIdFor(column.id))}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex min-w-max items-start gap-3">
              {displayColumns.map((column) => (
                <SortableContext key={column.id} items={column.cardSubjects} strategy={verticalListSortingStrategy}>
                  <StructuredKanbanLane
                    column={column}
                    collapsed={kanban.isLaneCollapsed(column.id)}
                    isDropTarget={kanban.isLaneDropTarget(column.id)}
                    showEndDropPlaceholder={kanban.isLaneDropTarget(column.id) && !kanban.activeDropSubject}
                    laneSortableId={kanban.laneDragIdFor(column.id)}
                    onToggleCollapsed={kanban.toggleLaneCollapsed}
                    onKeyboardReorder={kanban.reorderLaneByKeyboard}
                    onQuickCreate={onCreateSubject ? kanban.quickCreateSubject : undefined}
                  >
                    {column.cards.map((card) => (
                      <Fragment key={card.subject}>
                        {kanban.activeDropSubject === card.subject ? (
                          <div
                            aria-label={`将卡片放到 ${card.title} 前`}
                            className="h-1 rounded-full bg-primary/60"
                            data-kanban-drop-placeholder="true"
                            data-kanban-drop-before={card.subject}
                          />
                        ) : null}
                        <StructuredKanbanCard
                        card={card}
                        columns={kanban.moveTargetColumnsFor(column.id)}
                        canMove={kanban.canMoveCardsInColumn(column.id)}
                        pendingMove={kanban.pendingMoveViewForSubject(card.subject)}
                        selected={kanban.isCardSelected(card.subject)}
                        selectionCount={kanban.selectedCardCount}
                        onMove={kanban.canCommitCrossColumnMoves ? (column) => void kanban.moveSelectionToColumn(card.subject, column) : undefined}
                        onRetryMove={kanban.pendingMoveViewForSubject(card.subject)?.retryable
                          ? () => void kanban.retryKanbanMove(card.subject)
                          : undefined}
                        onKeyboardMove={(direction) => void kanban.moveCardByKeyboard(card.subject, direction)}
                        onSelect={(card, options) => kanban.selectCard(card.subject, options)}
                        onOpen={(card, options) => onOpenSubject?.(card.subject, options)}
                        />
                      </Fragment>
                    ))}
                  </StructuredKanbanLane>
                </SortableContext>
              ))}
            </div>
          </SortableContext>
        </div>
        <DragOverlay>
          {kanban.activeDragCard ? (
            <StructuredKanbanCard
              card={kanban.activeDragCard}
              canMove={false}
              overlay
              pendingMove={kanban.pendingMoveViewForSubject(kanban.activeDragCard.subject)}
              selected={kanban.isCardSelected(kanban.activeDragCard.subject)}
              onOpen={(card, options) => onOpenSubject?.(card.subject, options)}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
