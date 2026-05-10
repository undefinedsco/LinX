import { useMemo } from 'react'
import {
  FolderOpen,
  HardDrive,
  ChevronRight,
  Loader2,
  FolderRoot,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { useFilesStore } from '../store'
import {
  type FilesTreeNode,
  ALL_FILES_NODE_ID,
} from '../browser'
import {
  useActiveFilesWorkspaceContext,
  useContainerChildTreeNodes,
  useFilesRootNodes,
} from '../queries'

const ICON_MAP: Record<FilesTreeNode['type'], typeof FolderOpen> = {
  all: FolderRoot,
  workspace: FolderOpen,
  'local-workspace': HardDrive,
  container: FolderOpen,
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
  onSelect: () => void
  onToggle: () => void
}

function TreeNodeItem({
  node,
  depth,
  isSelected,
  isExpanded,
  canExpand,
  isLoading,
  onSelect,
  onToggle,
}: TreeNodeItemProps) {
  const Icon = ICON_MAP[node.type] ?? FolderOpen

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
      {canExpand ? (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          className="shrink-0 p-0.5 rounded hover:bg-muted/60"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
          ) : (
            <ChevronRight
              className={cn(
                'w-3.5 h-3.5 text-muted-foreground transition-transform',
                isExpanded && 'rotate-90',
              )}
            />
          )}
        </button>
      ) : (
        <span className="w-4.5" />
      )}

      <Icon strokeWidth={1.5} className="w-4 h-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate">{node.label}</span>

      {node.count != null && (
        <span className="text-[11px] text-muted-foreground shrink-0">{node.count}</span>
      )}
    </div>
  )
}

function TreeSectionHeader({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="border-b border-border bg-layout-list-header px-3 py-3 shrink-0">
      <p className="text-xs font-medium text-foreground">{title}</p>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{description}</p>
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
  const selectedTreeNodeId = useFilesStore((state) => state.selectedTreeNodeId)
  const expandedTreeNodeIds = useFilesStore((state) => state.expandedTreeNodeIds)
  const selectTreeNode = useFilesStore((state) => state.selectTreeNode)
  const toggleTreeNode = useFilesStore((state) => state.toggleTreeNode)
  const { data: childNodes = [], isLoading } = useContainerChildTreeNodes(parentNode)

  if (isLoading) {
    return (
      <div className="px-4 py-2 text-xs text-muted-foreground">
        正在读取子容器…
      </div>
    )
  }

  return childNodes.map((childNode) => {
    const isExpanded = expandedTreeNodeIds.has(childNode.id)
    const canExpand = childNode.type === 'container'
    return (
      <div key={childNode.id} role="treeitem" aria-expanded={canExpand ? isExpanded : undefined}>
        <TreeNodeItem
          node={childNode}
          depth={depth}
          isSelected={selectedTreeNodeId === childNode.id}
          isExpanded={isExpanded}
          canExpand={canExpand}
          onSelect={() => selectTreeNode(childNode.id)}
          onToggle={() => toggleTreeNode(childNode.id)}
        />
        {canExpand && isExpanded ? (
          <TreeChildren parentNode={childNode} depth={depth + 1} />
        ) : null}
      </div>
    )
  })
}

export function FilesTreePane(_props: MicroAppPaneProps) {
  const selectedTreeNodeId = useFilesStore((s) => s.selectedTreeNodeId)
  const expandedTreeNodeIds = useFilesStore((s) => s.expandedTreeNodeIds)
  const selectTreeNode = useFilesStore((s) => s.selectTreeNode)
  const toggleTreeNode = useFilesStore((s) => s.toggleTreeNode)
  const { workspaceUri, threadTitle } = useActiveFilesWorkspaceContext()
  const { data, isLoading, error } = useFilesRootNodes()

  const treeNodes = useMemo(() => data?.nodes ?? [], [data?.nodes])
  const description = workspaceUri
    ? `当前话题：${threadTitle ?? '未命名话题'}`
    : '浏览当前 Pod 容器；绑定目录后会在这里出现当前话题容器。'

  return (
    <div className="flex h-full flex-col bg-layout-list-item">
      <TreeSectionHeader title="资源范围" description={description} />
      <ScrollArea className="flex-1">
        <div className="py-1" role="tree" aria-label="文件分组树">
          {isLoading ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">正在加载容器…</div>
          ) : null}
          {error ? (
            <div className="px-4 py-3 text-sm text-destructive">读取容器失败。</div>
          ) : null}
          {treeNodes.map((node) => {
            const isExpanded = expandedTreeNodeIds.has(node.id)
            const canExpand = node.type === 'workspace' || node.type === 'container'
            return (
              <div key={node.id} role="treeitem" aria-expanded={canExpand ? isExpanded : undefined}>
                <TreeNodeItem
                  node={node}
                  depth={0}
                  isSelected={selectedTreeNodeId === node.id}
                  isExpanded={isExpanded}
                  canExpand={canExpand}
                  isLoading={isLoading && node.id !== ALL_FILES_NODE_ID}
                  onSelect={() => selectTreeNode(node.id)}
                  onToggle={() => toggleTreeNode(node.id)}
                />
                {canExpand && isExpanded ? (
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
