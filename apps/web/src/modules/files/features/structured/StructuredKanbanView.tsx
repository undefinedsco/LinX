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
import { Check, MoreHorizontal } from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  type StructuredCellCommitResult, type StructuredCellWriteProposal,
  type StructuredTableProjection,
} from '../../domain/structured/structured-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { localPredicateLabel } from '../../domain/structured/structured-table-vocab'
import { buildKanbanCardFactLines } from './structured-kanban-view-model'
import { StructuredKanbanAddLane } from './StructuredKanbanAddLane'
import { StructuredSaveLine } from './StructuredSaveLine'
import { useStructuredSaveTracker } from './useStructuredSaveTracker'
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
  extraLanes,
  laneLabels,
  cardFields,
  predicateLabel = localPredicateLabel,
  optionPredicates = [],
  onBoardChange,
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
  /** K6d: lanes added by hand, display names for lanes, and the properties shown on cards. */
  extraLanes?: string[]
  laneLabels?: Record<string, string>
  cardFields?: string[]
  /** The name shown for a property (its vocab label); defaults to the readable local name. */
  predicateLabel?: (predicate: string) => string
  /** Option properties, listed first in the grouping menu: a board splits lanes by an option. */
  optionPredicates?: readonly string[]
  onBoardChange?: (patch: { extraLanes?: string[]; laneLabels?: Record<string, string>; cardFields?: string[] }) => void
  onGroupPredicateChange: (predicate: string | null) => void
  onColumnOrderChange: (columnId: string, subjects: string[]) => void
  onLaneOrderChange?: (laneOrder: string[]) => void
  onCollapsedLaneIdsChange?: (collapsedLaneIds: string[]) => void
  onHorizontalScrollLeftChange?: (scrollLeft: number) => void
  onCommitCellWriteProposal?: (proposal: StructuredCellWriteProposal) => StructuredCellCommitResult | Promise<StructuredCellCommitResult>
  onCreateSubject?: (input: { columnId: string; columnValue: string | null; subject: string }) => boolean | Promise<boolean>
  onOpenSubject?: (subject: string, options?: StructuredSubjectOpenOptions) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const horizontalBoardRef = useRef<HTMLDivElement | null>(null)
  const horizontalScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveTracker = useStructuredSaveTracker()
  const trackedCommit = useMemo(() => (
    onCommitCellWriteProposal
      ? (proposal: StructuredCellWriteProposal) => saveTracker.track(() => onCommitCellWriteProposal(proposal), proposal)
      : undefined
  ), [onCommitCellWriteProposal, saveTracker])
  const trackedCreate = useMemo(() => (
    onCreateSubject
      ? (input: { columnId: string; columnValue: string | null; subject: string }) => saveTracker.trackCreate(() => onCreateSubject(input))
      : undefined
  ), [onCreateSubject, saveTracker])
  const kanban = useStructuredKanbanViewController({
    documentUri,
    projection,
    groupPredicate,
    kanbanOrder,
    laneOrder,
    initialCollapsedLaneIds,
    extraLanes,
    laneLabels,
    onColumnOrderChange,
    onLaneOrderChange,
    onCollapsedLaneIdsChange,
    onCommitCellWriteProposal: trackedCommit,
    onCreateSubject: trackedCreate,
  })
  const cardFieldList = useMemo(() => cardFields ?? [], [cardFields])
  const factsBySubject = useMemo(
    () => buildKanbanCardFactLines(projection.rows, cardFieldList, predicateLabel),
    [cardFieldList, predicateLabel, projection.rows],
  )
  const groupOptions = useMemo(() => {
    const options = kanban.predicateOptions.map(({ predicate }) => ({ predicate, label: predicateLabel(predicate) }))
    return {
      option: options.filter(({ predicate }) => optionPredicates.includes(predicate)),
      other: options.filter(({ predicate }) => !optionPredicates.includes(predicate)),
    }
  }, [kanban.predicateOptions, optionPredicates, predicateLabel])
  const groupLabel = groupPredicate ? `按“${predicateLabel(groupPredicate)}”分组` : kanban.groupLabel
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
    label: '未分组',
    value: null,
    cards: [],
    cardSubjects: [],
    cardCountLabel: '0',
    ariaLabel: '看板列 未分组',
  }]

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="min-w-0 truncate text-[11px] text-muted-foreground">
          {groupLabel}
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
                title={groupPredicate ? predicateLabel(groupPredicate) : kanban.groupTriggerLabel}
              >
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">分组依据</DropdownMenuLabel>
              {[...groupOptions.option, ...groupOptions.other].map(({ predicate, label }, index) => (
                <Fragment key={predicate}>
                  {index === groupOptions.option.length && index > 0 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem onSelect={() => onGroupPredicateChange(predicate)}>
                    <span className="flex-1">{label}</span>
                    {predicate === groupPredicate ? <Check className="ml-2 h-3.5 w-3.5" aria-hidden="true" /> : null}
                  </DropdownMenuItem>
                </Fragment>
              ))}
              {groupPredicate ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => onGroupPredicateChange(null)}>不分组</DropdownMenuItem>
                </>
              ) : null}
              {onBoardChange ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">卡片上显示</DropdownMenuLabel>
                  {groupOptions.option.concat(groupOptions.other).map(({ predicate, label }) => (
                    <DropdownMenuCheckboxItem
                      key={`field:${predicate}`}
                      checked={cardFieldList.includes(predicate)}
                      onSelect={(event) => event.preventDefault()}
                      onCheckedChange={(checked) => onBoardChange({
                        cardFields: checked ? [...cardFieldList, predicate] : cardFieldList.filter((field) => field !== predicate),
                      })}
                    >
                      {label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <span className="ml-auto" />
        <StructuredSaveLine state={saveTracker.state} onRetry={saveTracker.retry} />
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
                    onRename={onBoardChange && column.id !== 'unassigned' ? (columnId, label) => onBoardChange({ laneLabels: { ...(laneLabels ?? {}), [columnId]: label } }) : undefined}
                    onRemove={onBoardChange && (extraLanes ?? []).includes(column.id)
                      ? (columnId) => onBoardChange({ extraLanes: (extraLanes ?? []).filter((lane) => lane !== columnId) })
                      : undefined}
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
                        extraFacts={factsBySubject.get(card.subject)}
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
              {onBoardChange && groupPredicate ? (
                <StructuredKanbanAddLane
                  takenIds={kanban.displayColumns.map((column) => column.id)}
                  onAdd={(name) => onBoardChange({ extraLanes: [...(extraLanes ?? []), name] })}
                />
              ) : null}
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
