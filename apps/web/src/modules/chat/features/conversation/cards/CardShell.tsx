import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** The frame every message card shares. */
export function CardShell({
  icon,
  children,
  tone = 'default',
  label,
}: {
  icon?: ReactNode
  children: ReactNode
  tone?: 'default' | 'quiet' | 'warning'
  label: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'w-full max-w-[440px] rounded-lg border p-3 text-sm',
        tone === 'quiet' && 'border-border bg-muted/50 text-muted-foreground',
        tone === 'default' && 'border-primary/25 bg-card text-foreground shadow-sm',
        tone === 'warning' && 'border-destructive/30 bg-card text-foreground',
      )}
    >
      <div className="flex items-start gap-2">
        {icon ? <span className="mt-0.5 shrink-0 text-primary" aria-hidden="true">{icon}</span> : null}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}

/** Shown when the resource a card points at cannot be read; never the old message text. */
export function CardUnavailable({ label, reason }: { label: string; reason: string }) {
  return (
    <CardShell tone="quiet" label={label}>
      <p className="text-xs">{reason}</p>
    </CardShell>
  )
}
