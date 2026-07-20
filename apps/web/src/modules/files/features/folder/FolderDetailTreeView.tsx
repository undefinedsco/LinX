import { Fragment, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { ChevronDown, ChevronRight, FileText, Folder, LoaderCircle } from 'lucide-react'

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'

import { useFileDetail } from '../../data/queries'
import {
  getVisibleFolderChildren,
  projectFolderChildKeyboardNavigationPlan,
  projectFolderChildCollectionRow,
  sortFolderEntries,
  type FolderChildActionKind,
  type FolderChildActionMenuChrome,
  type FolderChildCollectionChrome,
  type FolderChildCollectionRow,
  type FolderSortState,
} from '../../domain/folder/folder-detail-model'
import type { FolderChildOpenTrigger } from '../../domain/folder/folder-child-open'
import type { FilesDetail, FilesEntry } from '../../domain/resource/resource-model'

type ResourceAction = (parentFile: FilesDetail, siblingEntries: FilesEntry[], child: FilesEntry) => void

type TreeSharedProps = {
  selectedUris: ReadonlySet<string>
  sort: FolderSortState
  actionMenu: FolderChildActionMenuChrome
  onSelect: (child: FilesEntry, event: ReactMouseEvent<HTMLButtonElement>) => void
  onKeyboardSelect: (child: FilesEntry) => void
  onContextMenuSelect: (child: FilesEntry) => void
  onOpen: (child: FilesEntry, trigger: FolderChildOpenTrigger) => void
  onCopyUri: (child: FilesEntry) => void
  onRename: ResourceAction
  onCopy: ResourceAction
  onMove: ResourceAction
  onDelete: ResourceAction
}

function TreeRow({
  child,
  depth,
  parentFile,
  siblingEntries,
  ...shared
}: TreeSharedProps & {
  child: FilesEntry
  depth: number
  parentFile: FilesDetail
  siblingEntries: FilesEntry[]
}) {
  const isContainer = child.kind === 'container'
  const [expanded, setExpanded] = useState(false)
  const row = projectFolderChildCollectionRow(child)

  const handleAction = (action: FolderChildActionKind) => {
    if (action === 'open') {
      window.setTimeout(() => shared.onOpen(child, 'explicit-open'), 0)
      return
    }
    if (action === 'copy-uri') return shared.onCopyUri(child)
    if (action === 'rename') return shared.onRename(parentFile, siblingEntries, child)
    if (action === 'copy') return shared.onCopy(parentFile, siblingEntries, child)
    if (action === 'move') return shared.onMove(parentFile, siblingEntries, child)
    shared.onDelete(parentFile, siblingEntries, child)
  }

  const handleOpen = (event: ReactMouseEvent<HTMLButtonElement>) => {
    shared.onSelect(child, event)
    if (isContainer) {
      setExpanded((current) => !current)
    } else if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      shared.onOpen(child, 'click')
    }
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const navigationPlan = projectFolderChildKeyboardNavigationPlan({
      currentChildUri: child.uri,
      key: event.key,
      sortedChildren: siblingEntries,
    })
    if (navigationPlan.handled) {
      event.preventDefault()
      if (!navigationPlan.nextChild) return
      shared.onKeyboardSelect(navigationPlan.nextChild)
      const rowButtons = Array.from(
        event.currentTarget
          .closest('[data-folder-tree="true"]')
          ?.querySelectorAll<HTMLButtonElement>('[data-folder-tree-row="true"]') ?? [],
      )
      rowButtons.find((button) => button.dataset.folderUri === navigationPlan.nextChild?.uri)?.focus()
      return
    }
    if (event.key === 'ArrowRight' && isContainer && !expanded) {
      event.preventDefault()
      setExpanded(true)
      return
    }
    if (event.key === 'ArrowLeft' && isContainer && expanded) {
      event.preventDefault()
      setExpanded(false)
      return
    }
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    shared.onKeyboardSelect(child)
    if (event.key === ' ') return
    if (isContainer) setExpanded((current) => !current)
    else shared.onOpen(child, 'enter')
  }

  return (
    <>
      <div
        role="treeitem"
        aria-selected={shared.selectedUris.has(child.uri)}
        aria-expanded={isContainer ? expanded : undefined}
        className={cn(
          'grid h-7 grid-cols-[minmax(0,1.4fr)_112px_112px_72px] items-center gap-3 border-b border-border/20 px-3 text-xs last:border-0 hover:bg-layout-list-hover',
          shared.selectedUris.has(child.uri) && 'bg-primary/10',
        )}
      >
        <div className="flex min-w-0 items-center" style={{ paddingLeft: `${depth * 16}px` }}>
          {isContainer ? (
            <button
              type="button"
              className="flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={`${expanded ? '收起' : '展开'} ${child.name}`}
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : <span className="h-6 w-6 shrink-0" aria-hidden="true" />}
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <button
                type="button"
                data-folder-tree-row="true"
                data-folder-uri={child.uri}
                className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={handleOpen}
                onDoubleClick={() => shared.onOpen(child, 'double-click')}
                onContextMenu={() => shared.onContextMenuSelect(child)}
                onKeyDown={handleKeyDown}
              >
                {isContainer
                  ? <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  : <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <span className="truncate text-foreground/85">{child.name}</span>
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-40">
              {shared.actionMenu.items.map((item) => (
                <Fragment key={item.kind}>
                  {item.separatorBefore ? <ContextMenuSeparator /> : null}
                  <ContextMenuItem
                    className={item.destructive ? 'text-destructive focus:text-destructive' : undefined}
                    onSelect={() => handleAction(item.kind)}
                  >
                    {item.label}
                  </ContextMenuItem>
                </Fragment>
              ))}
            </ContextMenuContent>
          </ContextMenu>
        </div>
        <span className="truncate text-muted-foreground">{row.typeLabel}</span>
        <span className="truncate text-muted-foreground">{row.modifiedLabel}</span>
        <span className="text-right text-muted-foreground">{row.sizeLabel}</span>
      </div>
      {isContainer && expanded ? (
        <ExpandedFolderBranch containerUri={child.uri} depth={depth + 1} {...shared} />
      ) : null}
    </>
  )
}

function ExpandedFolderBranch({ containerUri, depth, ...shared }: TreeSharedProps & { containerUri: string; depth: number }) {
  const detailQuery = useFileDetail(containerUri)

  if (detailQuery.isLoading) {
    return (
      <div className="flex h-8 items-center gap-2 px-3 text-xs text-muted-foreground" style={{ paddingLeft: `${depth * 16 + 36}px` }}>
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        正在读取...
      </div>
    )
  }
  const parentFile = detailQuery.data?.kind === 'container' ? detailQuery.data : null
  if (detailQuery.error || !parentFile) {
    return <div className="h-8 px-3 py-2 text-xs text-muted-foreground" style={{ paddingLeft: `${depth * 16 + 36}px` }}>无法读取此文件夹</div>
  }

  const siblingEntries = sortFolderEntries(getVisibleFolderChildren(parentFile.childEntries ?? []), shared.sort)
  if (siblingEntries.length === 0) {
    return <div className="h-8 px-3 py-2 text-xs text-muted-foreground" style={{ paddingLeft: `${depth * 16 + 36}px` }}>空文件夹</div>
  }

  return siblingEntries.map((child) => (
    <TreeRow
      key={child.uri}
      child={child}
      depth={depth}
      parentFile={parentFile}
      siblingEntries={siblingEntries}
      {...shared}
    />
  ))
}

export function FolderDetailTreeView({
  file,
  rows,
  collectionChrome,
  onSortKey,
  ...shared
}: TreeSharedProps & {
  file: FilesDetail
  rows: FolderChildCollectionRow[]
  collectionChrome: FolderChildCollectionChrome
  onSortKey: (key: FolderSortState['key']) => void
}) {
  const siblingEntries = rows.map((row) => row.entry)
  return (
    <div role="tree" data-folder-tree="true" aria-label={collectionChrome.ariaLabel} className="overflow-hidden border-y border-border/30">
      <div className="grid grid-cols-[minmax(0,1.4fr)_112px_112px_72px] gap-3 border-b border-border/25 bg-muted/15 px-3 py-1.5 pl-9 text-[10px] font-medium uppercase text-muted-foreground">
        {collectionChrome.sortHeaders.map((header) => (
          <button
            key={header.key}
            type="button"
            className={cn('truncate text-left hover:text-foreground', header.align === 'right' && 'text-right')}
            aria-label={header.ariaLabel}
            onClick={() => onSortKey(header.key)}
          >
            {header.label}
            {shared.sort.key === header.key ? (shared.sort.direction === 'asc' ? ' ↑' : ' ↓') : null}
          </button>
        ))}
      </div>
      {rows.map((row) => (
        <TreeRow
          key={row.entry.uri}
          child={row.entry}
          depth={0}
          parentFile={file}
          siblingEntries={siblingEntries}
          {...shared}
        />
      ))}
    </div>
  )
}
