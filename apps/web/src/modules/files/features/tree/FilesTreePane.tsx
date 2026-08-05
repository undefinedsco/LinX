import type { KeyboardEvent } from 'react'
import {
  FolderOpen,
  HardDrive,
  ChevronRight,
  Loader2,
  FolderRoot,
  Search,
  Clock3,
  MoreHorizontal,
  Star,
  FileText,
  X,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { AppletPaneProps } from '@/modules/layout/applet-registry'
import type { FilesEntry, FilesTreeNode } from '../../domain/resource/resource-model'
import {
  useFilesTreeChildrenController,
  useFilesTreePaneController,
} from './useFilesTreePaneController'
import { FilesAddMenu } from '../add/FilesAddMenu'

const ICON_MAP: Record<FilesTreeNode['type'], typeof FolderOpen> = {
  all: FolderRoot,
  recent: Clock3,
  workspace: FolderOpen,
  'local-workspace': HardDrive,
  'agents-root': FolderOpen,
  'workspaces-root': FolderOpen,
  'repositories-root': FolderOpen,
  container: FolderOpen,
  resource: FileText,
}

// ============================================================================
// Tree Node Item
// ============================================================================

interface TreeNodeItemProps {
  node: FilesTreeNode
  depth: number
  isSelected: boolean
  isExpanded: boolean
  canExpand: boolean
  isLoading?: boolean
  toggleLabel: string
  onSelect: () => void
  onToggle: () => void
  isFavorite: boolean
  onToggleFavorite: (() => void) | null
  onOpenSidecar: ((action: 'meta' | 'access') => void) | null
}

function TreeNodeItem({
  node,
  depth,
  isSelected,
  isExpanded,
  canExpand,
  isLoading,
  toggleLabel,
  onSelect,
  onToggle,
  isFavorite,
  onToggleFavorite,
  onOpenSidecar,
}: TreeNodeItemProps) {
  const Icon = ICON_MAP[node.type] ?? FolderOpen
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onSelect()
  }
  const handleToggleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    onToggle()
  }

  return (
    <div
      role="treeitem"
      aria-expanded={canExpand ? isExpanded : undefined}
      aria-selected={isSelected}
      tabIndex={isSelected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative flex h-7 min-w-0 cursor-pointer select-none items-center gap-1.5 overflow-hidden px-3 pr-12 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        isSelected
          ? 'bg-layout-list-selected text-foreground'
          : 'text-foreground/80 hover:bg-layout-list-hover',
      )}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
    >
      {/* Expand toggle */}
      {canExpand ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={toggleLabel}
          aria-expanded={isExpanded}
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          onKeyDown={handleToggleKeyDown}
          className="shrink-0 p-0.5 rounded hover:bg-muted/60"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground motion-reduce:animate-none" />
          ) : (
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 text-muted-foreground transition-transform',
                isExpanded && 'rotate-90',
              )}
            />
          )}
        </button>
      ) : (
        <span className="w-4.5" />
      )}

      <Icon strokeWidth={1.5} className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{node.label}</span>

      {onToggleFavorite || onOpenSidecar ? (
        <span
          className={cn(
            'absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
            isFavorite || isSelected ? 'opacity-100' : 'opacity-0',
          )}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {onToggleFavorite ? (
            <button
              type="button"
              aria-label={`${isFavorite ? '取消收藏' : '收藏'} ${node.label}`}
              title={isFavorite ? '取消收藏' : '收藏'}
              className="flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation()
                onToggleFavorite()
              }}
            >
              <Star className={cn('h-3.5 w-3.5', isFavorite && 'fill-primary text-primary')} strokeWidth={1.6} />
            </button>
          ) : null}
          {onOpenSidecar ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`更多 ${node.label} 操作`}
                  title="更多"
                  className="flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.6} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onSelect={() => onOpenSidecar('meta')}>查看 .meta</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onOpenSidecar('access')}>查看 Access 来源</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </span>
      ) : null}
    </div>
  )
}

