import { Fragment } from 'react'
import { ChevronRight, FileText, FolderOpen } from 'lucide-react'

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'

import type { FolderChildActionKind, FolderColumnRow, FolderSortState } from '../../domain/folder/folder-detail-model'
import type { FolderChildOpenTrigger } from '../../domain/folder/folder-child-open'
import type { FilesDetail, FilesEntry } from '../../domain/resource/resource-model'
import { useFolderColumnPanelController } from './useFolderColumnPanelController'
import { useFolderDescendantColumnController } from './useFolderDescendantColumnController'

export type FolderColumnChildAction = (parentFile: FilesDetail, siblingEntries: FilesEntry[], child: FilesEntry) => void

const folderColumnIconByKind = {
  file: FileText,
  folder: FolderOpen,
} satisfies Record<FolderColumnRow['iconKind'], typeof FileText>

export function FolderColumnPanel({
  ariaLabel,
  title,
  parentFile,
  entries,
  selectedUri,
  sort,
  columnDepth,
  onSelect,
  onContextMenuSelect,
  onOpen,
  onCopyUri,
  onCopy,
  onMove,
  onRename,
  onDelete,
}: {
  ariaLabel: string
  title: string
  parentFile: FilesDetail
  entries: FilesEntry[]
  selectedUri?: string | null
  sort: FolderSortState
  columnDepth: number
  onSelect: (parentFile: FilesDetail, siblingEntries: FilesEntry[], child: FilesEntry, columnDepth: number) => void
  onContextMenuSelect: (parentFile: FilesDetail, siblingEntries: FilesEntry[], child: FilesEntry, columnDepth: number) => void
  onOpen: (child: FilesEntry, trigger: FolderChildOpenTrigger) => void
  onCopyUri: (child: FilesEntry) => void
  onCopy: FolderColumnChildAction
  onMove: FolderColumnChildAction
  onRename: FolderColumnChildAction
  onDelete: FolderColumnChildAction
}) {
  const { actionMenu, sortedRows, hasSortedRows, entryCount } = useFolderColumnPanelController({ entries, sort })

  const handleAction = (action: FolderChildActionKind, child: FilesEntry) => {
    if (action === 'open') {
      onOpen(child, 'explicit-open')
      return
    }
    if (action === 'copy-uri') {
      onCopyUri(child)
      return
    }
    if (action === 'rename') {
      onRename(parentFile, entries, child)
      return
    }
    if (action === 'copy') {
      onCopy(parentFile, entries, child)
      return
    }
    if (action === 'move') {
      onMove(parentFile, entries, child)
      return
    }
    onDelete(parentFile, entries, child)
  }

  return (
    <div className="min-w-[220px] border-r border-border/20 bg-background" aria-label={ariaLabel}>
      <div className="flex items-center justify-between gap-2 border-b border-border/20 bg-muted/15 px-2.5 py-1.5">
        <span className="truncate text-[11px] font-medium text-muted-foreground">{title}</span>
        <span className="text-[10px] tabular-nums text-muted-foreground/70">{entryCount}</span>
      </div>
      <div className="py-1" data-folder-column-items="true">
        {hasSortedRows ? sortedRows.map((row) => {
          const child = row.entry
          const selected = child.uri === selectedUri
          const ChildIcon = folderColumnIconByKind[row.iconKind]
          return (
            <ContextMenu key={child.uri}>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  data-folder-child-row="true"
                  aria-current={selected ? 'true' : undefined}
                  className={cn(
                    'grid w-full grid-cols-[18px_minmax(0,1fr)_16px] items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                    selected && 'bg-primary/10 text-foreground',
                  )}
                  onClick={() => onSelect(parentFile, entries, child, columnDepth)}
                  onDoubleClick={() => onOpen(child, 'double-click')}
                  onContextMenu={() => onContextMenuSelect(parentFile, entries, child, columnDepth)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      onOpen(child, 'enter')
                      return
                    }
                    if (event.key === ' ' || event.key === 'Spacebar') {
                      event.preventDefault()
                      onSelect(parentFile, entries, child, columnDepth)
                    }
                  }}
                >
                  <ChildIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="min-w-0 truncate">{child.name}</span>
                  {row.showDescendantIndicator ? (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/70" />
                  ) : (
                    <span aria-hidden="true" />
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
        }) : (
          <div className="px-2.5 py-2 text-xs text-muted-foreground">没有子项</div>
        )}
      </div>
    </div>
  )
}

export function FolderDescendantColumn({
  containerUri,
  selectedUri,
  sort,
  columnDepth,
  onSelect,
  onContextMenuSelect,
  onOpen,
  onCopyUri,
  onCopy,
  onMove,
  onRename,
  onDelete,
}: {
  containerUri: string
  selectedUri?: string | null
  sort: FolderSortState
  columnDepth: number
  onSelect: (parentFile: FilesDetail, siblingEntries: FilesEntry[], child: FilesEntry, columnDepth: number) => void
  onContextMenuSelect: (parentFile: FilesDetail, siblingEntries: FilesEntry[], child: FilesEntry, columnDepth: number) => void
  onOpen: (child: FilesEntry, trigger: FolderChildOpenTrigger) => void
  onCopyUri: (child: FilesEntry) => void
  onCopy: FolderColumnChildAction
  onMove: FolderColumnChildAction
  onRename: FolderColumnChildAction
  onDelete: FolderColumnChildAction
}) {
  const descendantColumn = useFolderDescendantColumnController(containerUri)

  if (descendantColumn.contentState.kind === 'loading') {
    return (
      <div className="min-w-[220px] border-r border-border/20 bg-background p-3 text-xs text-muted-foreground" aria-label={descendantColumn.chrome.ariaLabel}>
        {descendantColumn.chrome.loadingMessage}
      </div>
    )
  }

  if (descendantColumn.contentState.kind === 'unavailable') {
    return (
      <div className="min-w-[220px] border-r border-border/20 bg-background p-3 text-xs text-muted-foreground" aria-label={descendantColumn.chrome.ariaLabel}>
        {descendantColumn.chrome.unavailableMessage}
      </div>
    )
  }

  return (
    <FolderColumnPanel
      ariaLabel={descendantColumn.chrome.ariaLabel}
      title={descendantColumn.chrome.title}
      parentFile={descendantColumn.contentState.parentFile}
      entries={descendantColumn.entries}
      selectedUri={selectedUri}
      sort={sort}
      columnDepth={columnDepth}
      onSelect={onSelect}
      onContextMenuSelect={onContextMenuSelect}
      onOpen={onOpen}
      onCopyUri={onCopyUri}
      onCopy={onCopy}
      onMove={onMove}
      onRename={onRename}
      onDelete={onDelete}
    />
  )
}
