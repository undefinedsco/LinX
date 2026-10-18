import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

/** 聊天信息 building blocks: grouped rows on a card, like WeChat's settings pages. */
export function InfoGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-1.5">
      {title ? <h4 className="px-1 text-xs text-muted-foreground">{title}</h4> : null}
      <div className="overflow-hidden rounded-lg border border-border/60 bg-card">{children}</div>
    </section>
  )
}

export function InfoRow({
  label,
  value,
  onClick,
  last,
  tone,
  hint,
}: {
  label: ReactNode
  value?: ReactNode
  onClick?: () => void
  last?: boolean
  tone?: 'danger'
  hint?: string
}) {
  const className = cn(
    'flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm',
    !last && 'border-b border-border/50',
  )
  const content = (
    <>
      <span className={cn('min-w-0 truncate', tone === 'danger' ? 'text-destructive' : 'text-foreground')}>{label}</span>
      <span className="flex min-w-0 shrink-0 items-center gap-1 text-xs text-muted-foreground">
        {value ? <span className="max-w-[160px] truncate">{value}</span> : null}
        {onClick && tone !== 'danger' ? <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
      </span>
    </>
  )
  return onClick
    ? <button type="button" title={hint} className={cn(className, 'hover:bg-muted/40')} onClick={onClick}>{content}</button>
    : <div className={className}>{content}</div>
}

export function InfoSwitchRow({
  label,
  checked,
  onCheckedChange,
  last,
  hint,
  disabled,
}: {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  last?: boolean
  hint?: string
  disabled?: boolean
}) {
  return (
    <div className={cn('px-3 py-2', !last && 'border-b border-border/50')}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground">{label}</span>
        <Switch aria-label={label} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} className="scale-90" />
      </div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
