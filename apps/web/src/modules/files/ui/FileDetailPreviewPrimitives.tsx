import type { ReactNode } from 'react'

export function ModeCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  )
}

export function RawTextBlock({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <pre className="font-mono text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap break-words bg-muted/20 rounded-lg p-4 border border-border/30">
      {text}
    </pre>
  )
}

export function DetailRows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="space-y-1">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-3 border-b border-border/20 py-1.5 text-xs last:border-0">
          <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
          <span className="break-all text-right text-foreground/80">{value}</span>
        </div>
      ))}
    </div>
  )
}
