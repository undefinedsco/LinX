import { flexRender, type Cell, type Header, type Row, type Table } from '@tanstack/react-table'
import { createContext, useContext, type KeyboardEvent, type ReactNode, type TouchEvent } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

/** R6 K6: rows can be dragged by a handle that appears on hover; the caller persists the new order. */
export interface CompactTableRowDnd<TData> {
  getRowId: (row: TData) => string
  onReorder: (activeId: string, overId: string) => void
  /** Reads better for assistive tech than the id: "移动 周禾". */
  getRowLabel?: (row: TData) => string
}

type RowDragHandleBinding = {
  label: string
  attributes: ReturnType<typeof useSortable>['attributes']
  listeners: ReturnType<typeof useSortable>['listeners']
  setActivatorNodeRef: ReturnType<typeof useSortable>['setActivatorNodeRef']
}

const RowDragHandleContext = createContext<RowDragHandleBinding | null>(null)

/** The grip beside a row's first cell. Renders nothing when the table has no row drag. */
export function CompactTableRowDragHandle() {
  const binding = useContext(RowDragHandleContext)
  if (!binding) return null
  return (
    <button
      type="button"
      ref={binding.setActivatorNodeRef}
      aria-label={binding.label}
      data-row-drag-handle="true"
      className="flex h-5 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
      onClick={(event) => event.stopPropagation()}
      {...binding.attributes}
      {...binding.listeners}
    >
      <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  )
}

function SortableTableRow({
  id,
  label,
  className,
  children,
}: {
  id: string
  label: string
  className?: string
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <RowDragHandleContext.Provider value={{ label, attributes, listeners, setActivatorNodeRef }}>
      <tr
        ref={setNodeRef}
        className={cn(className, isDragging && 'relative z-30 bg-background shadow-md')}
        style={{ transform: CSS.Transform.toString(transform), transition }}
      >
        {children}
      </tr>
    </RowDragHandleContext.Provider>
  )
}

type ColumnMeta = {
  label?: string
  resizable?: boolean
  /** Names the cell by its own text when it also holds controls (tick box, drag handle). */
  cellLabel?: (row: never) => string
}

export interface CompactTableShellProps<TData> {
  table: Table<TData>
  sortKey?: string | null
  sortDirection?: 'asc' | 'desc'
  editable?: boolean
  pinnedColumnId?: string
  footerRow?: ReactNode
  rowDnd?: CompactTableRowDnd<TData>
  getRowClassName?: (row: Row<TData>) => string | undefined
  getCellClassName?: (cell: Cell<TData, unknown>, index: number) => string | undefined
  isCellInteractive?: (cell: Cell<TData, unknown>, index: number) => boolean
  onCellActivate?: (row: TData, columnId: string, anchor: HTMLTableCellElement) => void
  onCellKeyDown?: (event: KeyboardEvent<HTMLTableCellElement>, row: TData, columnId: string) => void
  onColumnMouseResize?: (columnId: string, startSize: number, startClientX: number) => void
  onColumnTouchResize?: (columnId: string, startSize: number, startClientX: number) => void
}

function columnMeta<TData>(header: Header<TData, unknown>): ColumnMeta {
  return (header.column.columnDef.meta as ColumnMeta | undefined) ?? {}
}

function cellLabelFor<TData>(cell: Cell<TData, unknown>, row: TData): string | undefined {
  const meta = cell.column.columnDef.meta as ColumnMeta | undefined
  return meta?.cellLabel ? (meta.cellLabel as (row: TData) => string)(row) : undefined
}

