import {
  Copy,
  Download,
  Star,
  ExternalLink,
  FileText,
  Eye,
  GitBranch,
  FolderOpen,
  MoreHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  SourceLinkedCardDrawerMetadata,
} from './FileDetailMetadataPanels'
import {
  FileDetailLineage,
  FileDetailPreview,
} from './FileDetailPreview'
import { ResourceMetaDrawer, ResourceSidecarActions } from '../sidecars/ResourceSidecars'
import {
  useFileDetailPaneController,
  type FileDetailTab,
} from './useFileDetailPaneController'

const TABS: { value: FileDetailTab; label: string; icon: typeof Eye }[] = [
  { value: 'preview', label: '预览', icon: Eye },
  { value: 'lineage', label: '来源', icon: GitBranch },
]

function EmptyState({
  title = '选择一个文件查看详情',
  description,
}: {
  title?: string
  description?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
      <FileText className="w-12 h-12 text-muted-foreground/30" />
      <p className="text-sm">{title}</p>
      {description ? <p className="max-w-[280px] text-center text-xs text-muted-foreground/70">{description}</p> : null}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function FileDetailPane() {
  const {
    activeDetailTab,
    closeMetaDrawer,
    detailScrollAreaRef,
    emptyState,
    file,
    handleCopyUri,
    handleEnterParentContainer,
    handleOpenUri,
    handleReturnToStructuredSubject,
    handleSystemOpen,
    handleToggleFavorite,
    isFavorite,
    metaDrawerOpen,
    openMetaDrawer,
    resourceActions,
    selectedFileId,
    setDetailTab,
    showHeadSidecarActions,
    showMetaDrawer,
    showSourceLinkedDrawerMetadata,
    showTabs,
    sidecarOwnerTarget,
    structuredReturnAction,
  } = useFileDetailPaneController()

  if (emptyState || !file || !selectedFileId || !sidecarOwnerTarget) {
    return <EmptyState {...(emptyState ?? {})} />
  }

  const metaDrawerChildren = showSourceLinkedDrawerMetadata
    ? <SourceLinkedCardDrawerMetadata file={file} />
    : null

  return (
    <div className="flex h-full flex-col">
      <div
        aria-label="文件详情 head"
        className="flex min-h-12 shrink-0 items-center gap-3 border-b border-border/50 px-4 py-1.5"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
          <p className="truncate text-[11px] text-muted-foreground" title={file.uri}>{file.uri}</p>
        </div>
        {structuredReturnAction ? (
          <button
            className="shrink-0 text-[11px] font-medium text-primary hover:underline"
            onClick={handleReturnToStructuredSubject}
          >
            {structuredReturnAction.label}
          </button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-sm text-muted-foreground hover:text-foreground"
          aria-label={isFavorite ? '取消收藏' : '收藏'}
          title={isFavorite ? '取消收藏' : '收藏'}
          onClick={() => { void handleToggleFavorite() }}
        >
          <Star className={cn('h-3.5 w-3.5', isFavorite && 'fill-amber-500 text-amber-500')} />
        </Button>
        {showHeadSidecarActions ? (
          <ResourceSidecarActions
            file={file}
            compact
            onMeta={openMetaDrawer}
          />
        ) : null}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-sm text-muted-foreground hover:text-foreground"
              aria-label="更多资源操作"
              title="更多资源操作"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem onSelect={handleOpenUri}>
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              打开原始 URI
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleCopyUri}>
              <Copy className="mr-2 h-3.5 w-3.5" />
              复制 URI
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleEnterParentContainer}>
              <FolderOpen className="mr-2 h-3.5 w-3.5" />
              进入所在容器
            </DropdownMenuItem>
            {resourceActions.map((action) => action.id === 'download' ? (
              <DropdownMenuItem key={action.id} asChild>
                <a href={action.href} download={action.downloadName} aria-label={`${action.label} ${action.downloadName}`}>
                  <Download className="mr-2 h-3.5 w-3.5" />
                  {action.label} {action.downloadName}
                </a>
              </DropdownMenuItem>
            ) : action.id === 'system-open' ? (
              <DropdownMenuItem key={action.id} onSelect={() => handleSystemOpen(action.href)}>
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                {action.label}
              </DropdownMenuItem>
            ) : null)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {showTabs ? (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border/50 shrink-0">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeDetailTab === tab.value
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
      ) : null}

      {/* Tab content */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ScrollArea ref={detailScrollAreaRef} className="h-full">
          {!showTabs ? (
            <FileDetailPreview key={selectedFileId} file={file} onOpenEditableFileSheet={closeMetaDrawer} />
          ) : (
            <>
              {activeDetailTab === 'preview' && <FileDetailPreview key={selectedFileId} file={file} onOpenEditableFileSheet={closeMetaDrawer} />}
              {activeDetailTab === 'lineage' && <FileDetailLineage file={file} />}
            </>
          )}
        </ScrollArea>
        {showMetaDrawer ? (
          <ResourceMetaDrawer file={file} target={sidecarOwnerTarget} open={metaDrawerOpen} onClose={closeMetaDrawer}>
            {metaDrawerChildren}
          </ResourceMetaDrawer>
        ) : null}
      </div>
    </div>
  )
}

export default FileDetailPane
