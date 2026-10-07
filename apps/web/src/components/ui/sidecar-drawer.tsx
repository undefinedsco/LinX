import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

export function SidecarDrawer({
  open,
  ariaLabel,
  title,
  icon,
  children,
  onClose,
  closeLabel = '关闭抽屉',
  className,
  coverage = 'panel',
}: {
  open: boolean
  ariaLabel: string
  title: ReactNode
  icon?: ReactNode
  children: ReactNode
  onClose: () => void
  closeLabel?: string
  className?: string
  coverage?: 'panel' | 'content'
}) {
  if (!open) return null

  return (
    <aside
      aria-label={ariaLabel}
      data-sidecar-coverage={coverage}
      className={cn(
        'absolute z-10 flex flex-col bg-background shadow-[-16px_0_30px_rgba(15,23,42,0.08)]',
        coverage === 'content'
          ? 'inset-y-0 right-0 w-[360px] max-w-full border-l border-border/50'
          : 'inset-y-0 right-0 w-[320px] max-w-[86%] border-l border-border/50',
        className,
      )}
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/40 px-4">
        <div className="flex min-w-0 items-center gap-2">
          {icon ? <span className="shrink-0 text-muted-foreground">{icon}</span> : null}
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={closeLabel} onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4">
          {children}
        </div>
      </ScrollArea>
    </aside>
  )
}