export function CompactTableShell<TData>({
  table,
  sortKey,
  sortDirection,
  editable = false,
  pinnedColumnId,
  footerRow,
  rowDnd,
  getRowClassName,
  getCellClassName,
  isCellInteractive,
  onCellActivate,
  onCellKeyDown,
  onColumnMouseResize,
  onColumnTouchResize,
}: CompactTableShellProps<TData>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const rows = table.getRowModel().rows
  const rowIds = rowDnd ? rows.map((row) => rowDnd.getRowId(row.original)) : []
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!rowDnd || !over || active.id === over.id) return
    rowDnd.onReorder(String(active.id), String(over.id))
  }
  const renderRowCells = (row: (typeof rows)[number]) => row.getVisibleCells().map((cell, index) => {
    const interactive = editable && (isCellInteractive?.(cell, index) ?? true)
    const pinned = cell.column.id === pinnedColumnId

    return (
      <td
        key={cell.id}
        aria-label={cellLabelFor(cell, row.original)}
        data-pinned-column={pinned || undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={(event) => {
          if (interactive) {
            onCellActivate?.(row.original, cell.column.id, event.currentTarget)
          }
        }}
        onKeyDown={(event) => {
          if (!interactive) return
          onCellKeyDown?.(event, row.original, cell.column.id)
          if (event.defaultPrevented) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onCellActivate?.(row.original, cell.column.id, event.currentTarget)
          }
        }}
        className={cn(
          'overflow-hidden align-middle',
          index > 0 && 'border-l border-border/5',
          pinned && 'sticky left-0 z-10 bg-background shadow-[1px_0_0_hsl(var(--border)/0.08)]',
          getCellClassName?.(cell, index),
        )}
        style={{ width: `${cell.column.getSize()}px` }}
      >
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </td>
    )
  })
  const body = (
    <tbody>
      {rows.map((row) => (
        rowDnd ? (
          <SortableTableRow
            key={row.id}
            id={rowDnd.getRowId(row.original)}
            label={rowDnd.getRowLabel?.(row.original) ?? '移动这一行'}
            className={cn('group', getRowClassName?.(row))}
          >
            {renderRowCells(row)}
          </SortableTableRow>
        ) : (
          <tr key={row.id} className={cn('group', getRowClassName?.(row))}>
            {renderRowCells(row)}
          </tr>
        )
      ))}
      {footerRow}
    </tbody>
  )
  const tableElement = (
    <div data-compact-table-shell="true" className="w-full overflow-x-auto rounded-sm border border-border/20">
      <table className="min-w-full table-fixed border-collapse text-left text-[11px]" style={{ width: table.getCenterTotalSize() }}>
        <thead className="bg-background/70 text-muted-foreground">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header, index) => {
                const meta = columnMeta(header)
                const pinned = header.column.id === pinnedColumnId
                const ariaSort =
                  sortKey === header.column.id
                    ? sortDirection === 'desc' ? 'descending' : 'ascending'
                    : undefined
                return (
                  <th
                    key={header.id}
                    aria-sort={ariaSort}
                    data-pinned-column={pinned || undefined}
                    className={cn(
                      'relative overflow-hidden border-b border-border/40 px-2 py-1 align-middle font-medium',
                      index > 0 && 'border-l border-border/5',
                      pinned && 'sticky left-0 z-20 bg-background shadow-[1px_0_0_hsl(var(--border)/0.12)]',
                    )}
                    style={{ width: `${header.getSize()}px` }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {meta.resizable ? (
                      <button
                        type="button"
                        role="separator"
                        aria-label={`调整 ${meta.label} 列宽`}
                        aria-orientation="vertical"
                        className="absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none rounded-sm bg-transparent hover:bg-primary/40"
                        onMouseDown={(event) => {
                          event.preventDefault()
                          onColumnMouseResize?.(header.column.id, header.getSize(), event.clientX)
                        }}
                        onTouchStart={(event: TouchEvent<HTMLButtonElement>) => {
                          const touch = event.touches[0]
                          if (!touch) return
                          event.preventDefault()
                          onColumnTouchResize?.(header.column.id, header.getSize(), touch.clientX)
                        }}
                      />
                    ) : null}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        {body}
      </table>
    </div>
  )
  // The drag context sits outside the table so its hidden live region is not a child of <table>.
  return rowDnd ? (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
        {tableElement}
      </SortableContext>
    </DndContext>
  ) : tableElement
}
