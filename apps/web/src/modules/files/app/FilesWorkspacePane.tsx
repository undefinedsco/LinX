import { useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { FilesListPane } from '../features/list/FilesListPane'
import { FileDetailPane } from '../features/detail/FileDetailPane'
import { useFilesStore } from './store'
import { structuredSubjectRouteFromBrowser, structuredSubjectRouteFromSearchObject } from './route-state'
import { FilesRouteBridgeProvider, useFilesRouteBridge } from './FilesRouteContext'

function FilesWorkspacePaneContent(props: MicroAppPaneProps) {
  const entryScope = useFilesStore((state) => state.entryScope)
  const selectedFileId = useFilesStore((state) => state.selectedFileId)
  const selectFile = useFilesStore((state) => state.selectFile)
  const restoreStructuredSubjectRoute = useFilesStore((state) => state.restoreStructuredSubjectRoute)
  const returnToStructuredSubject = useFilesStore((state) => state.returnToStructuredSubject)
  const filesRouteBridge = useFilesRouteBridge()
  const compactDetailActive = Boolean(selectedFileId)

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

  return (
    <div className="grid h-full min-h-0 min-w-0 grid-cols-1 bg-background md:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
      <section
        className={cn(
          'min-h-0 border-r border-border/40 bg-layout-list-item md:block',
          compactDetailActive ? 'max-md:hidden' : 'max-md:flex max-md:flex-col',
        )}
        aria-label="文件列表"
      >
        <FilesListPane {...props} />
      </section>
      <section
        className={cn(
          'relative min-h-0 flex-col bg-background md:flex',
          compactDetailActive ? 'max-md:flex' : 'max-md:hidden',
        )}
        aria-label="文件工作区"
      >
        {compactDetailActive ? (
          <div className="flex h-11 shrink-0 items-center border-b border-border/30 bg-background px-2 md:hidden">
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
          </div>
        ) : null}
        {entryScope === 'chat-files' ? (
          <div className="flex min-h-9 shrink-0 items-center gap-2 border-b border-border/30 bg-muted/20 px-3 text-xs">
            <span className="font-medium text-foreground">聊天文件</span>
            <span className="text-muted-foreground">当前范围来自聊天关联文件；目录仍按 Pod 原始位置打开。</span>
          </div>
        ) : null}
        <FileDetailPane />
      </section>
    </div>
  )
}

export function FilesWorkspacePane(props: MicroAppPaneProps) {
  return (
    <FilesRouteBridgeProvider bridge={props.filesRouteBridge}>
      <FilesWorkspacePaneContent {...props} />
    </FilesRouteBridgeProvider>
  )
}

export default FilesWorkspacePane
