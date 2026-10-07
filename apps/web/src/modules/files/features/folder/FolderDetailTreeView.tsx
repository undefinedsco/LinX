import { Fragment, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { FileText, Folder, Plus } from 'lucide-react'

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'

import {
  projectFolderChildKeyboardNavigationPlan,
  projectFolderChildCollectionRow,
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
  parentFile,
  siblingEntries,
  ...shared
}: TreeSharedProps & {
  child: FilesEntry
  parentFile: FilesDetail
  siblingEntries: FilesEntry[]
}) {
  const isContainer = child.kind === 'container'
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
    const isMultiSelectGesture = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    if (!isContainer && !isMultiSelectGesture) {
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
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    shared.onKeyboardSelect(child)
    if (event.key === ' ') return
    shared.onOpen(child, 'enter')
  }

  return (
    <div
      data-folder-tree-item="true"
      aria-selected={shared.selectedUris.has(child.uri)}
      className={cn(
        'grid h-7 grid-cols-[minmax(0,1.4fr)_112px_112px_72px] items-center gap-3 border-b border-border/20 px-3 text-xs last:border-0 hover:bg-layout-list-hover',
        shared.selectedUris.has(child.uri) && 'bg-primary/10',
      )}
    >
      <div className="flex min-w-0 items-center">
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
  )
}

export function FolderDetailTreeView({
  file,
  rows,
  collectionChrome,
  onSortKey,
  onAdd,
  ...shared
}: TreeSharedProps & {
  file: FilesDetail
  rows: FolderChildCollectionRow[]
  collectionChrome: FolderChildCollectionChrome
  onSortKey: (key: FolderSortState['key']) => void
  onAdd?: () => void
}) {
  const siblingEntries = rows.map((row) => row.entry)
  return (
    <div data-folder-tree="true" aria-label={collectionChrome.ariaLabel} className="overflow-hidden border-y border-border/30">
      <div className="grid grid-cols-[minmax(0,1.4fr)_112px_112px_72px] gap-3 border-b border-border/25 bg-muted/15 px-3 py-1.5 text-[10px] font-medium uppercase text-muted-foreground">
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
          parentFile={file}
          siblingEntries={siblingEntries}
          {...shared}
        />
      ))}
      {onAdd ? (
        <button
          type="button"
          aria-label="添加"
          className="flex h-7 w-full items-center justify-center gap-1 text-xs text-muted-foreground hover:bg-layout-list-hover hover:text-foreground"
          onClick={onAdd}
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          添加
        </button>
      ) : null}
    </div>
  )
}
