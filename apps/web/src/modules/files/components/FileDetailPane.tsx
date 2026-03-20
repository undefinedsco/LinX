/**
 * FileDetailPane - Right pane file detail
 *
 * Section 8.4: Three tabs — Preview, Metadata, Lineage
 * Header actions: open URI, copy Pod URI, toggle star, soft delete
 *
 * CP0: skeleton with tab structure, no real data.
 * CP1: mock file data display, functional preview/metadata/lineage tabs.
 */
import { useCallback } from 'react'
import {
  Copy,
  Star,
  Trash2,
  FileText,
  Eye,
  Info,
  GitBranch,
  Image,
  FileCode,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useFilesStore, type FileDetailTab } from '../store'

// ============================================================================
// Tab definitions
// ============================================================================

const TABS: { value: FileDetailTab; label: string; icon: typeof Eye }[] = [
  { value: 'preview', label: '预览', icon: Eye },
  { value: 'metadata', label: '元数据', icon: Info },
  { value: 'lineage', label: '来源', icon: GitBranch },
]

// ============================================================================
// Mock file detail data (CP1 — replaced by Collection in CP2)
// ============================================================================

interface MockFileDetail {
  id: string
  name: string
  mimeType: string
  size: number
  podUri: string
  hash: string
  owner: string
  folder: string
  createdAt: string
  modifiedAt: string
  syncStatus: string
  starred: boolean
  sourceType: 'manual' | 'session' | 'import'
  sourceLabel: string
  previewContent?: string
}

