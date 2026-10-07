import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

export type FilesListColumnSortDirection = 'asc' | 'desc'

export type FilesListColumnHeaderColumn<TColumnId extends string = string> = {
  id: TColumnId
  label: string
  className?: string
}

export interface FilesListColumnHeaderProps<TColumnId extends string = string> {
  columns: readonly FilesListColumnHeaderColumn<TColumnId>[]
  sortKey: TColumnId
  sortDirection: FilesListColumnSortDirection
  onSort: (columnId: TColumnId) => void
}

export function FilesListColumnHeader<TColumnId extends string = string>({
  columns,
  sortKey,
  sortDirection,
  onSort,
}: FilesListColumnHeaderProps<TColumnId>) {
  const SortIcon = ({ columnId }: { columnId: TColumnId }) => {
    if (sortKey !== columnId) return <ArrowUpDown className="w-3 h-3" />
    return sortDirection === 'asc'
      ? <ArrowUp className="w-3 h-3 text-primary" />
      : <ArrowDown className="w-3 h-3 text-primary" />
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 text-xs text-muted-foreground shrink-0">
      <span className="w-5" />
      {columns.map((column) => (
        <button key={column.id} onClick={() => onSort(column.id)} className={column.className}>
          {column.label} <SortIcon columnId={column.id} />
        </button>
      ))}
    </div>
  )
}
