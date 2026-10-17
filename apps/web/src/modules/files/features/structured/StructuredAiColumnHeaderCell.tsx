import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { StructuredPredicateTypeIcon } from './StructuredTableCellPrimitives'
import type { StructuredAiColumnHeaderChrome } from './structured-ai-column-header-model'

/** Header of a column LinX added (R6 K6b): dashed with 未确认 until kept, or ordinary with a way back. */
export function StructuredAiColumnHeaderCell({
  chrome,
  displayLabel,
  type,
  onConfirm,
  onRemove,
}: {
  chrome: StructuredAiColumnHeaderChrome
  displayLabel: string
  type: string
  onConfirm: () => void
  onRemove: () => void
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex min-w-0 items-center gap-1 rounded px-1 hover:text-foreground',
            chrome.dashed ? 'border border-dashed border-muted-foreground/50' : 'border border-transparent',
          )}
          data-unconfirmed-column={chrome.dashed ? 'true' : undefined}
          data-ai-column="true"
          title={displayLabel}
          aria-label={chrome.ariaLabel}
        >
          <StructuredPredicateTypeIcon typeLabel={type} />
          <span className="min-w-0 truncate">{displayLabel}</span>
          {chrome.tag ? (
            <span aria-hidden="true" className="shrink-0 text-[10px] text-muted-foreground">{chrome.tag}</span>
          ) : (
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{chrome.note}</p>
        <DropdownMenuItem onSelect={onConfirm}>{chrome.confirmLabel}</DropdownMenuItem>
        <DropdownMenuItem onSelect={onRemove}>{chrome.removeLabel}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
