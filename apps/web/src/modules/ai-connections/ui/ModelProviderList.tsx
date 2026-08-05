import { useRef, type KeyboardEvent } from 'react'
import { Globe } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export interface ModelProviderListItem {
  id: string
  name: string
  avatar?: string
  enabled: boolean
}

export function ModelProviderList({
  items,
  selectedId,
  onSelect,
}: {
  items: ModelProviderListItem[]
  selectedId: string | null
  onSelect: (providerId: string) => void
}) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = items.findIndex((item) => item.id === selectedId)

  if (items.length === 0) {
    return <div className="p-8 text-center text-xs text-muted-foreground">无结果</div>
  }

  return (
    <div role="listbox" aria-label="模型提供商" aria-orientation="vertical" className="py-0">
      {items.map((provider, index) => {
        const selected = selectedId === provider.id
        const tabbable = selected || (selectedIndex < 0 && index === 0)
        const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
          let nextIndex: number
          if (event.key === 'ArrowDown') nextIndex = Math.min(index + 1, items.length - 1)
          else if (event.key === 'ArrowUp') nextIndex = Math.max(index - 1, 0)
          else if (event.key === 'Home') nextIndex = 0
          else if (event.key === 'End') nextIndex = items.length - 1
          else return

          event.preventDefault()
          onSelect(items[nextIndex].id)
          optionRefs.current[nextIndex]?.focus()
        }

        return (
          <button
            ref={(node) => {
              optionRefs.current[index] = node
            }}
            key={provider.id}
            type="button"
            role="option"
            aria-selected={selected}
            tabIndex={tabbable ? 0 : -1}
            onClick={() => onSelect(provider.id)}
            onKeyDown={handleKeyDown}
            className={cn(
              'group flex w-full items-center gap-3 border-l-[3px] border-transparent px-4 py-3 text-left transition-colors',
              selected ? 'border-l-primary bg-accent/80' : 'hover:bg-muted/40',
            )}
          >
            <Avatar className="h-9 w-9 shrink-0 rounded-md border border-border/20">
              <AvatarImage src={provider.avatar} />
              <AvatarFallback className="rounded-md bg-muted text-[10px] font-bold uppercase text-muted-foreground">
                <Globe size={16} aria-hidden="true" />
              </AvatarFallback>
            </Avatar>
            <span className={cn('min-w-0 flex-1 truncate text-sm font-medium', selected ? 'text-foreground' : 'text-foreground/80')}>
              {provider.name}
            </span>
            {provider.enabled ? (
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="已启用" />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
