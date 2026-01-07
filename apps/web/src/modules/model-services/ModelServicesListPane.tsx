import { useMemo, useState } from 'react'
import { useModelServicesStore } from './store'
import { useModelServices } from './hooks/useModelServices'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'

export function ModelServicesListPane({}: MicroAppPaneProps) {
  // 1. Data Source (TanStack DB + Static Merge)
  const { providers } = useModelServices()
  
  // 2. UI State (Zustand)
  const selectedId = useModelServicesStore((state) => state.selectedProviderId)
  const selectProvider = useModelServicesStore((state) => state.setSelectedProviderId)
  
  const [search, setSearch] = useState('')

  // 3. Filtering
  const items = useMemo(() => {
    const list = Object.values(providers)
    if (!search) return list
    return list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
  }, [providers, search])

  return (
    <div className="flex flex-col h-full bg-muted/10 border-r border-border/40 min-w-0">
      {/* Search Header */}
      <div className="flex items-center gap-2 h-16 px-4 bg-background/50 backdrop-blur-sm border-b border-border/40 shrink-0">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input 
            placeholder="搜索..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 bg-muted/50 border-transparent focus-visible:bg-background transition-colors text-xs"
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore
          />
        </div>
        <Button size="icon" variant="ghost" className="h-7 w-7 rounded-md text-muted-foreground hover:bg-muted shrink-0" onClick={() => alert("Todo: Add Custom Provider")}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* List Content */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="py-0">
          {items.map((provider) => {
            const IconComp = provider.icon
            const isSelected = selectedId === provider.id
            const isEnabled = provider.enabled

            return (
              <div
                key={provider.id}
                onClick={() => selectProvider(provider.id)}
                className={cn(
                  "group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-l-[3px] border-transparent",
                  isSelected 
                    ? "bg-accent/80 border-l-primary" 
                    : "hover:bg-muted/40 border-l-transparent"
                )}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <Avatar className="h-9 w-9 rounded-md border border-border/20">
                    <AvatarImage src={provider.avatar} />
                    <AvatarFallback className="rounded-md bg-muted text-[10px] font-bold uppercase text-muted-foreground">
                       {IconComp ? <IconComp size={16} /> : provider.name.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                  <span className={cn(
                    "font-medium text-sm truncate",
                    isSelected ? "text-foreground" : "text-foreground/80"
                  )}>
                    {provider.name}
                  </span>
                </div>

                {/* Status Dot (Right Side) */}
                {isEnabled && (
                  <div className="shrink-0 pr-1">
                     <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_4px_rgba(var(--primary),0.5)]" />
                  </div>
                )}
              </div>
            )
          })}
          
          {items.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-xs">
              无结果
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
