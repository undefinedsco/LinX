import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CollectionErrorPaneProps {
  title: string
  stale?: boolean
  onRetry: () => void | Promise<unknown>
  className?: string
}

export function CollectionErrorPane({
  title,
  stale = false,
  onRetry,
  className,
}: CollectionErrorPaneProps) {
  if (stale) {
    return (
      <div
        role="alert"
        className={cn('flex items-center justify-between gap-2 border-b border-destructive/20 px-3 py-2 text-xs text-destructive', className)}
      >
        <span>{title}</span>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => void onRetry()}>
          重试
        </Button>
      </div>
    )
  }

  return (
    <div role="alert" className={cn('flex flex-col items-center gap-3 px-4 py-10 text-center', className)}>
      <AlertCircle className="h-5 w-5 text-destructive" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <Button variant="outline" size="sm" onClick={() => void onRetry()}>
        重试
      </Button>
    </div>
  )
}
