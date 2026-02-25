/**
 * FileDetailPane - Right pane file detail skeleton
 *
 * Section 8.4: Three tabs — Preview, Metadata, Lineage
 * Header actions: open URI, copy Pod URI, toggle star, soft delete
 *
 * CP0: skeleton with tab structure, no real data.
 */
import {
  ExternalLink,
  Copy,
  Star,
  Trash2,
  FileText,
  Eye,
  Info,
  GitBranch,
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
// Empty State
// ============================================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
      <FileText className="w-12 h-12 text-muted-foreground/30" />
      <p className="text-sm">选择一个文件查看详情</p>
    </div>
  )
}

// ============================================================================
// Tab Content Placeholders
// ============================================================================

function PreviewTab() {
  return (
    <div className="p-6 text-center text-sm text-muted-foreground">
      <Eye className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
      <p>文件预览区</p>
      <p className="text-xs mt-1 text-muted-foreground/60">
        支持文本/Markdown、图片、Turtle (.ttl) 多维表格视图
      </p>
    </div>
  )
}

function MetadataTab() {
  return (
    <div className="p-6 space-y-4">
      <p className="text-sm text-muted-foreground">文件元数据</p>
      {/* CP0 placeholder rows */}
      {['id', 'name', 'podUri', 'mimeType', 'size', 'hash', 'owner', 'folder', 'createdAt', 'modifiedAt', 'syncStatus'].map(
        (field) => (
          <div key={field} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{field}</span>
            <span className="text-foreground/60">--</span>
          </div>
        ),
      )}
    </div>
  )
}

function LineageTab() {
  return (
    <div className="p-6 text-center text-sm text-muted-foreground">
      <GitBranch className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
      <p>来源追踪</p>
      <p className="text-xs mt-1 text-muted-foreground/60">
        manual / session / import 来源信息
      </p>
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

  if (!selectedFileId) return <EmptyState />

  return (
    <div className="flex flex-col h-full">
      {/* Header actions */}
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border/50 shrink-0">
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5">
          <ExternalLink className="w-3.5 h-3.5" />
          打开原路径
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5">
          <Copy className="w-3.5 h-3.5" />
          复制 Pod URI
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5">
          <Star className="w-3.5 h-3.5" />
          标星
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive"
        >
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
        {detailTab === 'preview' && <PreviewTab />}
        {detailTab === 'metadata' && <MetadataTab />}
        {detailTab === 'lineage' && <LineageTab />}
      </ScrollArea>
    </div>
  )
}

export default FileDetailPane
