import { Fragment, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { FileText, FolderOpen } from 'lucide-react'

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'

import type { FolderChildOpenTrigger } from '../../domain/folder/folder-child-open'
import { projectFolderChildKeyboardNavigationPlan, type
  FolderChildActionKind,
  FolderChildActionMenuChrome,
  FolderChildCollectionChrome,
  FolderChildCollectionRow,
  FolderSortHeaderChrome,
  FolderDetailCollectionViewMode,
  FolderSortState,
} from '../../domain/folder/folder-detail-model'
import type { FilesEntry } from '../../domain/resource/resource-model'

export type FolderChildCollectionViewMode = FolderDetailCollectionViewMode

const folderChildIconByKind = {
  file: FileText,
  folder: FolderOpen,
} satisfies Record<FolderChildCollectionRow['iconKind'], typeof FileText>

function folderChildButtonClassName({
  selected,
  viewMode,
}: {
  selected: boolean
  viewMode: FolderChildCollectionViewMode
}) {
  return cn(
    selected && 'bg-primary/10',
    viewMode === 'icons'
      ? 'flex min-h-24 flex-col items-center justify-center gap-2 rounded-md border border-border/30 px-3 py-3 text-center text-xs transition-colors hover:bg-muted/50'
      : 'grid h-7 w-full grid-cols-[minmax(0,1.4fr)_112px_112px_72px] items-center gap-3 border-b border-border/20 px-3 text-left text-xs transition-colors last:border-0 hover:bg-layout-list-hover',
  )
}

function FolderSortHeaderButton({
  sort,
  header,
  onSortKey,
}: {
  sort: FolderSortState
  header: FolderSortHeaderChrome
  onSortKey: (key: FolderSortState['key']) => void
}) {
  return (
    <button
      type="button"
      aria-label={header.ariaLabel}
      className={cn(
        'truncate rounded px-1 py-0.5 text-[10px] font-medium uppercase transition-colors hover:bg-muted/70 hover:text-foreground',
        header.align === 'right' && 'text-right',
        sort.key === header.key ? 'text-foreground' : 'text-muted-foreground',
      )}
      onClick={() => onSortKey(header.key)}
    >
      <span>{header.label}</span>
      {sort.key === header.key ? <span aria-hidden="true">{sort.direction === 'asc' ? ' ↑' : ' ↓'}</span> : null}
    </button>
  )
}

export function FolderChildCollectionView({
  viewMode,
  rows,
  selectedUris,
  sort,
  actionMenu,
  collectionChrome,
  onSortKey,
  onSelect,
  onKeyboardSelect,
  onContextMenuSelect,
  onOpen,
  onCopyUri,
  onRename,
  onCopy,
  onMove,
  onDelete,
}: {
  viewMode: FolderChildCollectionViewMode
  rows: FolderChildCollectionRow[]
  selectedUris: ReadonlySet<string>
  sort: FolderSortState
  actionMenu: FolderChildActionMenuChrome
  collectionChrome: FolderChildCollectionChrome
  onSortKey: (key: FolderSortState['key']) => void
  onSelect: (child: FilesEntry, event: ReactMouseEvent<HTMLButtonElement>) => void
  onKeyboardSelect: (child: FilesEntry) => void
  onContextMenuSelect: (child: FilesEntry) => void
  onOpen: (child: FilesEntry, trigger: FolderChildOpenTrigger) => void
  onCopyUri: (child: FilesEntry) => void
  onRename: (child: FilesEntry) => void
  onCopy: (child: FilesEntry) => void
  onMove: (child: FilesEntry) => void
  onDelete: (child: FilesEntry) => void
}) {
  const handleChildKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, child: FilesEntry) => {
    const navigationPlan = projectFolderChildKeyboardNavigationPlan({
      currentChildUri: child.uri,
      key: event.key,
      sortedChildren: rows.map((row) => row.entry),
    })
    if (navigationPlan.handled) {
      event.preventDefault()
      if (!navigationPlan.nextChild) return
      onKeyboardSelect(navigationPlan.nextChild)
      const rowButtons = Array.from(
        event.currentTarget
          .closest('[data-folder-child-list="true"]')
          ?.querySelectorAll<HTMLButtonElement>('[data-folder-child-row="true"]') ?? [],
      )
      rowButtons[navigationPlan.nextIndex]?.focus()
      return
    }
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return
    event.preventDefault()
    onKeyboardSelect(child)
    if (event.key === 'Enter') {
      onOpen(child, 'enter')
    }
  }

  const handleAction = (action: FolderChildActionKind, child: FilesEntry) => {
    if (action === 'open') {
      window.setTimeout(() => onOpen(child, 'explicit-open'), 0)
      return
    }
    if (action === 'copy-uri') {
      onCopyUri(child)
      return
    }
    if (action === 'rename') {
      onRename(child)
      return
    }
    if (action === 'copy') {
      onCopy(child)
      return
    }
    if (action === 'move') {
      onMove(child)
      return
    }
    onDelete(child)
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border border-border/40',
        viewMode === 'icons' && 'grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 border-0',
      )}
      data-folder-child-list="true"
      aria-label={collectionChrome.ariaLabel}
    >
      {viewMode === 'list' ? (
        <div className="grid grid-cols-[minmax(0,1.4fr)_112px_112px_72px] gap-3 border-b border-border/25 bg-muted/20 px-3 py-1.5 text-[10px] font-medium uppercase text-muted-foreground">
          {collectionChrome.sortHeaders.map((header) => (
            <FolderSortHeaderButton key={header.key} sort={sort} header={header} onSortKey={onSortKey} />
          ))}
        </div>
      ) : null}
      {rows.map((row) => {
        const child = row.entry
        const ChildIcon = folderChildIconByKind[row.iconKind]

        return (
        <ContextMenu key={child.uri}>
          <ContextMenuTrigger asChild>
            <button
              data-folder-child-row="true"
              className={folderChildButtonClassName({
                selected: selectedUris.has(child.uri),
                viewMode,
              })}
              onClick={(event) => {
                onSelect(child, event)
                const isMultiSelectGesture = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
                if (child.kind !== 'container' && !isMultiSelectGesture) onOpen(child, 'click')
              }}
              onContextMenu={() => onContextMenuSelect(child)}
              onDoubleClick={() => onOpen(child, 'double-click')}
              onKeyDown={(event) => handleChildKeyDown(event, child)}
            >
              {viewMode === 'icons' ? (
                <>
                  <ChildIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate text-foreground/80">{child.name}</span>
                </>
              ) : (
                <>
                  <span className="flex min-w-0 items-center gap-2">
                    <ChildIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate text-foreground/80">{child.name}</span>
                  </span>
                  <span className="truncate text-muted-foreground">{row.typeLabel}</span>
                  <span className="truncate text-muted-foreground">{row.modifiedLabel}</span>
                  <span className="text-right text-muted-foreground">{row.sizeLabel}</span>
                </>
              )}
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-40">
            {actionMenu.items.map((item) => (
              <Fragment key={item.kind}>
                {item.separatorBefore ? <ContextMenuSeparator /> : null}
                <ContextMenuItem
                  className={item.destructive ? 'text-destructive focus:text-destructive' : undefined}
                  onSelect={() => handleAction(item.kind, child)}
                >
                  {item.label}
                </ContextMenuItem>
              </Fragment>
            ))}
          </ContextMenuContent>
        </ContextMenu>
        )
      })}
    </div>
  )
}
