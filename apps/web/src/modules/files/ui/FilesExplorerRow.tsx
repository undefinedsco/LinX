import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, CircleAlert, FileText, FolderClosed, MoreHorizontal, Star } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { FilesExplorerRowOpenTrigger } from './files-explorer-row-types'

export interface FilesExplorerRowProps {
  uri: string
  name: string
  iconKind: 'folder' | 'document'
  depth: number
  expandable: boolean
  expanded: boolean
  selected: boolean
  /** Only the active tree row participates in the page tab sequence. */
  focusable?: boolean
  favorite?: boolean
  contextTarget?: boolean
  metadataWarning: {
    label: string
    title?: string
  } | null
  onToggle: () => void
  onSelect: (event?: MouseEvent<HTMLDivElement>) => void
  onOpen: (trigger: FilesExplorerRowOpenTrigger) => void
  onToggleFavorite?: () => void
  onContextMenu?: () => void
  onContextMenuOpenChange?: (open: boolean) => void
  onKeyCommand: (key: string) => string | null | undefined
  renderContextMenu: () => ReactNode
  renderActionsMenu?: () => ReactNode
}

export function FilesExplorerRow({
  uri,
  name,
  iconKind,
  depth,
  expandable,
  expanded,
  selected,
  focusable = true,
  favorite = false,
  contextTarget = false,
  metadataWarning,
  onToggle,
  onSelect,
  onOpen,
  onToggleFavorite,
  onContextMenu,
  onContextMenuOpenChange,
  onKeyCommand,
  renderContextMenu,
  renderActionsMenu,
}: FilesExplorerRowProps) {
  const Icon = iconKind === 'folder' ? FolderClosed : FileText
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onOpen('enter')
      return
    }
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault()
      onSelect()
      return
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const nextUri = onKeyCommand(event.key)
      if (nextUri) {
        queueMicrotask(() => {
          const nextRow = Array.from(document.querySelectorAll<HTMLElement>('[data-files-explorer-row-uri]'))
            .find((candidate) => candidate.dataset.filesExplorerRowUri === nextUri)
          nextRow?.focus()
        })
      }
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onKeyCommand(event.key)
    }
  }

  return (
    <ContextMenu onOpenChange={onContextMenuOpenChange}>
      <ContextMenuTrigger asChild>
        <div
          role="treeitem"
          tabIndex={focusable ? 0 : -1}
          aria-label={name}
          aria-level={depth + 1}
          aria-selected={selected}
          aria-expanded={expandable ? expanded : undefined}
          data-files-explorer-row-uri={uri}
          data-context-menu-target={contextTarget ? 'true' : undefined}
          onClick={onSelect}
          onContextMenu={onContextMenu}
          onDoubleClick={() => onOpen('double-click')}
          onKeyDown={handleKeyDown}
          className={cn(
            'group relative flex h-7 w-full max-w-full min-w-0 cursor-pointer select-none items-center gap-1 overflow-hidden px-1 pr-12 text-xs leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
            selected
              ? 'bg-layout-list-selected text-foreground'
              : contextTarget
                ? 'bg-layout-list-hover text-foreground'
                : 'text-foreground hover:bg-layout-list-hover',
          )}
          style={{ paddingLeft: `${4 + depth * 14}px` }}
        >
          {expandable ? (
            <button
              type="button"
              aria-label={`${expanded ? '收起' : '展开'} ${name}`}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation()
                onToggle()
              }}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
              )}
            </button>
          ) : (
            <span className="h-5 w-5 shrink-0" aria-hidden="true" />
          )}
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{name}</span>
          {metadataWarning ? (
            <span
              aria-label={metadataWarning.label}
              title={metadataWarning.title ?? metadataWarning.label}
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-warning"
            >
              <CircleAlert strokeWidth={1.8} className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          ) : null}
          {onToggleFavorite || renderActionsMenu ? (
            <span
              className={cn(
                'absolute right-2 top-1/2 z-10 flex shrink-0 -translate-y-1/2 items-center gap-0.5 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
                favorite || selected || contextTarget || actionsMenuOpen ? 'opacity-100' : 'opacity-0',
              )}
              onPointerDown={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              {onToggleFavorite ? (
                <button
                  type="button"
                  aria-label={`${favorite ? '取消收藏' : '收藏'} ${name}`}
                  title={favorite ? '取消收藏' : '收藏'}
                  className="flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleFavorite()
                  }}
                >
                  <Star className={cn('h-3.5 w-3.5', favorite && 'fill-primary text-primary')} strokeWidth={1.6} />
                </button>
              ) : null}
              {renderActionsMenu ? (
                <DropdownMenu modal={false} open={actionsMenuOpen} onOpenChange={setActionsMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`更多 ${name} 操作`}
                      title="更多"
                      className="flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        setActionsMenuOpen(true)
                      }}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.6} />
                    </button>
                  </DropdownMenuTrigger>
                  {renderActionsMenu()}
                </DropdownMenu>
              ) : null}
            </span>
          ) : null}
        </div>
      </ContextMenuTrigger>
      {renderContextMenu()}
    </ContextMenu>
  )
}
