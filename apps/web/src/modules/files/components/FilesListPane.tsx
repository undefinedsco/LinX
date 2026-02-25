/**
 * FilesListPane - Middle pane file list skeleton
 *
 * Section 8.3: Table/list of files under the selected tree node.
 * Columns: name, mimeType, size, modifiedAt, syncStatus, starred
 * Interactions: sort, search, filter by mimeType, multi-select, batch star
 *
 * CP0: skeleton with static placeholder data, no Pod fetching.
 */
import { useMemo } from 'react'
import {
  FileText,
  Star,
  ArrowUpDown,
  FolderOpen,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { useFilesStore } from '../store'

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
  const setSortField = useFilesStore((s) => s.setSortField)
  const toggleSortDirection = useFilesStore((s) => s.toggleSortDirection)

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      toggleSortDirection()
    } else {
      setSortField(field)
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 text-xs text-muted-foreground shrink-0">
      <span className="w-5" /> {/* icon spacer */}
      <button onClick={() => handleSort('name')} className="flex-1 flex items-center gap-1 hover:text-foreground">
        名称 <ArrowUpDown className="w-3 h-3" />
      </button>
      <button onClick={() => handleSort('mimeType')} className="w-20 hidden md:flex items-center gap-1 hover:text-foreground">
        类型 <ArrowUpDown className="w-3 h-3" />
      </button>
      <button onClick={() => handleSort('size')} className="w-16 hidden md:flex items-center gap-1 justify-end hover:text-foreground">
        大小 <ArrowUpDown className="w-3 h-3" />
      </button>
      <button onClick={() => handleSort('modifiedAt')} className="w-28 hidden lg:flex items-center gap-1 justify-end hover:text-foreground">
        修改时间 <ArrowUpDown className="w-3 h-3" />
      </button>
      <button onClick={() => handleSort('syncStatus')} className="w-12 flex items-center gap-1 hover:text-foreground">
        同步
      </button>
      <span className="w-5" /> {/* star spacer */}
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

  // CP0: empty placeholder — real data comes from collection in Phase 1
  const files: FileListItem[] = useMemo(() => [], [selectedTreeNodeId])

  if (files.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <ColumnHeader />
        <EmptyState />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <ColumnHeader />
      <ScrollArea className="flex-1">
        <div className="divide-y divide-border/20">
          {files.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              isSelected={selectedFileId === file.id}
              onClick={() => selectFile(file.id)}
              onDoubleClick={() => {
                selectFile(file.id)
                // TODO Phase 1: open detail pane / drill into folder
              }}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

export default FilesListPane
