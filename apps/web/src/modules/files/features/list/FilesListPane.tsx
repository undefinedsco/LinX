import { useState } from 'react'
import {
  Copy,
  FileText,
  FolderOpen,
  HardDrive,
  Trash2,
  Search,
  X,
  ListFilter,
  ChevronLeft,
  RefreshCw,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import type {
  FilesListEmptyStateIconKind,
  FilesListSortField,
  FilesListToolbarChromeModel,
  FilesListScopeControlModel,
  FilesBrowserScopeId,
} from '../../domain/list/list-view-model'
import type { FilesEntry } from '../../domain/resource/resource-model'
import { FilesEmptyState } from '../../ui/FilesEmptyState'
import { FilesExplorerRow } from '../../ui/FilesExplorerRow'
import { FilesOperationSheet } from '../../ui/FilesOperationSheet'
import { FilesAddMenu } from '../add/FilesAddMenu'
import { useFilesListPaneController } from './useFilesListPaneController'
import { useFilesListOperationController } from './useFilesListOperationController'
import { useFilesListSelectionController } from './useFilesListSelectionController'
import { useFilesExplorerDataController } from './useFilesExplorerDataController'

const LIST_EMPTY_STATE_ICON = {
  file: FileText,
  folder: FolderOpen,
  drive: HardDrive,
} satisfies Record<FilesListEmptyStateIconKind, typeof FileText>

// ============================================================================
// Search Bar
// ============================================================================

function ListSearchBar({
  toolbarChrome,
  value,
  onChange,
  mimeTypeFilter,
  mimeTypeOptions,
  onMimeTypeFilterChange,
  tagFilter,
  tagOptions,
  canFilterByTag,
  onTagFilterChange,
  sortField,
  sortDirection,
  sortOptions,
  onSort,
  scopeControl,
  onScopeChange,
  addContainerUri,
  addEntries,
  addMenuOpen,
  onAddMenuOpenChange,
  canGoBack,
  currentPathLabel,
  onGoBack,
}: {
  toolbarChrome: FilesListToolbarChromeModel
  value: string
  onChange: (v: string) => void
  mimeTypeFilter: string | null
  mimeTypeOptions: string[]
  onMimeTypeFilterChange: (filter: string | null) => void
  tagFilter: string | null
  tagOptions: string[]
  canFilterByTag: boolean
  onTagFilterChange: (filter: string | null) => void
  sortField: FilesListSortField
  sortDirection: 'asc' | 'desc'
  sortOptions: ReadonlyArray<{ id: FilesListSortField; label: string }>
  onSort: (field: FilesListSortField) => void
  scopeControl: FilesListScopeControlModel
  onScopeChange: (scope: FilesBrowserScopeId) => void
  addContainerUri: string | null
  addEntries: FilesEntry[]
  addMenuOpen: boolean
  onAddMenuOpenChange: (open: boolean) => void
  canGoBack: boolean
  currentPathLabel: string
  onGoBack: () => void
}) {
  const currentSortLabel = sortOptions.find((option) => option.id === sortField)?.label ?? sortField
  const directionActionLabel = sortDirection === 'desc' ? '升序' : '降序'

  return (
    <div aria-label={toolbarChrome.toolbarLabel} className="flex h-12 items-center gap-2 border-b border-border/50 px-3 shrink-0">
      {canGoBack ? (
        <>
          <button
            type="button"
            aria-label="返回上一级文件夹"
            title={`返回上一级：${currentPathLabel}`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            onClick={onGoBack}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span
            aria-label="当前文件夹路径"
            className="max-w-28 shrink-0 truncate text-[11px] text-muted-foreground"
            title={currentPathLabel}
          >
            {currentPathLabel}
          </span>
        </>
      ) : null}
      <div className="relative flex-1 min-w-0">
        <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 text-muted-foreground">
          <Search strokeWidth={1.5} className="h-3.5 w-3.5" />
        </div>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={toolbarChrome.searchPlaceholder}
          className="pl-8 pr-8 h-7 bg-muted/50 hover:bg-muted/80 focus:bg-background rounded-sm text-xs border-0 focus-visible:ring-1 transition-colors"
        />
        {value && (
          <button
            type="button"
            aria-label={toolbarChrome.clearSearchLabel}
            title={toolbarChrome.clearSearchLabel}
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted-foreground/20 rounded-full"
          >
            <X strokeWidth={1.5} className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>
      <FilesAddMenu
        containerUri={addContainerUri}
        entries={addEntries}
        open={addMenuOpen}
        onOpenChange={onAddMenuOpenChange}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={toolbarChrome.filterAndSortLabel}
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground',
              (mimeTypeFilter || tagFilter) && 'bg-primary/10 text-primary',
            )}
            title={`${toolbarChrome.filterAndSortLabel} · ${currentSortLabel}`}
          >
            <ListFilter strokeWidth={1.5} className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
            范围
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={scopeControl.id} onValueChange={(value) => onScopeChange(value as FilesBrowserScopeId)}>
            {scopeControl.options.map((option) => (
              <DropdownMenuRadioItem key={option.id} value={option.id}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
            {toolbarChrome.mimeTypeFilterLabel}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={mimeTypeFilter ?? '__all__'}
            onValueChange={(value) => onMimeTypeFilterChange(value === '__all__' ? null : value)}
          >
            <DropdownMenuRadioItem value="__all__">{toolbarChrome.allMimeTypesLabel}</DropdownMenuRadioItem>
            {mimeTypeOptions.map((mimeType) => (
              <DropdownMenuRadioItem key={mimeType} value={mimeType}>
                {mimeType}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
            {toolbarChrome.tagFilterLabel}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={tagFilter ?? '__all__'}
            onValueChange={(value) => onTagFilterChange(value === '__all__' ? null : value)}
          >
            <DropdownMenuRadioItem value="__all__">{toolbarChrome.allTagsLabel}</DropdownMenuRadioItem>
            {canFilterByTag ? tagOptions.map((tag) => (
              <DropdownMenuRadioItem key={tag} value={tag}>
                {tag}
              </DropdownMenuRadioItem>
            )) : (
              <DropdownMenuRadioItem value="__none__" disabled>暂无标签</DropdownMenuRadioItem>
            )}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
            排序
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={sortField} onValueChange={(value) => onSort(value as FilesListSortField)}>
            {sortOptions.map((option) => (
              <DropdownMenuRadioItem key={option.id} value={option.id}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onSort(sortField)}>{directionActionLabel}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function FilesListPane(_props: MicroAppPaneProps) {
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const listPane = useFilesListPaneController()
  const explorer = useFilesExplorerDataController({
    entryScope: listPane.entryScope,
    rootEntries: listPane.files,
    searchText: listPane.searchText,
  })
  const explorerEntries = explorer.rows
    .filter((row) => row.kind === 'entry')
    .map((row) => row.entry)
  const listSelection = useFilesListSelectionController({
    files: explorerEntries,
    openFile: explorer.openEntry,
  })
  const listOperation = useFilesListOperationController({
    baseEntries: explorerEntries,
    clearListSelection: listSelection.clearListSelection,
    replaceFileSelection: listSelection.replaceFileSelection,
    selectFile: listPane.selectFile,
  })

  const openDeleteSelectedFiles = () => {
    if (!listSelection.hasSelectedVisibleFiles) return
    listOperation.openDeleteFiles(listSelection.selectedVisibleFiles)
  }

  const openFileEditor = (file: FilesEntry) => listPane.openFile(file, 'explicit-open')

  const renderFileContextMenu = (file: FilesEntry) => {
    const contextMenuView = listSelection.contextMenuViewForFile(file)
    return (
      <ContextMenuContent className="w-40">
        {contextMenuView.showSingleFileActions ? (
          <>
            <ContextMenuItem onSelect={() => listSelection.runContextMenuAction(() => openFileEditor(file))}>
              {contextMenuView.openLabel}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}
        <ContextMenuItem onSelect={() => listSelection.runContextMenuAction(() => listPane.copyFiles(contextMenuView.targetFiles))}>
          {contextMenuView.copyLabel}
        </ContextMenuItem>
        {contextMenuView.showSingleFileActions ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => listSelection.runContextMenuAction(() => listOperation.openRenameContextFile(file))}>
              {contextMenuView.renameLabel}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => listSelection.runContextMenuAction(() => listOperation.openTransferContextFile(file, 'copy'))}>
              {contextMenuView.copyToLabel}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => listSelection.runContextMenuAction(() => listOperation.openTransferContextFile(file, 'move'))}>
              {contextMenuView.moveToLabel}
            </ContextMenuItem>
          </>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => listSelection.runContextMenuAction(() => listOperation.openDeleteFiles(contextMenuView.targetFiles, { defer: true }))}
        >
          {contextMenuView.deleteLabel}
        </ContextMenuItem>
      </ContextMenuContent>
    )
  }

  const renderFileActionsMenu = (file: FilesEntry) => {
    const contextMenuView = listSelection.contextMenuViewForFile(file)
    return (
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem
          onClick={(event) => {
            event.stopPropagation()
            openFileEditor(file)
          }}
          onSelect={() => openFileEditor(file)}
        >
          编辑
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => listPane.copyFiles([file])}>
          复制 URI
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => {
          listPane.openSidecar(file, 'meta')
        }}>
          查看 .meta
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => {
          listPane.openSidecar(file, 'access')
        }}>
          查看 Access 来源
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => listOperation.openRenameContextFile(file)}>
          {contextMenuView.renameLabel}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => listOperation.openTransferContextFile(file, 'copy')}>
          {contextMenuView.copyToLabel}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => listOperation.openTransferContextFile(file, 'move')}>
          {contextMenuView.moveToLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => listOperation.openDeleteFiles([file], { defer: true })}
        >
          {contextMenuView.deleteLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    )
  }

  return (
    <div aria-label="文件列表" className="flex h-full flex-col">
      <ListSearchBar
        toolbarChrome={listPane.toolbarChrome}
        value={listPane.searchText}
        onChange={listPane.setSearchText}
        mimeTypeFilter={listPane.mimeTypeFilter}
        mimeTypeOptions={listPane.mimeTypeOptions}
        onMimeTypeFilterChange={listPane.setMimeTypeFilter}
        tagFilter={listPane.tagFilter}
        tagOptions={listPane.tagOptions}
        canFilterByTag={listPane.canFilterByTag}
        onTagFilterChange={listPane.setTagFilter}
        sortField={listPane.sortField}
        sortDirection={listPane.sortDirection}
        sortOptions={listPane.sortOptions}
        onSort={listPane.sortList}
        scopeControl={listPane.scopeControl}
        onScopeChange={listPane.changeBrowserScope}
        addContainerUri={listPane.addContainerUri}
        addEntries={listPane.baseEntries}
        addMenuOpen={addMenuOpen}
        onAddMenuOpenChange={setAddMenuOpen}
        canGoBack={listPane.canGoBack}
        currentPathLabel={listPane.currentPathLabel}
        onGoBack={listPane.goBackFolder}
      />
      {listPane.scopeHeader ? (
        <div className="border-b border-border/30 px-3 py-1.5 text-xs font-medium text-foreground">
          {listPane.scopeHeader.label}
        </div>
      ) : null}
      {listSelection.hasBatchSelection ? (
        <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 px-4 py-2">
          <span className="text-xs font-medium text-foreground/80">{listSelection.batchSelectionLabel}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={listSelection.batchSelectionActions.copyLabel}
              title={listSelection.batchSelectionActions.copyLabel}
              className="flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
              onClick={() => listPane.copyFiles(listSelection.selectedVisibleFiles)}
            >
              <Copy strokeWidth={1.5} className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={listSelection.batchSelectionActions.deleteLabel}
              title={listSelection.batchSelectionActions.deleteLabel}
              disabled={listOperation.deletePending}
              className="flex h-7 w-7 items-center justify-center rounded-sm text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
              onClick={openDeleteSelectedFiles}
            >
              <Trash2 strokeWidth={1.5} className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}
      {listPane.contentState.kind === 'loading' ? (
        <FilesEmptyState {...listPane.contentState.loadingState} />
      ) : listPane.contentState.kind === 'error' ? (
        <FilesEmptyState
          {...listPane.errorState}
          action={(
            <button type="button" className="text-xs text-primary hover:underline" onClick={listPane.retryEntries}>
              重新读取
            </button>
          )}
        />
      ) : listPane.contentState.kind === 'empty' ? (
        <FilesEmptyState
          title={listPane.emptyState.title}
          description={listPane.emptyState.description}
          icon={LIST_EMPTY_STATE_ICON[listPane.emptyState.iconKind]}
          action={listPane.searchText || listPane.mimeTypeFilter || listPane.tagFilter ? (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => {
                listPane.setSearchText('')
                listPane.setMimeTypeFilter(null)
                listPane.setTagFilter(null)
              }}
            >
              清除筛选
            </button>
          ) : listPane.emptyState.iconKind === 'folder' ? (
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => setAddMenuOpen(true)}>
              添加资源
            </button>
          ) : undefined}
        />
      ) : (
        <ScrollArea className="flex-1">
          <div role="tree" aria-label="文件资源树" className="w-full max-w-full overflow-hidden py-1">
            {explorer.rows.map((row) => {
              if (row.kind !== 'entry') {
                return (
                  <div
                    key={row.id}
                    role="treeitem"
                    tabIndex={row.kind === 'error' ? 0 : undefined}
                    aria-level={row.depth + 1}
                    className="flex h-7 items-center truncate px-2 text-xs text-muted-foreground"
                    style={{ paddingLeft: `${28 + row.depth * 14}px` }}
                    onKeyDown={(event) => {
                      if (row.kind === 'error' && event.key === 'Enter') {
                        event.preventDefault()
                        explorer.retryContainer?.(row.containerUri)
                      }
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{row.label}</span>
                    {row.kind === 'error' ? (
                      <button
                        type="button"
                        aria-label={`重试读取 ${row.containerUri}`}
                        title="重试"
                        className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                        onClick={() => explorer.retryContainer?.(row.containerUri)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            explorer.retryContainer?.(row.containerUri)
                          }
                        }}
                      >
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                )
              }
              const file = row.entry
              return (
                <FilesExplorerRow
                  key={row.id}
                  uri={file.uri}
                  name={file.name}
                  iconKind={row.iconKind}
                  depth={row.depth}
                  expandable={row.expandable}
                  expanded={row.expanded}
                  selected={listSelection.selectedFileId === file.uri || listSelection.selectedFileIds.has(file.uri)}
                  focusable={listSelection.selectedFileId === file.uri || (
                    !listSelection.selectedFileId && explorerEntries[0]?.uri === file.uri
                  )}
                  favorite={listPane.isFileFavorite(file)}
                  contextTarget={listSelection.contextMenuTargetUri === file.uri}
                  metadataWarning={row.metadataWarning}
                  onToggle={() => explorer.toggleFolder(file.uri)}
                  onSelect={(event) => listSelection.selectVisibleFile(file, event)}
                  onOpen={(trigger) => explorer.openEntry(file, trigger)}
                  onToggleFavorite={() => { void listPane.toggleFileFavorite(file) }}
                  onContextMenu={() => listSelection.prepareContextMenuSelection(file)}
                  onContextMenuOpenChange={(open) => listSelection.handleContextMenuOpenChange(file, open)}
                  onKeyCommand={(key) => explorer.handleRowKeyDown(file.uri, key)}
                  renderContextMenu={() => renderFileContextMenu(file)}
                  renderActionsMenu={() => renderFileActionsMenu(file)}
                />
              )
            })}
          </div>
        </ScrollArea>
      )}
      <FilesOperationSheet
        open={Boolean(listOperation.operationSheetModel)}
        title={listOperation.operationSheetModel?.title ?? ''}
        description={listOperation.operationSheetModel?.description ?? ''}
        input={listOperation.operationSheetInput}
        confirmLabel={listOperation.operationConfirmChrome.label}
        confirmDisabled={listOperation.operationConfirmDisabled}
        destructive={listOperation.operationSheetModel?.destructive}
        validationMessage={listOperation.operationValidationMessage}
        onClose={listOperation.closeOperationSheet}
        onConfirm={() => void listOperation.confirmOperation()}
      />
    </div>
  )
}

export default FilesListPane
