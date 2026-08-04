import { MoreHorizontal, RotateCcw } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { StructuredSubjectCard } from '../../ui/StructuredSubjectCard'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { StructuredKanbanPendingMoveView } from './structured-kanban-move-model'
import type {
  StructuredKanbanCardView,
  StructuredKanbanMoveTargetColumn,
} from './structured-kanban-view-model'
import type { CardKeyboardMoveDirection } from './useStructuredKanbanViewController'

type StructuredSubjectOpenOptions = {
  navigate?: boolean
  rowIndex?: number | null
  scrollTop?: number
}

function cardFacts(card: StructuredKanbanCardView, pendingMove?: StructuredKanbanPendingMoveView) {
  return [
    ...card.visibleTags.map((tag) => ({ id: `tag:${tag}`, label: tag })),
    ...(pendingMove ? [{ id: `pending:${pendingMove.predicate}`, label: pendingMove.label }] : []),
  ]
}

export function StructuredKanbanCard({
  card,
  columns = [],
  canMove,
  pendingMove,
  overlay = false,
  selected = false,
  selectionCount = 1,
  onMove,
  onRetryMove,
  onKeyboardMove,
  onSelect,
  onOpen,
}: {
  card: StructuredKanbanCardView
  columns?: StructuredKanbanMoveTargetColumn[]
  canMove: boolean
  pendingMove?: StructuredKanbanPendingMoveView
  overlay?: boolean
  selected?: boolean
  selectionCount?: number
  onMove?: (column: StructuredKanbanMoveTargetColumn) => void
  onRetryMove?: () => void
  onKeyboardMove?: (direction: CardKeyboardMoveDirection) => void
  onSelect?: (card: StructuredKanbanCardView, options: { extend: boolean }) => void
  onOpen?: (card: StructuredKanbanCardView, options?: StructuredSubjectOpenOptions) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.subject,
    disabled: overlay,
  })
  const style = overlay
    ? undefined
    : {
      transform: CSS.Transform.toString(transform),
      transition,
    }

  const moveAction = canMove && onMove && !overlay ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={card.moveButtonAriaLabel}
          data-structured-card-action="true"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onKeyboardMove ? (
          <>
            <DropdownMenuItem onSelect={() => onKeyboardMove('up')}>上移</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onKeyboardMove('down')}>下移</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onKeyboardMove('left')}>左移</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onKeyboardMove('right')}>右移</DropdownMenuItem>
            {columns.length > 0 ? <DropdownMenuSeparator /> : null}
          </>
        ) : null}
        {columns.map((column) => (
          <DropdownMenuItem key={column.id} onSelect={() => onMove(column)}>
            {selected && selectionCount > 1 ? `移动 ${selectionCount} 张到 ${column.label}` : column.moveMenuItemLabel}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null
  const retryAction = pendingMove?.retryable && onRetryMove && !overlay ? (
    <button
      type="button"
      aria-label={`重试移动 ${card.subject}`}
      title="重试移动"
      data-structured-card-action="true"
      className="inline-flex h-6 w-6 items-center justify-center rounded text-destructive hover:bg-destructive/10"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onRetryMove()
      }}
    >
      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  ) : null
  const action = moveAction || retryAction ? <>{retryAction}{moveAction}</> : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-kanban-card-subject={card.subject}
      data-dnd-kit-sortable="true"
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      aria-label={overlay ? undefined : `拖动 ${card.title}`}
      onKeyDownCapture={(event) => {
        if (!event.altKey || !onKeyboardMove) return
        const direction = ({
          ArrowUp: 'up',
          ArrowDown: 'down',
          ArrowLeft: 'left',
          ArrowRight: 'right',
        } as const)[event.key]
        if (!direction) return
        event.preventDefault()
        event.stopPropagation()
        onKeyboardMove(direction)
      }}
    >
      <StructuredSubjectCard
        model={{
          subject: card.subject,
          title: card.title,
          summary: card.summary,
          classLabel: card.className,
          facts: cardFacts(card, pendingMove),
          pending: Boolean(pendingMove && !pendingMove.retryable),
          errorLabel: pendingMove?.retryable ? pendingMove.statusLabel : undefined,
        }}
        selected={selected}
        dragging={isDragging || overlay}
        action={action}
        onSelect={(_subject, options) => onSelect?.(card, options)}
        onOpen={(_subject, options) => onOpen?.(card, options)}
      />
    </div>
  )
}
