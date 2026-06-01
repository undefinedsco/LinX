import { useCallback } from 'react'
import {
  Copy,
  Star,
  ExternalLink,
  FileText,
  Eye,
  Info,
  GitBranch,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useFilesStore, type FileDetailTab } from '../store'
import { useFavoriteList, favoriteHooks } from '@/modules/favorites/collections'
import { useFileDetail } from '../queries'
import type { FilesDetail } from '../browser'
import { LDP, SCHEMA } from '@undefineds.co/models'

const TABS: { value: FileDetailTab; label: string; icon: typeof Eye }[] = [
  { value: 'preview', label: '预览', icon: Eye },
  { value: 'metadata', label: '元数据', icon: Info },
  { value: 'lineage', label: '来源', icon: GitBranch },
]

function formatBytes(bytes?: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN')
  } catch {
    return iso
  }
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
      <FileText className="w-12 h-12 text-muted-foreground/30" />
      <p className="text-sm">选择一个文件查看详情</p>
    </div>
  )
}

// ============================================================================
// Tab Content — CP1 functional
// ============================================================================

function PreviewTab({ file }: { file: FilesDetail }) {
  if (file.previewText) {
    return (
      <div className="p-4">
        <pre className="font-mono text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap break-words bg-muted/20 rounded-lg p-4 border border-border/30">
          {file.previewText}
        </pre>
      </div>
    )
  }

  return (
    <div className="p-6 text-center text-sm text-muted-foreground">
      <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
      <p>{file.previewUnavailableReason ?? '当前资源暂不支持内联预览。'}</p>
      <p className="text-xs mt-1 text-muted-foreground/60">{file.mimeType ?? '未知类型'}</p>
    </div>
  )
}

function MetadataTab({ file }: { file: FilesDetail }) {
  const rows: [string, string][] = [
    ['ID', file.id],
    ['名称', file.name],
    ['URI', file.uri],
    ['MIME 类型', file.mimeType ?? '未知'],
    ['大小', formatBytes(file.size)],
    ['类别', file.kind === 'container' ? '容器' : '文件'],
    ['父容器', file.parentUri],
    ['修改时间', formatDateTime(file.modifiedAt)],
  ]

  return (
    <div className="p-4 space-y-1">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between py-1.5 text-xs border-b border-border/20 last:border-0">
          <span className="text-muted-foreground shrink-0 w-20">{label}</span>
          <span className="text-foreground/80 text-right break-all">{value}</span>
        </div>
      ))}
    </div>
  )
}

function LineageTab({ file }: { file: FilesDetail }) {
  return (
    <div className="p-4 space-y-4">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">资源类别</p>
        <span className={cn('text-[10px] px-2 py-0.5 rounded font-medium bg-muted text-muted-foreground')}>
          {file.kind === 'container' ? '容器' : '文件'}
        </span>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">父容器</p>
        <p className="text-xs text-foreground/80 break-all">{file.parentUri}</p>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">最近修改</p>
        <p className="text-xs text-foreground/80">{formatDateTime(file.modifiedAt)}</p>
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function FileDetailPane() {
  const selectedFileId = useFilesStore((s) => s.selectedFileId)
  const selectedTreeNodeId = useFilesStore((s) => s.selectedTreeNodeId)
  const detailTab = useFilesStore((s) => s.detailTab)
  const setDetailTab = useFilesStore((s) => s.setDetailTab)
  const { data: file, isLoading, error } = useFileDetail(selectedFileId)
  const { data: favorites = [] } = useFavoriteList({ sourceModule: 'files' })

  const isFavorite = !!file && favorites.some((favorite) => favorite.target === file.uri)

  if (!selectedFileId) return <EmptyState />
  if (isLoading) return <EmptyState />
  if (error || !file) return <EmptyState />

  const handleCopyUri = useCallback(() => {
    navigator.clipboard?.writeText(file.uri)
  }, [file.uri])

  const handleOpenUri = useCallback(() => {
    window.open(file.uri, '_blank', 'noopener,noreferrer')
  }, [file.uri])

  const handleToggleFavorite = useCallback(async () => {
    await favoriteHooks.onStarredChange('files', file.uri, !isFavorite, {
      title: file.name,
      targetType: file.kind === 'container' ? LDP.Container : SCHEMA.MediaObject,
      searchText: file.name,
      snapshotContent: file.previewText ?? undefined,
      snapshotMeta: JSON.stringify({
        fileId: file.uri,
        treeNodeId: selectedTreeNodeId,
      }),
    })
  }, [file.kind, file.name, file.previewText, file.uri, isFavorite, selectedTreeNodeId])

  return (
    <div className="flex flex-col h-full">
      {/* File name header */}
      <div className="px-4 pt-3 pb-1 shrink-0">
        <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
        <p className="text-[11px] text-muted-foreground truncate">{file.parentUri}</p>
      </div>

      {/* Header actions */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border/50 shrink-0">
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" aria-label="打开原始 URI" onClick={handleOpenUri}>
          <ExternalLink className="w-3.5 h-3.5" />
          打开 URI
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" aria-label="复制 URI" onClick={handleCopyUri}>
          <Copy className="w-3.5 h-3.5" />
          复制 URI
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" aria-label="收藏" onClick={handleToggleFavorite}>
          <Star className={cn('w-3.5 h-3.5', isFavorite && 'text-amber-500 fill-amber-500')} />
          {isFavorite ? '取消收藏' : '加入收藏'}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/50 shrink-0">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = detailTab === tab.value
          return (
            <button
              key={tab.value}
              onClick={() => setDetailTab(tab.value)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              <Icon strokeWidth={1.5} className="w-3 h-3" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <ScrollArea className="flex-1">
        {detailTab === 'preview' && <PreviewTab file={file} />}
        {detailTab === 'metadata' && <MetadataTab file={file} />}
        {detailTab === 'lineage' && <LineageTab file={file} />}
      </ScrollArea>
    </div>
  )
}

export default FileDetailPane
