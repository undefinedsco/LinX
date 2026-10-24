import { X } from 'lucide-react'

import type { StructuredColumnFilterChip } from './structured-column-filter-model'

/** The filters in force, one removable chip each, right under the toolbar. */
export function StructuredColumnFilterChips({
  chips,
  onClear,
  onRemove,
}: {
  chips: readonly StructuredColumnFilterChip[]
  onClear: () => void
  onRemove: (predicate: string) => void
}) {
  if (chips.length === 0) return null
  return (
    <div
      aria-label="已用的筛选"
      data-column-filter-chips="true"
      className="flex flex-wrap items-center gap-1.5 border-b border-border/30 px-1 py-1.5"
    >
      {chips.map((chip) => (
        <span
          key={chip.predicate}
          data-column-filter-chip={chip.predicate}
          className="inline-flex h-6 max-w-full items-center gap-1 rounded-md bg-muted pl-2 pr-1 text-xs text-foreground"
        >
          <span className="truncate">{chip.text}</span>
          <button
            type="button"
            aria-label={chip.removeLabel}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
            onClick={() => onRemove(chip.predicate)}
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      {chips.length > 1 ? (
        <button
          type="button"
          className="h-6 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          onClick={onClear}
        >
          清除全部
        </button>
      ) : null}
    </div>
  )
}