function handleTreeNavigation(event: KeyboardEvent<HTMLDivElement>) {
  if (!(event.target instanceof HTMLElement)) return
  const currentItem = event.target.closest<HTMLElement>('[role="treeitem"]')
  if (!currentItem || !event.currentTarget.contains(currentItem)) return

  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="treeitem"]'))
  const currentIndex = items.indexOf(currentItem)
  if (currentIndex < 0) return

  const focusItem = (item: HTMLElement | undefined) => {
    if (!item) return
    items.forEach((candidate) => {
      candidate.tabIndex = candidate === item ? 0 : -1
    })
    item.focus()
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    focusItem(items[Math.min(currentIndex + 1, items.length - 1)])
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    focusItem(items[Math.max(currentIndex - 1, 0)])
    return
  }
  if (event.key === 'Home') {
    event.preventDefault()
    focusItem(items[0])
    return
  }
  if (event.key === 'End') {
    event.preventDefault()
    focusItem(items[items.length - 1])
    return
  }

  const toggle = currentItem.querySelector<HTMLButtonElement>('button[aria-expanded]')
  if (event.key === 'ArrowRight' && toggle?.getAttribute('aria-expanded') === 'false') {
    event.preventDefault()
    toggle.click()
  } else if (event.key === 'ArrowLeft' && toggle?.getAttribute('aria-expanded') === 'true') {
    event.preventDefault()
    toggle.click()
  }
}

function TreeSearchHeader({
  searchText,
  searchPlaceholder,
  clearSearchLabel,
  onSearchTextChange,
  addContainerUri,
  addEntries,
  addMenuOpen,
  onAddMenuOpenChange,
}: {
  searchText: string
  searchPlaceholder: string
  clearSearchLabel: string
  onSearchTextChange: (value: string) => void
  addContainerUri: string | null
  addEntries: FilesEntry[]
  addMenuOpen: boolean
  onAddMenuOpenChange: (open: boolean) => void
}) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-layout-list-header px-3">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={searchText}
          onChange={(event) => onSearchTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onSearchTextChange('')
          }}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="h-8 rounded-sm border-0 bg-muted/50 pl-8 pr-8 text-xs transition-colors hover:bg-muted/80 focus-visible:bg-background focus-visible:ring-1"
        />
        {searchText ? (
          <button
            type="button"
            aria-label={clearSearchLabel}
            title={clearSearchLabel}
            onClick={() => onSearchTextChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-muted-foreground/20"
          >
            <X strokeWidth={1.5} className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <FilesAddMenu
        containerUri={addContainerUri}
        entries={addEntries}
        open={addMenuOpen}
        onOpenChange={onAddMenuOpenChange}
      />
    </div>
  )
}

function TreeSearchResultRow({
  entry,
  isSelected,
  onOpen,
}: {
  entry: FilesEntry
  isSelected: boolean
  onOpen: () => void
}) {
  const Icon = entry.kind === 'container' ? FolderOpen : FileText
  return (
    <div
      role="treeitem"
      aria-selected={isSelected}
      tabIndex={isSelected ? 0 : -1}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onOpen()
      }}
      className={cn(
        'group relative flex h-7 min-w-0 cursor-pointer select-none items-center gap-1.5 overflow-hidden px-3 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        isSelected
          ? 'bg-layout-list-selected text-foreground'
          : 'text-foreground/80 hover:bg-layout-list-hover',
      )}
    >
      <span className="w-4.5" />
      <Icon strokeWidth={1.5} className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
      {entry.parentUri ? (
        <span className="min-w-0 max-w-[45%] shrink truncate text-[11px] text-muted-foreground" title={entry.parentUri}>
          {entry.parentUri}
        </span>
      ) : null}
    </div>
  )
}

function TreeChildrenSkeleton({
  depth,
  label,
}: {
  depth: number
  label: string
}) {
  const widths = ['58%', '44%', '66%']
  return (
    <div role="status" aria-label={label} className="animate-pulse py-0.5 motion-reduce:animate-none">
      {widths.map((width, index) => (
        <div
          key={index}
          className="flex h-7 items-center gap-1.5 px-3"
          style={{ paddingLeft: `${12 + (depth + 1) * 16}px` }}
        >
          <span className="h-3.5 w-3.5 shrink-0 rounded-sm bg-muted-foreground/15" />
          <span className="h-4 w-4 shrink-0 rounded-sm bg-muted-foreground/15" />
          <span className="h-2.5 rounded-full bg-muted-foreground/15" style={{ width }} />
        </div>
      ))}
    </div>
  )
}

