import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { FAVORITE_GROUPS, type FavoriteGroupFilter } from '../domain/groups'

export interface FavoriteGroupsProps {
  searchText: string
  onSearchChange: (value: string) => void
  group: FavoriteGroupFilter
  counts: Record<FavoriteGroupFilter, number>
  onGroupChange: (group: FavoriteGroupFilter) => void
}

/** K7 left column: 全部收藏 and the five types with counts, plus search. */
export function FavoriteGroups({ searchText, onSearchChange, group, counts, onGroupChange }: FavoriteGroupsProps) {
  const entries: Array<{ id: FavoriteGroupFilter; label: string }> = [{ id: 'all', label: '全部收藏' }, ...FAVORITE_GROUPS]
  return (
    <div className="flex h-full flex-col bg-layout-list-item">
      <div className="flex h-12 shrink-0 items-center border-b border-border bg-layout-list-header px-3">
        <div className="relative min-w-0 flex-1">
          <Search strokeWidth={1.5} className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchText}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索收藏"
            aria-label="搜索收藏"
            className="h-8 rounded-sm border-0 bg-muted/50 pl-8 pr-8 text-xs focus-visible:ring-1"
          />
          {searchText ? (
            <button
              type="button"
              aria-label="清除搜索"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-muted-foreground/20"
            >
              <X strokeWidth={1.5} className="h-3 w-3 text-muted-foreground" />
            </button>
          ) : null}
        </div>
      </div>
      <div role="tablist" aria-orientation="vertical" aria-label="收藏分类" className="flex flex-col gap-0.5 p-2">
        {entries.map((entry) => {
          const active = group === entry.id
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`${entry.label} ${counts[entry.id] ?? 0}`}
              onClick={() => onGroupChange(entry.id)}
              className={cn(
                'flex h-9 items-center justify-between rounded-md px-3 text-sm transition-colors',
                active ? 'bg-layout-list-selected font-medium text-foreground' : 'text-muted-foreground hover:bg-layout-list-hover',
              )}
            >
              <span>{entry.label}</span>
              <span className="tabular-nums text-xs opacity-70">{counts[entry.id] ?? 0}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
