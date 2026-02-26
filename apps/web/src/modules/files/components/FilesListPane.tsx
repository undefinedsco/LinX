/**
 * FilesListPane - Middle pane file list skeleton
 *
 * Section 8.3: Table/list of files under the selected tree node.
 * Columns: name, mimeType, size, modifiedAt, syncStatus, starred
 * Interactions: sort, search, filter by mimeType, multi-select, batch star
 *
 * CP0: skeleton with static placeholder data, no Pod fetching.
 * CP1: mock data, sorting, search filtering, double-click to open detail.
 */
import { useMemo, useCallback } from 'react'
import {
  FileText,
  Star,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FolderOpen,
  Search,
  X,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { useFilesStore, type FileSortField } from '../store'

// ============================================================================
// Types
// ============================================================================

/** Placeholder file row for CP0 skeleton */
interface FileListItem {
  id: string
  name: string
  mimeType: string
  size: number
  modifiedAt: string
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error'
  starred: boolean
  /** Source badge: 'imported' if from import pipeline */
  sourceTag?: 'imported' | 'session'
}

// ============================================================================
// Helpers
// ============================================================================

function formatFileSize(bytes: number): string {
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

const SYNC_BADGE: Record<string, { label: string; className: string }> = {
  synced: { label: '已同步', className: 'text-green-600 bg-green-500/10' },
  pending: { label: '同步中', className: 'text-amber-600 bg-amber-500/10' },
  conflict: { label: '冲突', className: 'text-amber-600 bg-amber-500/10' },
  error: { label: '错误', className: 'text-red-600 bg-red-500/10' },
}

// ============================================================================
// Mock Data (CP1 — replaced by Collection in CP2)
// ============================================================================

const MOCK_FILES: FileListItem[] = [
  { id: 'f1', name: 'README.md', mimeType: 'text/markdown', size: 2048, modifiedAt: '2026-02-25T10:30:00Z', syncStatus: 'synced', starred: true },
  { id: 'f2', name: 'config.json', mimeType: 'application/json', size: 512, modifiedAt: '2026-02-25T09:15:00Z', syncStatus: 'synced', starred: false },
  { id: 'f3', name: 'session-log.txt', mimeType: 'text/plain', size: 15360, modifiedAt: '2026-02-24T18:00:00Z', syncStatus: 'pending', starred: false, sourceTag: 'session' },
  { id: 'f4', name: 'contacts-export.csv', mimeType: 'text/csv', size: 8192, modifiedAt: '2026-02-23T14:20:00Z', syncStatus: 'synced', starred: false, sourceTag: 'imported' },
  { id: 'f5', name: 'profile-photo.png', mimeType: 'image/png', size: 245760, modifiedAt: '2026-02-22T11:00:00Z', syncStatus: 'synced', starred: true },
  { id: 'f6', name: 'notes.md', mimeType: 'text/markdown', size: 4096, modifiedAt: '2026-02-26T08:00:00Z', syncStatus: 'synced', starred: false },
  { id: 'f7', name: 'data-backup.ttl', mimeType: 'text/turtle', size: 32768, modifiedAt: '2026-02-20T16:45:00Z', syncStatus: 'conflict', starred: false },
  { id: 'f8', name: 'error-log.txt', mimeType: 'text/plain', size: 1024, modifiedAt: '2026-02-21T09:30:00Z', syncStatus: 'error', starred: false, sourceTag: 'session' },
]

/** Filter mock files by tree node selection */
function filterByTreeNode(files: FileListItem[], nodeId: string | null): FileListItem[] {
  if (!nodeId || nodeId === 'all') return files
  if (nodeId === 'starred') return files.filter((f) => f.starred)
  if (nodeId === 'recent') {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    return files.filter((f) => new Date(f.modifiedAt).getTime() > sevenDaysAgo)
  }
  if (nodeId.startsWith('session')) return files.filter((f) => f.sourceTag === 'session')
  if (nodeId.startsWith('import')) return files.filter((f) => f.sourceTag === 'imported')
  return files
}

/** Sort files by field and direction */
function sortFiles(
  files: FileListItem[],
  field: FileSortField,
  direction: 'asc' | 'desc',
): FileListItem[] {
  const sorted = [...files].sort((a, b) => {
    let cmp = 0
    switch (field) {
      case 'name': cmp = a.name.localeCompare(b.name); break
      case 'mimeType': cmp = a.mimeType.localeCompare(b.mimeType); break
      case 'size': cmp = a.size - b.size; break
      case 'modifiedAt': cmp = new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime(); break
      case 'syncStatus': cmp = a.syncStatus.localeCompare(b.syncStatus); break
    }
    return cmp
  })
  return direction === 'desc' ? sorted.reverse() : sorted
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 py-16">
      <FolderOpen className="w-12 h-12 text-muted-foreground/30" />
      <p className="text-sm">当前分组暂无文件</p>
      <p className="text-xs text-muted-foreground/60">去导入数据或新建文件</p>
    </div>
  )
}

// ============================================================================
// File Row
// ============================================================================

interface FileRowProps {
  file: FileListItem
  isSelected: boolean
  onClick: () => void
  onDoubleClick: () => void
  onToggleStar?: () => void
}

function FileRow({ file, isSelected, onClick, onDoubleClick, onToggleStar }: FileRowProps) {
  const sync = SYNC_BADGE[file.syncStatus] ?? SYNC_BADGE.synced

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
      <FileText strokeWidth={1.5} className="w-5 h-5 shrink-0 text-muted-foreground" />

      {/* Name + source tag */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-sm text-foreground truncate">{file.name}</span>
        {file.sourceTag === 'imported' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 font-medium shrink-0">
            Imported
          </span>
        )}
        {file.sourceTag === 'session' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 font-medium shrink-0">
            Session
          </span>
        )}
      </div>

      {/* MIME */}
      <span className="text-xs text-muted-foreground w-20 truncate shrink-0 hidden md:block">
        {file.mimeType}
      </span>

      {/* Size */}
      <span className="text-xs text-muted-foreground w-16 text-right shrink-0 hidden md:block">
        {formatFileSize(file.size)}
      </span>

      {/* Modified */}
      <span className="text-xs text-muted-foreground w-28 text-right shrink-0 hidden lg:block">
        {formatDate(file.modifiedAt)}
      </span>

      {/* Sync status */}
      <span className={cn('text-[10px] px-1.5 py-0.5 rounded shrink-0', sync.className)}>
        {sync.label}
      </span>

      {/* Star */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleStar?.()
        }}
        className="shrink-0 p-0.5 rounded hover:bg-muted/60"
      >
        <Star
          strokeWidth={1.5}
          className={cn(
            'w-4 h-4',
            file.starred ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/40',
          )}
        />
      </button>
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
      <button onClick={() => handleSort('mimeType')} className="w-20 hidden md:flex items-center gap-1 hover:text-foreground">
        类型 <SortIcon field="mimeType" />
      </button>
      <button onClick={() => handleSort('size')} className="w-16 hidden md:flex items-center gap-1 justify-end hover:text-foreground">
        大小 <SortIcon field="size" />
      </button>
      <button onClick={() => handleSort('modifiedAt')} className="w-28 hidden lg:flex items-center gap-1 justify-end hover:text-foreground">
        修改时间 <SortIcon field="modifiedAt" />
      </button>
      <button onClick={() => handleSort('syncStatus')} className="w-12 flex items-center gap-1 hover:text-foreground">
        同步 <SortIcon field="syncStatus" />
      </button>
      <span className="w-5" />
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
          placeholder="搜索文件名..."
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
  const searchText = useFilesStore((s) => s.searchText)
  const setSearchText = useFilesStore((s) => s.setSearchText)
  const sortField = useFilesStore((s) => s.sortField)
  const sortDirection = useFilesStore((s) => s.sortDirection)
  const setDetailTab = useFilesStore((s) => s.setDetailTab)

  // CP1: mock data with filtering, search, and sorting
  const files = useMemo(() => {
    let result = filterByTreeNode(MOCK_FILES, selectedTreeNodeId)

    // Search filter
    if (searchText) {
      const lower = searchText.toLowerCase()
      result = result.filter((f) => f.name.toLowerCase().includes(lower))
    }

    // Sort
    return sortFiles(result, sortField, sortDirection)
  }, [selectedTreeNodeId, searchText, sortField, sortDirection])

  const handleDoubleClick = useCallback(
    (fileId: string) => {
      selectFile(fileId)
      setDetailTab('preview')
    },
    [selectFile, setDetailTab],
  )

  return (
    <div className="flex flex-col h-full">
      <ListSearchBar value={searchText} onChange={setSearchText} />
      <ColumnHeader />
      {files.length === 0 ? (
        <EmptyState />
      ) : (
        <ScrollArea className="flex-1">
          <div className="divide-y divide-border/20">
            {files.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                isSelected={selectedFileId === file.id}
                onClick={() => selectFile(file.id)}
                onDoubleClick={() => handleDoubleClick(file.id)}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

export default FilesListPane
