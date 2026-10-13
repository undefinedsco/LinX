import { Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useInboxAutoJudgeSweep } from '../../data/auto-judge'
import { useInboxSummary } from '../../data/collections'

export interface InboxRailButtonProps {
  active: boolean
  onOpen: () => void
  className?: string
}

/**
 * Rail entry for the inbox: an icon with the number of things waiting on the
 * person. Audit history does not count; it lives behind "活动记录".
 */
export function InboxRailButton({ active, onOpen, className }: InboxRailButtonProps) {
  const { pending } = useInboxSummary()
  useInboxAutoJudgeSweep()
  const label = pending > 0 ? `收件箱，${pending} 项待处理` : '收件箱'

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('relative h-9 w-9 rounded-md transition-all duration-200', className)}
      onClick={onOpen}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      title="收件箱"
    >
      <Inbox size={22} strokeWidth={active ? 2 : 1.5} aria-hidden="true" />
      {pending > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground"
        >
          {pending > 99 ? '99+' : pending}
        </span>
      ) : null}
    </Button>
  )
}
