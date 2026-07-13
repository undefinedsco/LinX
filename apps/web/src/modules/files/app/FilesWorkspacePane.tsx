import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, FolderTree } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { FilesListPane } from '../features/list/FilesListPane'
import { FileDetailPane } from '../features/detail/FileDetailPane'
import { FilesTreePane } from '../features/tree/FilesTreePane'
import { useFilesStore } from './store'
import { structuredSubjectRouteFromBrowser, structuredSubjectRouteFromSearchObject } from './route-state'
import { useFilesRouteBridge } from './FilesRouteContext'

function FilesWorkspacePaneContent(props: MicroAppPaneProps) {
  const { compact = false, compactNavigation, theme } = props
  const entryScope = useFilesStore((state) => state.entryScope)
  const selectedFileId = useFilesStore((state) => state.selectedFileId)
  const selectFile = useFilesStore((state) => state.selectFile)
  const restoreStructuredSubjectRoute = useFilesStore((state) => state.restoreStructuredSubjectRoute)
  const returnToStructuredSubject = useFilesStore((state) => state.returnToStructuredSubject)
  const filesRouteBridge = useFilesRouteBridge()
  const compactDetailActive = Boolean(selectedFileId)
  const [compactTreeOpen, setCompactTreeOpen] = useState(false)
  const treeNodeAtOpenRef = useRef<string | null>(null)
  const selectedTreeNodeId = useFilesStore((state) => state.selectedTreeNodeId)

  const openCompactTree = () => {
    treeNodeAtOpenRef.current = selectedTreeNodeId
    setCompactTreeOpen(true)
  }

  useEffect(() => {
    if (compactTreeOpen && treeNodeAtOpenRef.current !== selectedTreeNodeId) {
      setCompactTreeOpen(false)
    }
  }, [compactTreeOpen, selectedTreeNodeId])

  useEffect(() => {
    const applyRoute = (route: ReturnType<typeof structuredSubjectRouteFromBrowser>) => {
      if (route) {
        restoreStructuredSubjectRoute(route)
        return
      }
      if (useFilesStore.getState().structuredSubjectReturnContext) {
        returnToStructuredSubject()
      }
    }

    if (filesRouteBridge) {
      applyRoute(structuredSubjectRouteFromSearchObject(filesRouteBridge.search))
      return
    }

    const restoreFromBrowserRoute = () => {
      applyRoute(structuredSubjectRouteFromBrowser())
    }

    restoreFromBrowserRoute()
    window.addEventListener('popstate', restoreFromBrowserRoute)
    return () => window.removeEventListener('popstate', restoreFromBrowserRoute)
  }, [filesRouteBridge, restoreStructuredSubjectRoute, returnToStructuredSubject])

  const renderDetailSurface = (className?: string) => (
    <section
      className={cn('relative min-h-0 flex-1 flex-col bg-background', className)}
      aria-label="文件工作区"
    >
      {entryScope === 'chat-files' ? (
        <div className="flex min-h-9 shrink-0 items-center gap-2 border-b border-border/30 bg-muted/20 px-3 text-xs">
          <span className="font-medium text-foreground">聊天文件</span>
          <span className="text-muted-foreground">当前范围来自聊天关联文件；目录仍按 Pod 原始位置打开。</span>
        </div>
      ) : null}
      <FileDetailPane />
    </section>
  )

  if (!compact) {
    return (
      <div className="flex h-full min-h-0 min-w-0 bg-background">
        {renderDetailSurface('flex')}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border/30 bg-background px-2 md:hidden">
        {compactDetailActive ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 rounded-md px-2 text-xs"
            onClick={() => selectFile(null)}
            aria-label="返回文件列表"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span>列表</span>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={openCompactTree}
          aria-label="浏览文件夹"
          title="浏览文件夹"
        >
          <FolderTree className="h-4 w-4" aria-hidden="true" />
        </Button>
        <span className="min-w-0 flex-1 truncate px-1 text-xs font-medium text-foreground">文件</span>
        {compactNavigation}
      </div>
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1">
      <section
        className={cn(
          'min-h-0 border-r border-border/40 bg-layout-list-item',
          compactDetailActive ? 'max-md:hidden' : 'max-md:flex max-md:flex-col',
        )}
        aria-label="文件列表"
      >
        <FilesListPane theme={theme} />
      </section>
      {renderDetailSurface(compactDetailActive ? 'max-md:flex' : 'max-md:hidden')}
      </div>
      <Dialog open={compactTreeOpen} onOpenChange={setCompactTreeOpen}>
        <DialogContent variant="sheet-left" className="md:hidden">
          <DialogHeader className="h-12 shrink-0 justify-center border-b border-border/40 px-4 pr-12 text-left">
            <DialogTitle className="text-sm">文件夹</DialogTitle>
            <DialogDescription className="sr-only">选择要浏览的 Pod 文件夹。</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
            <FilesTreePane theme={theme} forceExpanded />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function FilesWorkspacePane(props: MicroAppPaneProps) {
  return <FilesWorkspacePaneContent {...props} />
}

export default FilesWorkspacePane
