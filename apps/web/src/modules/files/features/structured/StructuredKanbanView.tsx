import { useRef, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { DndContext, closestCenter, useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
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
import type { StructuredKanbanPendingMoveView } from './structured-kanban-move-model'
import type {
  StructuredKanbanCardView,
  StructuredKanbanDisplayColumn,
  StructuredKanbanMoveTargetColumn,
} from './structured-kanban-view-model'
import { useStructuredKanbanViewController } from './useStructuredKanbanViewController'

type StructuredSubjectOpenOptions = {
  navigate?: boolean
  rowIndex?: number | null
  scrollTop?: number
}

function StructuredCard({
  card,
  columns = [],
  canMove,
  pendingMove,
  onMove,
  onOpen,
  onDragStart,
  onDragEnd,
  onNativeDropOnCard,
}: {
  card: StructuredKanbanCardView
  columns?: StructuredKanbanMoveTargetColumn[]
  canMove: boolean
  pendingMove?: StructuredKanbanPendingMoveView
  onMove?: (column: StructuredKanbanMoveTargetColumn) => void
  onOpen?: (card: StructuredKanbanCardView, options?: StructuredSubjectOpenOptions) => void
  onDragStart?: (event: DragEvent<HTMLDivElement>, card: StructuredKanbanCardView) => void
  onDragEnd?: () => void
  onNativeDropOnCard?: (event: DragEvent<HTMLDivElement>, card: StructuredKanbanCardView) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.subject })
  const suppressNextOpenRef = useRef(false)
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  const openFromCardSurface = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (suppressNextOpenRef.current) {
      suppressNextOpenRef.current = false
      return
    }
    if ((event.target as HTMLElement).closest('[data-kanban-card-action="true"]')) return
    onOpen?.(card)
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-md border border-border/40 bg-background px-3 py-2 text-xs shadow-sm',
        onDragStart && 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-70',
      )}
      style={style}
      data-kanban-card-subject={card.subject}
      data-dnd-kit-sortable="true"
      aria-label={card.openAriaLabel}
      draggable={Boolean(onDragStart)}
      {...attributes}
      {...listeners}
      onClick={openFromCardSurface}
      onDoubleClick={(event) => {
        event.preventDefault()
        onOpen?.(card, { navigate: true })
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          onOpen?.(card, { navigate: true })
          return
        }
        if (event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault()
          onOpen?.(card)
        }
      }}
      onDragStart={(event) => {
        suppressNextOpenRef.current = true
        onDragStart?.(event, card)
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (!onNativeDropOnCard) return
        event.preventDefault()
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => onNativeDropOnCard?.(event, card)}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 truncate font-medium text-foreground/85">{card.title}</p>
        {canMove && onMove ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={card.moveButtonAriaLabel}
                data-kanban-card-action="true"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onPointerDown={(event) => {
                  suppressNextOpenRef.current = true
                  event.stopPropagation()
                }}
                onClick={(event) => {
                  suppressNextOpenRef.current = true
                  event.stopPropagation()
                }}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {columns.map((column) => (
                <DropdownMenuItem
                  key={column.id}
                  onSelect={() => {
                    suppressNextOpenRef.current = true
                    onMove(column)
                  }}
                >
                  {column.moveMenuItemLabel}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{card.summary}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {card.className ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{card.className}</span> : null}
        {card.visibleTags.map((tag) => (
          <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
        ))}
        {pendingMove ? (
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700">
            {pendingMove.label}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function StructuredKanbanColumnLane({
  column,
  isNativeDragOver,
  children,
  onNativeDragOver,
  onNativeDragLeave,
  onNativeDrop,
}: {
  column: StructuredKanbanDisplayColumn
  isNativeDragOver: boolean
  children: ReactNode
  onNativeDragOver: (event: DragEvent<HTMLElement>) => void
  onNativeDragLeave: (event: DragEvent<HTMLElement>) => void
  onNativeDrop: (event: DragEvent<HTMLElement>) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <section
      ref={setNodeRef}
      aria-label={column.ariaLabel}
      className={cn(
        'rounded-lg border border-border/40 bg-muted/20 p-2 transition-colors',
        (isNativeDragOver || isOver) && 'border-primary/50 bg-primary/5',
      )}
      data-kanban-column={column.id}
      data-dnd-kit-droppable="true"
      onDragOver={onNativeDragOver}
      onDragLeave={onNativeDragLeave}
      onDrop={onNativeDrop}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-foreground/80">{column.label}</p>
        <span className="text-[10px] text-muted-foreground">{column.cardCountLabel}</span>
      </div>
      <div className="space-y-2">
        {children}
      </div>
    </section>
  )
}

export function StructuredKanbanView({
  documentUri,
  projection,
  groupPredicate,
  kanbanOrder,
  onGroupPredicateChange,
  onColumnOrderChange,
  onCommitCellWriteProposal,
  onOpenSubject,
}: {
  documentUri: string
  projection: StructuredTableProjection
  groupPredicate: string | null
  kanbanOrder: Record<string, string[]>
  onGroupPredicateChange: (predicate: string | null) => void
  onColumnOrderChange: (columnId: string, subjects: string[]) => void
  onCommitCellWriteProposal?: (proposal: StructuredCellWriteProposal) => boolean | Promise<boolean>
  onOpenSubject?: (subject: string, options?: StructuredSubjectOpenOptions) => void
}) {
  const kanban = useStructuredKanbanViewController({
    documentUri,
    projection,
    groupPredicate,
    kanbanOrder,
    onColumnOrderChange,
    onCommitCellWriteProposal,
  })

  if (!kanban.hasColumns) {
    return <div className="rounded-md border border-border/40 px-3 py-2 text-xs text-muted-foreground">{kanban.chrome.emptyStateMessage}</div>
  }

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="min-w-0 truncate text-[11px] text-muted-foreground">
          {kanban.groupLabel}
        </p>
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
      <DndContext collisionDetection={closestCenter} onDragEnd={kanban.handleDndDragEnd}>
        <div className="grid gap-3 md:grid-cols-3">
          {kanban.displayColumns.map((column) => (
            <SortableContext key={column.id} items={column.cardSubjects} strategy={verticalListSortingStrategy}>
              <StructuredKanbanColumnLane
                column={column}
                isNativeDragOver={kanban.isColumnNativeDragOver(column.id)}
                onNativeDragOver={(event) => kanban.handleColumnDragOver(event, column)}
                onNativeDragLeave={(event) => kanban.handleColumnDragLeave(event, column)}
                onNativeDrop={(event) => void kanban.handleColumnDrop(event, column)}
              >
                {column.cards.map((card) => (
                  <StructuredCard
                    key={card.subject}
                    card={card}
                    columns={kanban.moveTargetColumnsFor(column.id)}
                    canMove={kanban.canMoveCardsInColumn(column.id)}
                    pendingMove={kanban.pendingMoveViewForSubject(card.subject)}
                    onMove={kanban.canCommitCrossColumnMoves ? (column) => void kanban.moveCardToColumn(card, column) : undefined}
                    onOpen={(card, options) => onOpenSubject?.(card.subject, options)}
                    onDragStart={kanban.handleCardDragStart}
                    onDragEnd={kanban.clearNativeDragState}
                    onNativeDropOnCard={(event, card) => void kanban.handleCardDrop(event, card)}
                  />
                ))}
              </StructuredKanbanColumnLane>
            </SortableContext>
          ))}
        </div>
      </DndContext>
    </div>
  )
}
