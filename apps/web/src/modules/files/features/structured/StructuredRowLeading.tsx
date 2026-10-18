import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { CompactTableRowDragHandle } from '../../ui/CompactTableShell'

/**
 * R6 K6: what appears at the start of a row on hover: the drag handle and the tick box. The tick box
 * stays visible once the row is selected.
 */
export function StructuredRowLeading({
  label,
  selected,
  selectable,
  onToggleSelected,
  children,
}: {
  label: string
  selected: boolean
  selectable: boolean
  onToggleSelected: () => void
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <CompactTableRowDragHandle />
      {selectable ? (
        <input
          type="checkbox"
          aria-label={`选择 ${label}`}
          checked={selected}
          data-row-select="true"
          className={cn(
            'h-3.5 w-3.5 shrink-0 cursor-pointer accent-primary transition-opacity focus-visible:opacity-100 group-hover:opacity-100',
            selected ? 'opacity-100' : 'opacity-0',
          )}
          onClick={(event) => event.stopPropagation()}
          onChange={onToggleSelected}
        />
      ) : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
