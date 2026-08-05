import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ModelProviderList, type ModelProviderListItem } from './ModelProviderList'

export interface AiConnectionsListViewProps {
  items: ModelProviderListItem[]
  selectedId: string | null
  search: string
  queryError: string | null
  onSearchChange: (value: string) => void
  onSelect: (providerId: string) => void
}

export function AiConnectionsListView({
  items,
  selectedId,
  search,
  queryError,
  onSearchChange,
  onSelect,
}: AiConnectionsListViewProps) {
  return (
    <div className="flex h-full min-w-0 flex-col border-r border-border/40 bg-muted/10">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-layout-list-header px-3">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-8 border-transparent bg-muted/50 pl-8 text-xs transition-colors focus-visible:bg-background"
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore
          />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {queryError ? (
          <p role="alert" className="p-4 text-xs text-destructive">{queryError}</p>
        ) : (
          <ModelProviderList items={items} selectedId={selectedId} onSelect={onSelect} />
        )}
      </ScrollArea>
    </div>
  )
}
