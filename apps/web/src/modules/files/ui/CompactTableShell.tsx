import { flexRender, type Cell, type Header, type Row, type Table } from '@tanstack/react-table'
import type { KeyboardEvent, ReactNode, TouchEvent } from 'react'
import { cn } from '@/lib/utils'

type ColumnMeta = {
  label?: string
  resizable?: boolean
}

export interface CompactTableShellProps<TData> {
  table: Table<TData>
  sortKey?: string | null
  sortDirection?: 'asc' | 'desc'
  editable?: boolean
  footerRow?: ReactNode
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

export function CompactTableShell<TData>({
  table,
  sortKey,
  sortDirection,
  editable = false,
  footerRow,
  getRowClassName,
  getCellClassName,
  isCellInteractive,
  onCellActivate,
  onCellKeyDown,
  onColumnMouseResize,
  onColumnTouchResize,
}: CompactTableShellProps<TData>) {
  return (
    <div data-compact-table-shell="true" className="w-full overflow-x-auto rounded-sm border border-border/20">
      <table className="min-w-full border-collapse text-left text-[11px]" style={{ width: table.getCenterTotalSize() }}>
        <thead className="bg-background/70 text-muted-foreground">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header, index) => {
                const meta = columnMeta(header)
                const ariaSort =
                  sortKey === header.column.id
                    ? sortDirection === 'desc' ? 'descending' : 'ascending'
                    : undefined
                return (
                  <th
                    key={header.id}
                    aria-sort={ariaSort}
                    className={cn(
                      'relative border-b border-border/40 px-2 py-1 align-middle font-medium',
                      index > 0 && 'border-l border-border/5',
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
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className={getRowClassName?.(row)}>
              {row.getVisibleCells().map((cell, index) => {
                const interactive = editable && (isCellInteractive?.(cell, index) ?? true)

                return (
                  <td
                    key={cell.id}
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
                      'align-middle',
                      index > 0 && 'border-l border-border/5',
                      getCellClassName?.(cell, index),
                    )}
                    style={{ width: `${cell.column.getSize()}px` }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                )
              })}
            </tr>
          ))}
          {footerRow}
        </tbody>
      </table>
    </div>
  )
}
