/**
 * FavoriteListPane - 收藏列表面板
 *
 * 功能：搜索框、来源筛选 tabs、平铺卡片列表
 */
import { useMemo } from 'react'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { useFavoriteStore, type SourceFilter } from '../store'
import { useFavoriteList, useFavoriteInit } from '../collections'
import {
  Search,
  X,
  Loader2,
  Star,
  MessageSquare,
  Users,
  FolderOpen,
  Mail,
  GitBranch,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { SourceModule } from '@linx/models'

// ============================================================================
// Source Filter Tabs
// ============================================================================

const SOURCE_TABS: { value: SourceFilter; label: string; icon: typeof Star }[] = [
  { value: 'all', label: '全部', icon: Star },
  { value: 'chat', label: '聊天', icon: MessageSquare },
  { value: 'contacts', label: '联系人', icon: Users },
  { value: 'files', label: '文件', icon: FolderOpen },
  { value: 'messages', label: '消息', icon: Mail },
  { value: 'thread', label: '话题', icon: GitBranch },
]

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
    <div className="h-16 flex items-center gap-2 px-3 border-b border-border bg-layout-list-header shrink-0">
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
// Source Filter Bar
// ============================================================================

function SourceFilterBar({
  value,
  onChange,
}: {
  value: SourceFilter
  onChange: (v: SourceFilter) => void
}) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-border/50 overflow-x-auto shrink-0">
      {SOURCE_TABS.map((tab) => {
        const Icon = tab.icon
        const isActive = value === tab.value
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-colors',
              isActive
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            )}
          >
            <Icon strokeWidth={1.5} className="w-3 h-3" />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

// ============================================================================
// Favorite Card Item
// ============================================================================

interface FavoriteCardProps {
  id: string
  title: string
  sourceModule?: string | null
  snapshotContent?: string | null
  snapshotAuthor?: string | null
  favoredAt?: Date | null
  isActive: boolean
  onClick: () => void
}

function FavoriteCard({
  title,
  sourceModule,
  snapshotContent,
  snapshotAuthor,
  favoredAt,
  isActive,
  onClick,
}: FavoriteCardProps) {
  const formattedDate = useMemo(() => {
    if (!favoredAt) return ''
    const d = favoredAt instanceof Date ? favoredAt : new Date(favoredAt as any)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }, [favoredAt])

  const sourceLabel = SOURCE_TABS.find((t) => t.value === sourceModule)
  const SourceIcon = sourceLabel?.icon ?? Star

  return (
    <div
      onClick={onClick}
      className={cn(
        'group flex items-start gap-3 px-3 py-3 cursor-pointer select-none transition-colors duration-150',
        isActive
          ? 'bg-layout-list-selected'
          : 'hover:bg-layout-list-hover bg-transparent'
      )}
    >
      <div className="shrink-0 mt-0.5 flex items-center justify-center w-8 h-8 rounded-md bg-amber-500/10 text-amber-500">
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
// Main Component
// ============================================================================

function FavoriteListEnabled() {
  const searchText = useFavoriteStore((s) => s.searchText)
  const setSearchText = useFavoriteStore((s) => s.setSearchText)
  const sourceFilter = useFavoriteStore((s) => s.sourceFilter)
  const setSourceFilter = useFavoriteStore((s) => s.setSourceFilter)
  const selectedFavoriteId = useFavoriteStore((s) => s.selectedFavoriteId)
  const select = useFavoriteStore((s) => s.select)

  const { data: favorites, isLoading } = useFavoriteList({
    search: searchText || undefined,
    sourceModule: sourceFilter === 'all' ? undefined : (sourceFilter as SourceModule),
  })

  return (
    <div className="flex h-full flex-col bg-layout-list-item">
      <FavoriteListHeader searchValue={searchText} onSearchChange={setSearchText} />
      <SourceFilterBar value={sourceFilter} onChange={setSourceFilter} />

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground px-4 py-8 justify-center animate-fade-in">
            <Loader2 className="w-4 h-4 animate-spin" />
            正在加载...
          </div>
        ) : !favorites?.length ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground animate-fade-in">
            <Star className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
            暂无收藏
          </div>
        ) : (
          <div className="divide-y divide-border/30 animate-fade-in">
            {favorites.map((fav) => (
              <FavoriteCard
                key={fav.id}
                id={fav.id}
                title={fav.title}
                sourceModule={fav.sourceModule}
                snapshotContent={fav.snapshotContent}
                snapshotAuthor={fav.snapshotAuthor}
                favoredAt={fav.favoredAt}
                isActive={selectedFavoriteId === fav.id}
                onClick={() => select(fav.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

export function FavoriteListPane(_props: MicroAppPaneProps) {
  useFavoriteInit()

  return <FavoriteListEnabled />
}

export default FavoriteListPane
