import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

export function StructuredProjectionSortIcon({
  columnKey,
  sortDirection,
  sortKey,
}: {
  columnKey: string
  sortDirection?: 'asc' | 'desc'
  sortKey?: string | null
}) {
  if (sortKey !== columnKey) {
    return <ArrowUpDown aria-hidden="true" className="h-3 w-3" />
  }
  return sortDirection === 'desc'
    ? <ArrowDown aria-hidden="true" className="h-3 w-3 text-primary" />
    : <ArrowUp aria-hidden="true" className="h-3 w-3 text-primary" />
}
