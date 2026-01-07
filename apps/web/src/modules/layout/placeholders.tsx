import type { ReactNode } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface PlaceholderListPaneProps {
  title: string
  description: string
  items: ReactNode[]
}

export function PlaceholderListPane({ title, description, items }: PlaceholderListPaneProps) {
  return (
    <div className="flex h-full flex-col bg-card border-r border-border/50">
      <div className="h-16 px-4 flex flex-col justify-center border-b border-border/50">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {items.map((item, idx) => (
            <div
              key={idx}
              className={cn(
                'rounded-xs border border-border/40 bg-background/80 px-3 py-2 text-sm',
                'text-muted-foreground'
              )}
            >
              {item}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

interface PlaceholderContentPaneProps {
  title: string
  description: string
  children?: ReactNode
}

export function PlaceholderContentPane({ title, description, children }: PlaceholderContentPaneProps) {
  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="text-center space-y-3 max-w-md mx-auto px-6">
        <div className="w-16 h-16 rounded-xs bg-primary/10 flex items-center justify-center mx-auto text-primary text-lg font-semibold">
          {title.slice(0, 1)}
        </div>
        <div>
          <h3 className="text-xl font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {children}
      </div>
    </div>
  )
}
