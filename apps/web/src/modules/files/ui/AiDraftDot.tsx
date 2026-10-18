import { cn } from '@/lib/utils'

export const AI_DRAFT_HINT = 'LinX 改了，还没确认'

/**
 * R6 K10: the small purple dot beside a file LinX changed and nobody has confirmed yet. It only
 * marks the file in lists (no nagging, no expiry); the draft itself is handled in the card dialog.
 * `showText` adds the words next to the dot where a row has room.
 */
export function AiDraftDot({ showText = false, className }: { showText?: boolean; className?: string }) {
  return (
    <span
      data-ai-draft-dot="true"
      title={AI_DRAFT_HINT}
      className={cn('inline-flex shrink-0 items-center gap-1 text-[10px] text-primary', className)}
    >
      <span role="img" aria-label={AI_DRAFT_HINT} className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
      {showText ? <span className="truncate">{AI_DRAFT_HINT}</span> : null}
    </span>
  )
}
