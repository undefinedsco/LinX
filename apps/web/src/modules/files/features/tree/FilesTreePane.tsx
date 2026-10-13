import { FileText, FolderOpen, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import type { FilesEntry } from '../../domain/resource/resource-model'
import { useFilesTreePaneController } from './useFilesTreePaneController'
import { FilesAddMenu } from '../add/FilesAddMenu'
import { FilesExplorerRow } from '../../ui/FilesExplorerRow'

function TreeSearchHeader({
  searchText,
  searchPlaceholder,
  clearSearchLabel,
  onSearchTextChange,
  addContainerUri,
  addEntries,
  addMenuOpen,
  onAddMenuOpenChange,
}: {
  searchText: string
  searchPlaceholder: string
  clearSearchLabel: string
  onSearchTextChange: (value: string) => void
  addContainerUri: string | null
  addEntries: FilesEntry[]
  addMenuOpen: boolean
  onAddMenuOpenChange: (open: boolean) => void
}) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-layout-list-header px-3">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={searchText}
          onChange={(event) => onSearchTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onSearchTextChange('')
          }}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="h-8 rounded-sm border-0 bg-muted/50 pl-8 pr-8 text-xs transition-colors hover:bg-muted/80 focus-visible:bg-background focus-visible:ring-1"
        />
        {searchText ? (
          <button
            type="button"
            aria-label={clearSearchLabel}
            title={clearSearchLabel}
            onClick={() => onSearchTextChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-muted-foreground/20"
          >
            <X strokeWidth={1.5} className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <FilesAddMenu
        containerUri={addContainerUri}
        entries={addEntries}
        open={addMenuOpen}
        onOpenChange={onAddMenuOpenChange}
      />
    </div>
  )
}

function TreeSearchResultRow({
  entry,
  isSelected,
  onOpen,
}: {
  entry: FilesEntry
  isSelected: boolean
  onOpen: () => void
}) {
  const Icon = entry.kind === 'container' ? FolderOpen : FileText
  return (
    <div
      role="treeitem"
      aria-selected={isSelected}
      tabIndex={isSelected ? 0 : -1}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onOpen()
      }}
      className={cn(
        'group relative flex h-7 min-w-0 cursor-pointer select-none items-center gap-1.5 overflow-hidden px-3 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        isSelected
          ? 'bg-layout-list-selected text-foreground'
          : 'text-foreground/80 hover:bg-layout-list-hover',
      )}
    >
      <span className="w-4.5" />
      <Icon strokeWidth={1.5} className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
      {entry.parentUri ? (
        <span className="min-w-0 max-w-[45%] shrink truncate text-[11px] text-muted-foreground" title={entry.parentUri}>
          {entry.parentUri}
        </span>
      ) : null}
    </div>
  )
}

function TreeRootSkeleton({ label }: { label: string }) {
  const widths = ['58%', '44%', '66%']
  return (
    <div role="status" aria-label={label} className="animate-pulse py-0.5 motion-reduce:animate-none">
      {widths.map((width, index) => (
        <div key={index} className="flex h-7 items-center gap-1.5 px-3">
          <span className="h-3.5 w-3.5 shrink-0 rounded-sm bg-muted-foreground/15" />
          <span className="h-4 w-4 shrink-0 rounded-sm bg-muted-foreground/15" />
          <span className="h-2.5 rounded-full bg-muted-foreground/15" style={{ width }} />
        </div>
      ))}
    </div>
  )
}

export function FilesTreePane({ forceExpanded = false }: MicroAppPaneProps & { forceExpanded?: boolean }) {
  const tree = useFilesTreePaneController()
  const { explorer } = tree
  const firstEntryUri = explorer.rows.find((row) => row.kind === 'entry')?.id

  return (
    <div className="flex h-full flex-col bg-layout-list-item">
      {!forceExpanded ? (
        <TreeSearchHeader
          searchText={tree.searchText}
          searchPlaceholder={tree.chrome.searchPlaceholder}
          clearSearchLabel={tree.chrome.clearSearchLabel}
          onSearchTextChange={tree.onSearchTextChange}
          addContainerUri={tree.addContainerUri}
          addEntries={tree.addEntries}
          addMenuOpen={tree.addMenuOpen}
          onAddMenuOpenChange={tree.onAddMenuOpenChange}
        />
      ) : null}
      <ScrollArea className="flex-1">
        {tree.searchActive ? (
          <div className="py-1" role="tree" aria-label={tree.chrome.treeLabel}>
            {tree.searchLoading ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">{tree.chrome.rootLoadingLabel}</div>
            ) : tree.searchResults.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                {tree.chrome.emptySearchLabel(tree.searchText.trim())}
              </div>
            ) : tree.searchResults.map((entry) => (
              <TreeSearchResultRow
                key={entry.uri}
                entry={entry}
                isSelected={false}
                onOpen={() => tree.openSearchResult(entry)}
              />
            ))}
          </div>
        ) : (
          <div className="w-full max-w-full overflow-hidden py-1" role="tree" aria-label={tree.chrome.treeLabel}>
            {tree.rootLoading ? (
              <TreeRootSkeleton label={tree.chrome.rootLoadingLabel} />
            ) : tree.rootError ? (
              <div className="px-4 py-3 text-sm text-destructive">{tree.chrome.rootErrorLabel}</div>
            ) : explorer.rows.map((row) => {
              if (row.kind === 'group') {
                return (
                  <div
                    key={row.id}
                    role="presentation"
                    className="px-3 pb-1 pt-3 text-[11px] font-medium text-muted-foreground"
                  >
                    {row.label}
                  </div>
                )
              }
              if (row.kind !== 'entry') {
                return (
                  <div
                    key={row.id}
                    role="treeitem"
                    aria-level={row.depth + 1}
                    className="flex h-7 items-center truncate px-2 text-xs text-muted-foreground"
                    style={{ paddingLeft: `${28 + row.depth * 14}px` }}
                  >
                    <span className="min-w-0 flex-1 truncate">{row.label}</span>
                  </div>
                )
              }
              const entry = row.entry
              const selected = tree.isEntrySelected(entry)
              return (
                <FilesExplorerRow
                  key={row.id}
                  uri={entry.uri}
                  name={row.label}
                  iconKind={row.iconKind}
                  depth={row.depth}
                  expandable={row.expandable}
                  expanded={row.expanded}
                  selected={selected}
                  focusable={selected || (!explorer.rows.some((candidate) => candidate.kind === 'entry' && tree.isEntrySelected(candidate.entry)) && firstEntryUri === row.id)}
                  favorite={tree.isEntryFavorite(entry)}
                  metadataWarning={row.metadataWarning}
                  onToggle={() => explorer.toggleFolder(entry.uri)}
                  onSelect={() => tree.activateEntry(entry)}
                  onOpen={() => tree.activateEntry(entry)}
                  onToggleFavorite={() => tree.toggleEntryFavorite(entry)}
                  onKeyCommand={(key) => explorer.handleRowKeyDown(entry.uri, key)}
                  renderContextMenu={() => null}
                />
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

export default FilesTreePane
