import { Smartphone, Monitor, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getRuntimeShellInfo } from '@/lib/runtime-shell'

const shellIconMap = {
  web: Globe,
  desktop: Monitor,
  mobile: Smartphone,
} as const

export function ShellStatusBadge({ className }: { className?: string }) {
  const shell = getRuntimeShellInfo()
  const Icon = shellIconMap[shell.id]

  return (
    <div className={cn('flex flex-col items-center gap-1.5', className)}>
      <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/70 px-2 py-1 text-[10px] text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span>{shell.label}</span>
      </div>
      <div className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
        {shell.authLabel}
      </div>
    </div>
  )
}