function TreeChildren({
  parentNode,
  depth,
}: {
  parentNode: FilesTreeNode
  depth: number
}) {
  const treeChildren = useFilesTreeChildrenController(parentNode)

  if (treeChildren.childrenState.kind === 'loading') {
    return (
      <TreeChildrenSkeleton
        depth={depth}
        label={treeChildren.chrome.childLoadingLabel}
      />
    )
  }

  return treeChildren.childrenState.childNodes.map((childNode) => {
    const nodeState = treeChildren.projectNode(childNode)
    return (
      <div key={childNode.id}>
        <TreeNodeItem
          node={childNode}
          depth={depth}
          isSelected={nodeState.isSelected}
          isExpanded={nodeState.isExpanded}
          canExpand={nodeState.canExpand}
          toggleLabel={nodeState.toggleLabel}
          onSelect={nodeState.onSelect}
          onToggle={nodeState.onToggle}
          isFavorite={nodeState.isFavorite}
          onToggleFavorite={nodeState.onToggleFavorite}
          onOpenSidecar={nodeState.onOpenSidecar}
        />
        {nodeState.canExpand && nodeState.isExpanded ? (
          <TreeChildren parentNode={childNode} depth={depth + 1} />
        ) : null}
      </div>
    )
  })
}

export function FilesTreePane({ forceExpanded = false }: AppletPaneProps & { forceExpanded?: boolean }) {
  const tree = useFilesTreePaneController()

  return (
    <div className="flex h-full flex-col bg-layout-list-item">
      {!forceExpanded ? (
        <TreeSearchHeader
          searchText={tree.searchText}
          searchPlaceholder={tree.chrome.searchPlaceholder}
          clearSearchLabel={tree.chrome.clearSearchLabel}
          onSearchTextChange={tree.onSearchTextChange}
          addContainerUri={tree.addContainerUri}
          addEntries={tree.addEntries}
          addMenuOpen={tree.addMenuOpen}
          onAddMenuOpenChange={tree.onAddMenuOpenChange}
        />
      ) : null}
      <ScrollArea className="flex-1">
        {tree.searchActive ? (
          <div className="py-1" role="tree" aria-label={tree.chrome.treeLabel} onKeyDown={handleTreeNavigation}>
            {tree.searchLoading ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">{tree.chrome.rootLoadingLabel}</div>
            ) : tree.searchResults.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                {tree.chrome.emptySearchLabel(tree.searchText.trim())}
              </div>
            ) : tree.searchResults.map((entry) => (
              <TreeSearchResultRow
                key={entry.uri}
                entry={entry}
                isSelected={false}
                onOpen={() => tree.openSearchResult(entry)}
              />
            ))}
          </div>
        ) : (
        <div className="py-1" role="tree" aria-label={tree.chrome.treeLabel} onKeyDown={handleTreeNavigation}>
          {tree.contentState.kind === 'loading' ? (
            <TreeChildrenSkeleton depth={-1} label={tree.chrome.rootLoadingLabel} />
          ) : tree.contentState.kind === 'error' ? (
            <div className="px-4 py-3 text-sm text-destructive">{tree.chrome.rootErrorLabel}</div>
          ) : tree.contentState.kind === 'empty' ? null : tree.contentState.treeNodes.map((node) => {
            const nodeState = tree.projectNode(node)
            return (
              <div key={node.id}>
                <TreeNodeItem
                  node={node}
                  depth={0}
                  isSelected={nodeState.isSelected}
                  isExpanded={nodeState.isExpanded}
                  canExpand={nodeState.canExpand}
                  isLoading={nodeState.isLoading}
                  toggleLabel={nodeState.toggleLabel}
                  onSelect={nodeState.onSelect}
                  onToggle={nodeState.onToggle}
                  isFavorite={nodeState.isFavorite}
                  onToggleFavorite={nodeState.onToggleFavorite}
                  onOpenSidecar={nodeState.onOpenSidecar}
                />
                {nodeState.canExpand && nodeState.isExpanded ? (
                  <TreeChildren parentNode={node} depth={1} />
                ) : null}
              </div>
            )
          })}
        </div>
        )}
      </ScrollArea>
      {tree.footerLabel ? (
        <div aria-label="资源树状态条" className="flex h-7 shrink-0 items-center border-t border-border/40 px-4">
          <p className="truncate text-[11px] text-muted-foreground" title={tree.footerLabel}>{tree.footerLabel}</p>
        </div>
      ) : null}
    </div>
  )
}

export default FilesTreePane
