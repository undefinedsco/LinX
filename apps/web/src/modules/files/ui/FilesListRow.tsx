import { type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { CircleAlert, FileText, FolderOpen } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'

export type FilesListRowOpenTrigger = 'enter' | 'double-click'

export interface FilesListRowMetadataWarning {
  label: string
  title?: string
}

export interface FilesListRowProps {
  iconKind: 'folder' | 'document'
  name: string
  semanticLabel: string
  mimeTypeLabel: string
  sizeLabel: string
  modifiedLabel: string
  parentPath?: string | null
  parentUri?: string | null
  metadataWarning?: FilesListRowMetadataWarning | null
  isSelected: boolean
  isContextTarget?: boolean
  onClick: (event?: MouseEvent<HTMLDivElement>) => void
  onContextMenu: () => void
  onContextMenuOpenChange: (open: boolean) => void
  onOpen: (trigger: FilesListRowOpenTrigger) => void
  renderContextMenu: () => ReactNode
}

export function FilesListRow({
  iconKind,
  name,
  semanticLabel,
  mimeTypeLabel,
  sizeLabel,
  modifiedLabel,
  parentPath = null,
  parentUri = null,
  metadataWarning = null,
  isSelected,
  isContextTarget = false,
  onClick,
  onContextMenu,
  onContextMenuOpenChange,
  onOpen,
  renderContextMenu,
}: FilesListRowProps) {
  const Icon = iconKind === 'folder' ? FolderOpen : FileText
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onOpen('enter')
      return
    }

    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault()
      onClick()
    }
  }

  return (
    <ContextMenu onOpenChange={onContextMenuOpenChange}>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          aria-label={name}
          data-context-menu-target={isContextTarget ? 'true' : undefined}
          onClick={onClick}
          onContextMenu={onContextMenu}
          onDoubleClick={() => onOpen('double-click')}
          onKeyDown={handleKeyDown}
          className={cn(
            'flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-inset',
            isSelected
              ? 'bg-layout-list-selected'
              : isContextTarget
                ? 'bg-layout-list-hover'
              : 'hover:bg-layout-list-hover',
          )}
        >
          <Icon strokeWidth={1.5} className="w-5 h-5 shrink-0 text-muted-foreground" />

          <div className="flex-1 min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-sm text-foreground truncate">{name}</span>
              {metadataWarning ? (
                <span
                  aria-label={metadataWarning.label}
                  title={metadataWarning.title ?? metadataWarning.label}
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-amber-600"
                >
                  <CircleAlert strokeWidth={1.8} className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              ) : null}
            </div>
            {parentPath ? (
              <div className="mt-0.5 truncate text-[11px] leading-3 text-muted-foreground/70" title={parentUri ?? parentPath}>
                {parentPath}
              </div>
            ) : null}
          </div>

          <span className="text-xs text-muted-foreground w-20 truncate shrink-0 hidden md:block">
            {semanticLabel}
          </span>

          <span className="text-xs text-muted-foreground w-20 truncate shrink-0 hidden md:block" title={mimeTypeLabel}>
            {mimeTypeLabel}
          </span>

          <span className="text-xs text-muted-foreground w-16 text-right shrink-0 hidden md:block">
            {sizeLabel}
          </span>

          <span className="text-xs text-muted-foreground w-28 text-right shrink-0 hidden lg:block">
            {modifiedLabel}
          </span>
        </div>
      </ContextMenuTrigger>
      {renderContextMenu()}
    </ContextMenu>
  )
}
