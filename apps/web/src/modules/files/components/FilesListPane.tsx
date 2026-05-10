import { useMemo, useCallback } from 'react'
import {
  FileText,
  FolderOpen,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  X,
  HardDrive,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { useFilesStore, type FileSortField } from '../store'
import {
  createContainerNodeId,
  type FilesEntry,
} from '../browser'
import {
  useFilesEntries,
  useSelectedFilesLocation,
} from '../queries'

function formatFileSize(bytes?: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/** Sort files by field and direction */
function sortFiles(
  files: FilesEntry[],
  field: FileSortField,
  direction: 'asc' | 'desc',
): FilesEntry[] {
  const sorted = [...files].sort((a, b) => {
    let cmp = 0
    switch (field) {
      case 'name': cmp = a.name.localeCompare(b.name); break
      case 'kind': cmp = a.kind.localeCompare(b.kind); break
      case 'mimeType': cmp = (a.mimeType ?? '').localeCompare(b.mimeType ?? ''); break
      case 'size': cmp = (a.size ?? -1) - (b.size ?? -1); break
      case 'modifiedAt': cmp = new Date(a.modifiedAt ?? 0).getTime() - new Date(b.modifiedAt ?? 0).getTime(); break
      case 'source': cmp = (a.sourceLabel ?? '').localeCompare(b.sourceLabel ?? ''); break
    }
    return cmp
  })
  return direction === 'desc' ? sorted.reverse() : sorted
}

function EmptyState({
  title,
  description,
  icon: Icon = FolderOpen,
}: {
  title: string
  description: string
  icon?: typeof FolderOpen
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 py-16">
      <Icon className="w-12 h-12 text-muted-foreground/30" />
      <p className="text-sm">{title}</p>
      <p className="text-xs text-muted-foreground/60 text-center max-w-[260px]">{description}</p>
    </div>
  )
}

// ============================================================================
// File Row
// ============================================================================

interface FileRowProps {
  file: FilesEntry
  isSelected: boolean
  onClick: () => void
  onDoubleClick: () => void
}

function FileRow({ file, isSelected, onClick, onDoubleClick }: FileRowProps) {
  const Icon = file.kind === 'container' ? FolderOpen : FileText

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none transition-colors',
        isSelected
          ? 'bg-layout-list-selected'
          : 'hover:bg-layout-list-hover',
      )}
    >
      {/* Icon */}
      <Icon strokeWidth={1.5} className="w-5 h-5 shrink-0 text-muted-foreground" />

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-sm text-foreground truncate">{file.name}</span>
        {file.sourceLabel && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium shrink-0">
            {file.sourceLabel}
          </span>
        )}
      </div>

      <span className="text-xs text-muted-foreground w-20 truncate shrink-0 hidden md:block">
        {file.kind === 'container' ? '容器' : (file.mimeType ?? '未知')}
      </span>

      <span className="text-xs text-muted-foreground w-16 text-right shrink-0 hidden md:block">
        {formatFileSize(file.size)}
      </span>

      <span className="text-xs text-muted-foreground w-28 text-right shrink-0 hidden lg:block">
        {file.modifiedAt ? formatDate(file.modifiedAt) : '—'}
      </span>

      <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 bg-muted text-muted-foreground">
        {file.kind === 'container' ? '目录' : '文件'}
      </span>
    </div>
  )
}

// ============================================================================
// Column Header
// ============================================================================

