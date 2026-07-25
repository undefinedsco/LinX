import type { KeyboardEvent } from 'react'
import {
  FolderOpen,
  HardDrive,
  ChevronRight,
  Loader2,
  FolderRoot,
  PanelLeftClose,
  PanelLeftOpen,
  Clock3,
  MoreHorizontal,
  Star,
  FileText,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import type { FilesTreeChromeModel } from '../../domain/resource/tree-model'
import type { FilesTreeNode } from '../../domain/resource/resource-model'
import {
  useFilesTreeChildrenController,
  useFilesTreePaneController,
} from './useFilesTreePaneController'

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

      {node.count != null && (
        <span className="text-[11px] text-muted-foreground shrink-0">{node.count}</span>
      )}
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

function TreeSectionHeader({
  title,
  description,
  collapseLabel,
  onCollapse,
}: {
  title: string
  description: string
  collapseLabel: string
  onCollapse: () => void
}) {
  return (
    <>
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-layout-list-header px-3">
        <p className="min-w-0 truncate text-xs font-medium text-foreground">{title}</p>
        <button
          type="button"
          aria-label={collapseLabel}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          onClick={onCollapse}
        >
          <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {description ? (
        <div className="shrink-0 border-b border-border/40 px-3 py-1.5 text-[11px] leading-4 text-muted-foreground">
          {description}
        </div>
      ) : null}
    </>
  )
}

function CollapsedTreeRail({
  chrome,
  nodes,
  selectedTreeNodeId,
  onSelect,
  onExpand,
}: {
  chrome: FilesTreeChromeModel
  nodes: FilesTreeNode[]
  selectedTreeNodeId: string | null
  onSelect: (id: string) => void
  onExpand: () => void
}) {
  return (
    <div className="flex h-full w-14 flex-col items-center border-r border-border/40 bg-layout-list-item py-2">
      <button
        type="button"
        aria-label={chrome.expandRailLabel}
        className="mb-2 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground"
        onClick={onExpand}
      >
        <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
      </button>
      <div role="tree" aria-label={chrome.treeLabel} className="flex flex-col items-center gap-1" onKeyDown={handleTreeNavigation}>
        {nodes.map((node) => {
          const Icon = ICON_MAP[node.type] ?? FolderOpen
          return (
            <button
              key={node.id}
              type="button"
              role="treeitem"
              aria-selected={selectedTreeNodeId === node.id}
              tabIndex={selectedTreeNodeId === node.id ? 0 : -1}
              aria-label={node.label}
              title={node.label}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-layout-list-hover hover:text-foreground',
                selectedTreeNodeId === node.id && 'bg-layout-list-selected text-foreground',
              )}
              onClick={() => onSelect(node.id)}
            >
              <Icon strokeWidth={1.5} className="h-4 w-4" aria-hidden="true" />
            </button>
          )
        })}
      </div>
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
      <div className="px-4 py-2 text-xs text-muted-foreground">
        {treeChildren.chrome.childLoadingLabel}
      </div>
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

export function FilesTreePane({ forceExpanded = false }: MicroAppPaneProps & { forceExpanded?: boolean }) {
  const tree = useFilesTreePaneController()

  if (tree.resourceRailCollapsed && !forceExpanded) {
    return (
      <CollapsedTreeRail
        chrome={tree.chrome}
        nodes={tree.treeNodes}
        selectedTreeNodeId={tree.selectedTreeNodeId}
        onSelect={tree.selectTreeNode}
        onExpand={tree.toggleResourceRail}
      />
    )
  }

  return (
    <div className="flex h-full flex-col bg-layout-list-item">
      {!forceExpanded ? (
        <TreeSectionHeader
          title={tree.chrome.headerTitle}
          description={tree.description}
          collapseLabel={tree.chrome.collapseRailLabel}
          onCollapse={tree.toggleResourceRail}
        />
      ) : null}
      <ScrollArea className="flex-1">
        <div className="py-1" role="tree" aria-label={tree.chrome.treeLabel} onKeyDown={handleTreeNavigation}>
          {tree.contentState.kind === 'loading' ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">{tree.chrome.rootLoadingLabel}</div>
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
      </ScrollArea>
    </div>
  )
}

export default FilesTreePane
