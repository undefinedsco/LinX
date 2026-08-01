import {
  Copy,
  Download,
  Star,
  ExternalLink,
  Eye,
  GitBranch,
  FolderOpen,
  MoreHorizontal,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/lib/use-media-query'
import { FilesEmptyState } from '../../ui/FilesEmptyState'
import {
  FileDrawerMetadata,
  SourceLinkedCardDrawerMetadata,
} from './FileDetailMetadataPanels'
import {
  FileDetailLineage,
  FileDetailPreview,
} from './FileDetailPreview'
import { AccessPolicyDialog, ResourceMetaDrawer, ResourceSidecarMenuItems } from '../sidecars/ResourceSidecars'
import {
  useFileDetailPaneController,
  type FileDetailTab,
} from './useFileDetailPaneController'

const TABS: { value: FileDetailTab; label: string; icon: typeof Eye }[] = [
  { value: 'preview', label: '预览', icon: Eye },
  { value: 'lineage', label: '来源', icon: GitBranch },
]

function ResourceLayoutTitle({ slot, name, subtitle }: { slot: HTMLElement; name: string; subtitle?: string }) {
  useLayoutEffect(() => {
    const fallback = slot.querySelector<HTMLElement>('[data-default-micro-app-title="true"]')
    if (fallback) fallback.hidden = true
    return () => {
      if (fallback) fallback.hidden = false
    }
  }, [slot])

  return (
    <div data-resource-title="true" className="min-w-0 max-w-[42vw]">
      <h3 className="truncate text-sm font-medium" title={name}>{name}</h3>
      {subtitle ? (
        <p className="truncate text-[11px] leading-tight text-muted-foreground" title={subtitle}>{subtitle}</p>
      ) : null}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function FileDetailPane() {
  const [accessDialogOpen, setAccessDialogOpen] = useState(false)
  const isXlViewport = useMediaQuery('(min-width: 1280px)')
  const {
    activeDetailTab,
    closeMetaDrawer,
    consumeRequestedSidecarAction,
    detailChrome,
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
    isLoading,
    retryDetail,
    selectedFileId,
    setDetailTab,
    showFileDrawerMetadata,
    showSourceLinkedDrawerMetadata,
    showTabs,
    sidecarOwnerTarget,
    sidecarActionRequest,
    structuredReturnAction,
  } = useFileDetailPaneController()
  const detailErrorState = emptyState && 'title' in emptyState && typeof emptyState.title === 'string'
    ? {
        title: emptyState.title,
        description: 'description' in emptyState && typeof emptyState.description === 'string'
          ? emptyState.description
          : '当前文件暂时不可用，请稍后重试。',
      }
    : null

  useEffect(() => {
    if (consumeRequestedSidecarAction() === 'access') setAccessDialogOpen(true)
  }, [
    consumeRequestedSidecarAction,
    sidecarActionRequest,
  ])

  if (emptyState || !file || !selectedFileId || !sidecarOwnerTarget) {
    if (isLoading && !detailErrorState) {
      return (
        <div role="status" aria-label="正在读取文件详情" className="flex h-full flex-col animate-pulse motion-reduce:animate-none">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/40 px-5">
            <span className="h-5 w-14 rounded-full bg-muted-foreground/15" />
            <span className="h-5 w-14 rounded-full bg-muted-foreground/10" />
          </div>
          <div className="flex flex-col gap-3 px-5 py-6">
            <span className="h-2.5 w-11/12 rounded-full bg-muted-foreground/10" />
            <span className="h-2.5 w-4/5 rounded-full bg-muted-foreground/10" />
            <span className="h-2.5 w-3/5 rounded-full bg-muted-foreground/10" />
            <span className="h-2.5 w-2/5 rounded-full bg-muted-foreground/10" />
          </div>
        </div>
      )
    }

    return (
      <FilesEmptyState
        title={detailErrorState?.title ?? '选择一个文件查看详情'}
        description={detailErrorState?.description ?? '从左侧资源树选择一个文件。'}
        action={detailErrorState ? (
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={retryDetail}>
            重新读取
          </Button>
        ) : undefined}
      />
    )
  }

  const metaDrawerChildren = showSourceLinkedDrawerMetadata
    ? <SourceLinkedCardDrawerMetadata file={file} />
    : showFileDrawerMetadata
      ? <FileDrawerMetadata file={file} />
      : null

  const titleSlot = document.querySelector<HTMLElement>('[data-micro-app-title-slot="true"]')

  const detailActions = (
    <>
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
        <Star className={cn('h-3.5 w-3.5', isFavorite && 'fill-primary text-primary')} />
      </Button>
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
          <DropdownMenuItem onSelect={handleCopyUri}>
            <Copy className="mr-2 h-3.5 w-3.5" />
            复制 URI
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleOpenUri}>
            <ExternalLink className="mr-2 h-3.5 w-3.5" />
            打开原始 URI
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleEnterParentContainer}>
            <FolderOpen className="mr-2 h-3.5 w-3.5" />
            进入所在容器
          </DropdownMenuItem>
          <ResourceSidecarMenuItems
            file={file}
            onMeta={openMetaDrawer}
            onAccess={() => setAccessDialogOpen(true)}
          />
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
    </>
  )

  return (
    <div className="flex h-full flex-col">
      {accessDialogOpen ? (
        <AccessPolicyDialog
          file={file}
          open
          onOpenChange={setAccessDialogOpen}
        />
      ) : null}
      {titleSlot ? createPortal(
        <ResourceLayoutTitle slot={titleSlot} name={file.name} subtitle={detailChrome?.subtitle} />,
        titleSlot,
      ) : null}
      {!titleSlot ? (
        <div aria-label="文件详情 head" className="flex min-h-12 shrink-0 items-center gap-3 border-b border-border/50 px-4 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
            {detailChrome?.subtitle ? (
              <p className="truncate text-[11px] leading-tight text-muted-foreground" title={detailChrome.subtitle}>{detailChrome.subtitle}</p>
            ) : null}
          </div>
          {detailActions}
        </div>
      ) : null}

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
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="relative min-w-0 flex-1 overflow-hidden">
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
        </div>
        {!isXlViewport ? (
          <ResourceMetaDrawer
            file={file}
            target={sidecarOwnerTarget}
            open={metaDrawerOpen}
            onClose={closeMetaDrawer}
            showUserMetadata={!showFileDrawerMetadata}
          >
            {metaDrawerChildren}
          </ResourceMetaDrawer>
        ) : null}
      </div>
      {detailChrome?.footer ? (
        <div aria-label="资源状态条" className="flex h-7 shrink-0 items-center border-t border-border/40 px-4">
          <p className="truncate text-[11px] text-muted-foreground" title={detailChrome.footer}>{detailChrome.footer}</p>
        </div>
      ) : null}
    </div>
  )
}

export default FileDetailPane
