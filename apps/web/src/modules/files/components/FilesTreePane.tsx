/**
 * FilesTreePane - Left pane tree navigation skeleton
 *
 * Section 8.2: Virtual groups + real directory tree
 * - All files (virtual root)
 * - Recent (last 7 days)
 * - Starred
 * - By session
 * - By import
 * - Pod directory (real folder tree)
 *
 * CP0: skeleton only, no data fetching.
 */
import { useMemo } from 'react'
import {
  FolderOpen,
  Clock,
  Star,
  Terminal,
  Download,
  HardDrive,
  ChevronRight,
  Search,
  X,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { useFilesStore, type TreeNode, type TreeNodeType } from '../store'

// ============================================================================
// Constants
// ============================================================================

const ICON_MAP: Record<TreeNodeType, typeof FolderOpen> = {
  all: FolderOpen,
  recent: Clock,
  starred: Star,
  'by-session': Terminal,
  'by-import': Download,
  'pod-directory': HardDrive,
}

/** Static virtual tree nodes (CP0 placeholder) */
const STATIC_TREE: TreeNode[] = [
  { id: 'all', label: '全部文件', type: 'all' },
  { id: 'recent', label: '最近修改', type: 'recent' },
  { id: 'starred', label: '已标星', type: 'starred' },
  { id: 'by-session', label: '按会话', type: 'by-session' },
  { id: 'by-import', label: '导入数据', type: 'by-import' },
  { id: 'pod-directory', label: 'Pod 目录', type: 'pod-directory' },
]

// ============================================================================
// Tree Node Item
// ============================================================================

interface TreeNodeItemProps {
  node: TreeNode
  depth: number
  isSelected: boolean
  isExpanded: boolean
  onSelect: () => void
  onToggle: () => void
}

function TreeNodeItem({
  node,
  depth,
  isSelected,
  isExpanded,
  onSelect,
  onToggle,
}: TreeNodeItemProps) {
  const Icon = ICON_MAP[node.type] ?? FolderOpen
  const hasChildren = node.type === 'by-session' || node.type === 'by-import' || node.type === 'pod-directory'

  return (
    <div
      onClick={onSelect}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none transition-colors text-sm',
        isSelected
          ? 'bg-layout-list-selected text-foreground'
          : 'text-foreground/80 hover:bg-layout-list-hover',
      )}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
    >
      {/* Expand toggle */}
      {hasChildren ? (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          className="shrink-0 p-0.5 rounded hover:bg-muted/60"
        >
          <ChevronRight
            className={cn(
              'w-3.5 h-3.5 text-muted-foreground transition-transform',
              isExpanded && 'rotate-90',
            )}
          />
        </button>
      ) : (
        <span className="w-4.5" />
      )}

      <Icon strokeWidth={1.5} className="w-4 h-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate">{node.label}</span>

      {node.count != null && (
        <span className="text-[11px] text-muted-foreground shrink-0">{node.count}</span>
      )}

      {node.syncIndicator === 'error' && (
        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
      )}
      {node.syncIndicator === 'warning' && (
        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
      )}
    </div>
  )
}

// ============================================================================
// Search Header
// ============================================================================

function TreeSearchHeader({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="h-16 flex items-center gap-2 px-3 border-b border-border bg-layout-list-header shrink-0">
      <div className="relative flex-1 min-w-0">
        <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 text-muted-foreground">
          <Search strokeWidth={1.5} className="h-3.5 w-3.5" />
        </div>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="搜索文件"
          className="pl-8 pr-8 h-8 bg-muted/50 hover:bg-muted/80 focus:bg-background rounded-sm text-xs border-0 focus-visible:ring-1 transition-colors"
        />
        {value && (
          <button
            onClick={() => onChange('')}
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
// Main Component
// ============================================================================

export function FilesTreePane(_props: MicroAppPaneProps) {
  const selectedTreeNodeId = useFilesStore((s) => s.selectedTreeNodeId)
  const expandedTreeNodeIds = useFilesStore((s) => s.expandedTreeNodeIds)
  const selectTreeNode = useFilesStore((s) => s.selectTreeNode)
  const toggleTreeNode = useFilesStore((s) => s.toggleTreeNode)
  const searchText = useFilesStore((s) => s.searchText)
  const setSearchText = useFilesStore((s) => s.setSearchText)

  const filteredTree = useMemo(() => {
    if (!searchText) return STATIC_TREE
    const lower = searchText.toLowerCase()
    return STATIC_TREE.filter((n) => n.label.toLowerCase().includes(lower))
  }, [searchText])

  return (
    <div className="flex h-full flex-col bg-layout-list-item">
      <TreeSearchHeader value={searchText} onChange={setSearchText} />
      <ScrollArea className="flex-1">
        <div className="py-1">
          {filteredTree.map((node) => (
            <TreeNodeItem
              key={node.id}
              node={node}
              depth={0}
              isSelected={selectedTreeNodeId === node.id}
              isExpanded={expandedTreeNodeIds.has(node.id)}
              onSelect={() => selectTreeNode(node.id)}
              onToggle={() => toggleTreeNode(node.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

export default FilesTreePane
