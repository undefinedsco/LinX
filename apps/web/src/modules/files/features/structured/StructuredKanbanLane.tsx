import { type HTMLAttributes, type KeyboardEvent, type ReactNode, useCallback, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronRight, GripVertical, Plus } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { StructuredKanbanDisplayColumn } from './structured-kanban-view-model'

export function StructuredKanbanLane({
  column,
  collapsed,
  isDropTarget,
  showEndDropPlaceholder = isDropTarget,
  children,
  laneSortableId,
  onToggleCollapsed,
  onKeyboardReorder,
  onQuickCreate,
  ...dropProps
}: {
  column: StructuredKanbanDisplayColumn
  collapsed: boolean
  isDropTarget: boolean
  showEndDropPlaceholder?: boolean
  children?: ReactNode
  laneSortableId?: string
  onToggleCollapsed: (columnId: string) => void
  onKeyboardReorder?: (columnId: string, direction: 'left' | 'right') => void
  onQuickCreate?: (columnId: string, subject: string) => void | Promise<unknown>
} & HTMLAttributes<HTMLElement>) {
  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({ id: column.id })
  const {
    attributes,
    listeners,
    setNodeRef: setSortableNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: laneSortableId ?? `lane:${column.id}` })
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [creatingError, setCreatingError] = useState<string | null>(null)
  const [creatingSaving, setCreatingSaving] = useState(false)
  const setNodeRef = useCallback((node: HTMLElement | null) => {
    setDropNodeRef(node)
    setSortableNodeRef(node)
  }, [setDropNodeRef, setSortableNodeRef])
  const style = {
    ...dropProps.style,
    transform: CSS.Transform.toString(transform),
    transition,
  }
  const commitDraft = async () => {
    const title = draft.trim()
    if (!title || !onQuickCreate || creatingSaving) return
    setCreatingError(null)
    setCreatingSaving(true)
    try {
      const created = await onQuickCreate(column.id, title)
      if (created === false) {
        setCreatingError('创建失败，请重试')
        return
      }
      setDraft('')
      setCreating(false)
    } catch {
      setCreatingError('创建失败，请重试')
    } finally {
      setCreatingSaving(false)
    }
  }
  const cancelDraft = () => {
    setDraft('')
    setCreatingError(null)
    setCreating(false)
  }
  const handleDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void commitDraft()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelDraft()
    }
  }
  const handleReorderKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      event.stopPropagation()
      onKeyboardReorder?.(column.id, event.key === 'ArrowLeft' ? 'left' : 'right')
      return
    }
    listeners?.onKeyDown?.(event)
  }

  return (
    <section
      ref={setNodeRef}
      {...dropProps}
      style={style}
      aria-label={column.ariaLabel}
      className={cn(
        collapsed ? 'w-14' : 'w-72',
        'max-h-[calc(100vh-18rem)] shrink-0 overflow-hidden rounded-md border border-border/40 bg-muted/20 transition-colors',
        (isDropTarget || isOver) && 'border-primary/50 bg-primary/5',
        isDragging && 'opacity-70',
        dropProps.className,
      )}
      data-kanban-column={column.id}
      data-dnd-kit-droppable="true"
      data-lane-collapsed={collapsed ? 'true' : 'false'}
      data-lane-width={collapsed ? '56' : '288'}
      data-drop-target={isDropTarget || isOver ? 'true' : 'false'}
    >
      <div className="sticky top-0 z-10 flex min-h-10 items-center justify-between gap-2 border-b border-border/40 bg-background/95 px-2 py-1.5">
        <button
          type="button"
          aria-label={`Reorder lane ${column.label}`}
          title={`Reorder lane ${column.label}`}
          className="inline-flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
          data-kanban-lane-handle="true"
          {...attributes}
          {...listeners}
          onKeyDown={handleReorderKeyDown}
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={collapsed ? `展开 ${column.label}` : `折叠 ${column.label}`}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => onToggleCollapsed(column.id)}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <p className={cn('min-w-0 flex-1 truncate text-xs font-medium text-foreground/80', collapsed && 'sr-only')}>
          {column.label}
        </p>
        <span className="shrink-0 text-[10px] text-muted-foreground">{column.cardCountLabel}</span>
      </div>
      {collapsed ? null : (
        <div className="max-h-[calc(100vh-20.5rem)] space-y-2 overflow-y-auto p-2">
          {children}
          {showEndDropPlaceholder || (isOver && !isDropTarget) ? (
            <div
              aria-label={`将卡片放入 ${column.label}`}
              className="h-10 rounded-md border border-dashed border-primary/50 bg-primary/5"
              data-kanban-drop-placeholder="true"
            />
          ) : null}
          {creating ? (
            <div className="space-y-1">
              <input
                autoFocus
                aria-label={`Subject title for ${column.label}`}
                aria-invalid={creatingError ? 'true' : undefined}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                value={draft}
                disabled={creatingSaving}
                onChange={(event) => {
                  setDraft(event.target.value)
                  setCreatingError(null)
                }}
                onKeyDown={handleDraftKeyDown}
                onBlur={() => {
                  if (!draft.trim() && !creatingSaving) cancelDraft()
                }}
              />
              {creatingError ? <p className="text-[10px] text-destructive">{creatingError}</p> : null}
            </div>
          ) : onQuickCreate ? (
            <button
              type="button"
              aria-label={`添加 Subject 到 ${column.label}`}
              className="flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Subject
            </button>
          ) : null}
        </div>
      )}
    </section>
  )
}