function ColumnHeader() {
  const sortField = useFilesStore((s) => s.sortField)
  const sortDirection = useFilesStore((s) => s.sortDirection)
  const setSortField = useFilesStore((s) => s.setSortField)
  const toggleSortDirection = useFilesStore((s) => s.toggleSortDirection)

  const handleSort = (field: FileSortField) => {
    if (sortField === field) {
      toggleSortDirection()
    } else {
      setSortField(field)
    }
  }

  const SortIcon = ({ field }: { field: FileSortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3" />
    return sortDirection === 'asc'
      ? <ArrowUp className="w-3 h-3 text-primary" />
      : <ArrowDown className="w-3 h-3 text-primary" />
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 text-xs text-muted-foreground shrink-0">
      <span className="w-5" />
      <button onClick={() => handleSort('name')} className="flex-1 flex items-center gap-1 hover:text-foreground">
        名称 <SortIcon field="name" />
      </button>
      <button onClick={() => handleSort('kind')} className="w-16 hidden md:flex items-center gap-1 hover:text-foreground">
        类别 <SortIcon field="kind" />
      </button>
      <button onClick={() => handleSort('mimeType')} className="w-20 hidden md:flex items-center gap-1 hover:text-foreground">
        类型 <SortIcon field="mimeType" />
      </button>
      <button onClick={() => handleSort('size')} className="w-16 hidden md:flex items-center gap-1 justify-end hover:text-foreground">
        大小 <SortIcon field="size" />
      </button>
      <button onClick={() => handleSort('modifiedAt')} className="w-28 hidden lg:flex items-center gap-1 justify-end hover:text-foreground">
        修改时间 <SortIcon field="modifiedAt" />
      </button>
      <button onClick={() => handleSort('source')} className="w-16 flex items-center gap-1 hover:text-foreground">
        来源 <SortIcon field="source" />
      </button>
    </div>
  )
}

// ============================================================================
// Search Bar
// ============================================================================

function ListSearchBar({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 shrink-0">
      <div className="relative flex-1 min-w-0">
        <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 text-muted-foreground">
          <Search strokeWidth={1.5} className="h-3.5 w-3.5" />
        </div>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="搜索当前范围..."
          className="pl-8 pr-8 h-7 bg-muted/50 hover:bg-muted/80 focus:bg-background rounded-sm text-xs border-0 focus-visible:ring-1 transition-colors"
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

export function FilesListPane(_props: MicroAppPaneProps) {
  const selectedFileId = useFilesStore((s) => s.selectedFileId)
  const selectFile = useFilesStore((s) => s.selectFile)
  const selectedTreeNodeId = useFilesStore((s) => s.selectedTreeNodeId)
  const selectTreeNode = useFilesStore((s) => s.selectTreeNode)
  const searchText = useFilesStore((s) => s.searchText)
  const setSearchText = useFilesStore((s) => s.setSearchText)
  const sortField = useFilesStore((s) => s.sortField)
  const sortDirection = useFilesStore((s) => s.sortDirection)
  const setDetailTab = useFilesStore((s) => s.setDetailTab)
  const { data: rawEntries = [], isLoading, error } = useFilesEntries(selectedTreeNodeId)
  const selection = useSelectedFilesLocation(selectedTreeNodeId)

  const files = useMemo(() => {
    let result = rawEntries
    if (searchText) {
      const lower = searchText.toLowerCase()
      result = result.filter((file) => file.name.toLowerCase().includes(lower))
    }
    return sortFiles(result, sortField, sortDirection)
  }, [rawEntries, searchText, sortField, sortDirection])

  const handleDoubleClick = useCallback(
    (file: FilesEntry) => {
      if (file.kind === 'container') {
        selectTreeNode(createContainerNodeId(file.uri))
        return
      }

      selectFile(file.uri)
      setDetailTab('preview')
    },
    [selectFile, selectTreeNode, setDetailTab],
  )

  const emptyState = useMemo(() => {
    if (selection.kind === 'local-workspace') {
      return {
        title: '当前话题绑定的是本地目录',
        description: `${selection.localPath ?? '该目录'} 暂时不能在 Web 壳直接浏览；请在桌面端打开，或先把产物同步到 Pod。`,
        icon: HardDrive,
      }
    }

    if (searchText) {
      return {
        title: '没有匹配的资源',
        description: '换个关键词，或者切到其它容器继续浏览。',
        icon: FolderOpen,
      }
    }

    return {
      title: '当前容器为空',
      description: '这个范围里还没有可浏览的资源。',
      icon: FolderOpen,
    }
  }, [searchText, selection.kind, selection.localPath])

  return (
    <div className="flex flex-col h-full">
      <ListSearchBar value={searchText} onChange={setSearchText} />
      <ColumnHeader />
      {isLoading ? (
        <EmptyState title="正在读取资源" description="稍等，正在从 Pod 拉取当前容器内容。" />
      ) : error ? (
        <EmptyState title="读取资源失败" description="当前容器暂时不可用，请稍后重试。" />
      ) : files.length === 0 ? (
        <EmptyState {...emptyState} />
      ) : (
        <ScrollArea className="flex-1">
          <div className="divide-y divide-border/20">
            {files.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                isSelected={selectedFileId === file.id}
                onClick={() => selectFile(file.uri)}
                onDoubleClick={() => handleDoubleClick(file)}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

export default FilesListPane
