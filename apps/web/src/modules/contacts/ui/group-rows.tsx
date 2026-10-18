import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Rounded group of rows used across the contact detail (W5). */
export function GroupCard({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-xl border border-border bg-card">{children}</div>
}

export function GroupRow({ label, children, onClick }: {
  label: string
  children?: ReactNode
  onClick?: () => void
}) {
  const className = cn(
    'flex min-h-11 w-full items-center gap-2 border-b border-border px-3.5 py-2 text-left text-sm last:border-b-0',
    onClick && 'transition-colors hover:bg-muted/40',
  )
  const content = (
    <>
      <span className="shrink-0">{label}</span>
      {children}
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} className={className}>{content}</button>
  ) : (
    <div className={className}>{content}</div>
  )
}