const MOCK_FILE_DETAILS: Record<string, MockFileDetail> = {
  f1: { id: 'f1', name: 'README.md', mimeType: 'text/markdown', size: 2048, podUri: 'https://pod.example/public/README.md', hash: 'sha256:abc123', owner: 'Alice', folder: '/public', createdAt: '2026-02-20T10:00:00Z', modifiedAt: '2026-02-25T10:30:00Z', syncStatus: 'synced', starred: true, sourceType: 'manual', sourceLabel: '手动创建', previewContent: '# LinX Project\n\nA Solid-first productivity app.\n\n## Features\n- Chat\n- Contacts\n- Files' },
  f2: { id: 'f2', name: 'config.json', mimeType: 'application/json', size: 512, podUri: 'https://pod.example/private/config.json', hash: 'sha256:def456', owner: 'Alice', folder: '/private', createdAt: '2026-02-18T08:00:00Z', modifiedAt: '2026-02-25T09:15:00Z', syncStatus: 'synced', starred: false, sourceType: 'manual', sourceLabel: '手动创建', previewContent: '{\n  "theme": "dark",\n  "language": "zh-CN"\n}' },
  f3: { id: 'f3', name: 'session-log.txt', mimeType: 'text/plain', size: 15360, podUri: 'https://pod.example/sessions/log.txt', hash: 'sha256:ghi789', owner: 'Alice', folder: '/sessions', createdAt: '2026-02-24T17:00:00Z', modifiedAt: '2026-02-24T18:00:00Z', syncStatus: 'pending', starred: false, sourceType: 'session', sourceLabel: 'Claude Code #1', previewContent: '[10:30] User: Fix the login bug\n[10:31] Assistant: Looking at the auth module...\n[10:32] Tool: edit_file auth.ts' },
  f4: { id: 'f4', name: 'contacts-export.csv', mimeType: 'text/csv', size: 8192, podUri: 'https://pod.example/imports/contacts.csv', hash: 'sha256:jkl012', owner: 'Alice', folder: '/imports', createdAt: '2026-02-23T14:00:00Z', modifiedAt: '2026-02-23T14:20:00Z', syncStatus: 'synced', starred: false, sourceType: 'import', sourceLabel: 'CSV 导入 2026-02' },
  f5: { id: 'f5', name: 'profile-photo.png', mimeType: 'image/png', size: 245760, podUri: 'https://pod.example/public/photo.png', hash: 'sha256:mno345', owner: 'Alice', folder: '/public', createdAt: '2026-02-22T10:00:00Z', modifiedAt: '2026-02-22T11:00:00Z', syncStatus: 'synced', starred: true, sourceType: 'manual', sourceLabel: '手动上传' },
  f6: { id: 'f6', name: 'notes.md', mimeType: 'text/markdown', size: 4096, podUri: 'https://pod.example/private/notes.md', hash: 'sha256:pqr678', owner: 'Alice', folder: '/private', createdAt: '2026-02-26T07:00:00Z', modifiedAt: '2026-02-26T08:00:00Z', syncStatus: 'synced', starred: false, sourceType: 'manual', sourceLabel: '手动创建', previewContent: '# Meeting Notes\n\n- Discussed architecture\n- Agreed on TanStack DB approach' },
  f7: { id: 'f7', name: 'data-backup.ttl', mimeType: 'text/turtle', size: 32768, podUri: 'https://pod.example/backups/data.ttl', hash: 'sha256:stu901', owner: 'Alice', folder: '/backups', createdAt: '2026-02-20T16:00:00Z', modifiedAt: '2026-02-20T16:45:00Z', syncStatus: 'conflict', starred: false, sourceType: 'import', sourceLabel: 'Pod 备份导入' },
  f8: { id: 'f8', name: 'error-log.txt', mimeType: 'text/plain', size: 1024, podUri: 'https://pod.example/sessions/error.txt', hash: 'sha256:vwx234', owner: 'Alice', folder: '/sessions', createdAt: '2026-02-21T09:00:00Z', modifiedAt: '2026-02-21T09:30:00Z', syncStatus: 'error', starred: false, sourceType: 'session', sourceLabel: 'Cursor Session', previewContent: 'Error: ENOENT: no such file or directory\n  at Object.openSync (fs.js:498:3)' },
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDateTime(iso: string): string {
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

function PreviewTab({ file }: { file: MockFileDetail }) {
  const isImage = file.mimeType.startsWith('image/')
  const isText = file.mimeType.startsWith('text/') || file.mimeType === 'application/json'

  if (isImage) {
    return (
      <div className="p-6 flex flex-col items-center gap-3">
        <Image className="w-16 h-16 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">{file.name}</p>
        <p className="text-xs text-muted-foreground/60">{formatBytes(file.size)}</p>
      </div>
    )
  }

  if (isText && file.previewContent) {
    return (
      <div className="p-4">
        <pre className="font-mono text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap break-words bg-muted/20 rounded-lg p-4 border border-border/30">
          {file.previewContent}
        </pre>
      </div>
    )
  }

  return (
    <div className="p-6 text-center text-sm text-muted-foreground">
      <FileCode className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
      <p>无法预览此文件类型</p>
      <p className="text-xs mt-1 text-muted-foreground/60">{file.mimeType}</p>
    </div>
  )
}

function MetadataTab({ file }: { file: MockFileDetail }) {
  const rows: [string, string][] = [
    ['ID', file.id],
    ['名称', file.name],
    ['Pod URI', file.podUri],
    ['MIME 类型', file.mimeType],
    ['大小', formatBytes(file.size)],
    ['Hash', file.hash],
    ['所有者', file.owner],
    ['目录', file.folder],
    ['创建时间', formatDateTime(file.createdAt)],
    ['修改时间', formatDateTime(file.modifiedAt)],
    ['同步状态', file.syncStatus],
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

function LineageTab({ file }: { file: MockFileDetail }) {
  const sourceConfig = {
    manual: { label: '手动', badgeClass: 'bg-muted text-muted-foreground' },
    session: { label: 'CLI Session', badgeClass: 'bg-purple-500/10 text-purple-600' },
    import: { label: '导入', badgeClass: 'bg-blue-500/10 text-blue-600' },
  }
  const src = sourceConfig[file.sourceType]

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">来源类型</p>
        <span className={cn('text-[10px] px-2 py-0.5 rounded font-medium', src.badgeClass)}>
          {src.label}
        </span>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">来源详情</p>
        <p className="text-xs text-foreground/80">{file.sourceLabel}</p>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">创建时间</p>
        <p className="text-xs text-foreground/80">{formatDateTime(file.createdAt)}</p>
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function FileDetailPane() {
  const selectedFileId = useFilesStore((s) => s.selectedFileId)
  const detailTab = useFilesStore((s) => s.detailTab)
  const setDetailTab = useFilesStore((s) => s.setDetailTab)

  const file = selectedFileId ? MOCK_FILE_DETAILS[selectedFileId] : null

  if (!selectedFileId || !file) return <EmptyState />

  const handleCopyUri = useCallback(() => {
    navigator.clipboard?.writeText(file.podUri)
  }, [file.podUri])

  return (
    <div className="flex flex-col h-full">
      {/* File name header */}
      <div className="px-4 pt-3 pb-1 shrink-0">
        <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
        <p className="text-[11px] text-muted-foreground truncate">{file.folder}</p>
      </div>

      {/* Header actions */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border/50 shrink-0">
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" aria-label="复制 Pod URI" onClick={handleCopyUri}>
          <Copy className="w-3.5 h-3.5" />
          复制 URI
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" aria-label="标星">
          <Star className={cn('w-3.5 h-3.5', file.starred && 'text-amber-500 fill-amber-500')} />
          {file.starred ? '取消标星' : '标星'}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive" aria-label="删除">
          <Trash2 className="w-3.5 h-3.5" />
          删除
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
