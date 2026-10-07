import type { KeyboardEvent } from 'react'
import {
  Search,
  X,
  Loader2,
  Star,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

// ============================================================================
// List Header
// ============================================================================

function FavoriteListHeader({
  searchValue,
  onSearchChange,
}: {
  searchValue: string
  onSearchChange: (v: string) => void
}) {
  return (
    <div className="h-12 flex items-center gap-2 px-3 border-b border-border bg-layout-list-header shrink-0">
      <div className="relative flex-1 min-w-0">
        <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 text-muted-foreground">
          <Search strokeWidth={1.5} className="h-3.5 w-3.5" />
        </div>
        <Input
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="搜索收藏"
          className="pl-8 pr-8 h-8 bg-muted/50 hover:bg-muted/80 focus:bg-background rounded-sm text-xs border-0 focus-visible:ring-1 transition-colors"
        />
        {searchValue && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted-foreground/20 rounded-full"
          >
            <X strokeWidth={1.5} className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Favorite Card Item
// ============================================================================

interface FavoriteCardProps {
  title: string
  snapshotContent?: string | null
  snapshotAuthor?: string | null
  formattedDate: string
  isActive: boolean
  tabIndex: number
  cardRef: (node: HTMLDivElement | null) => void
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onClick: () => void
}

function FavoriteCard({
  title,
  snapshotContent,
  snapshotAuthor,
  formattedDate,
  isActive,
  tabIndex,
  cardRef,
  onKeyDown,
  onClick,
}: FavoriteCardProps) {
  const SourceIcon = Star

  return (
    <div
      ref={cardRef}
      role="option"
      aria-selected={isActive}
      tabIndex={tabIndex}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        'group flex items-start gap-3 px-3 py-3 cursor-pointer select-none outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50',
        isActive
          ? 'bg-layout-list-selected'
          : 'hover:bg-layout-list-hover bg-transparent'
      )}
    >
      <div className="shrink-0 mt-0.5 flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary">
        <SourceIcon strokeWidth={1.5} className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="text-sm font-medium text-foreground truncate">
            {title}
          </span>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
            {formattedDate}
          </span>
        </div>
        {snapshotContent && (
          <p className="text-xs text-muted-foreground truncate">
            {snapshotContent}
          </p>
        )}
        {snapshotAuthor && (
          <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">
            {snapshotAuthor}
          </p>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// List View
// ============================================================================

export interface FavoriteListItem {
  id: string
  title: string
  snapshotContent?: string | null
  snapshotAuthor?: string | null
  formattedDate: string
}

export interface FavoriteListProps {
  searchText: string
  onSearchChange: (value: string) => void
  items: FavoriteListItem[]
  isLoading: boolean
  selectedFavoriteId: string | null
  selectedIndex: number
  onSelect: (id: string) => void
  onItemKeyDown: (index: number, event: KeyboardEvent<HTMLDivElement>) => void
  registerItemRef: (index: number, node: HTMLDivElement | null) => void
}

export function FavoriteList({
  searchText,
  onSearchChange,
  items,
  isLoading,
  selectedFavoriteId,
  selectedIndex,
  onSelect,
  onItemKeyDown,
  registerItemRef,
}: FavoriteListProps) {
  return (
    <div className="flex h-full flex-col bg-layout-list-item">
      <FavoriteListHeader searchValue={searchText} onSearchChange={onSearchChange} />

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground px-4 py-8 justify-center animate-fade-in">
            <Loader2 className="w-4 h-4 animate-spin" />
            正在加载...
          </div>
        ) : !items.length ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground animate-fade-in">
            <Star className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
            暂无收藏
          </div>
        ) : (
          <div role="listbox" aria-label="收藏" aria-orientation="vertical" className="divide-y divide-border/30 animate-fade-in">
            {items.map((item, index) => {
              const selected = selectedFavoriteId === item.id
              const tabbable = selected || (selectedIndex < 0 && index === 0)
              return (
                <FavoriteCard
                  key={item.id}
                  title={item.title}
                  snapshotContent={item.snapshotContent}
                  snapshotAuthor={item.snapshotAuthor}
                  formattedDate={item.formattedDate}
                  isActive={selected}
                  tabIndex={tabbable ? 0 : -1}
                  cardRef={(node) => {
                    registerItemRef(index, node)
                  }}
                  onKeyDown={(event) => onItemKeyDown(index, event)}
                  onClick={() => onSelect(item.id)}
                />
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
