import {
  Copy,
  FileText,
  FolderOpen,
  HardDrive,
  Trash2,
  Search,
  X,
  ListFilter,
  Tags,
  ArrowUpDown,
  ChevronLeft,
  FolderTree,
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
import { FilesListColumnHeader } from '../../ui/FilesListColumnHeader'
import { FilesListRow } from '../../ui/FilesListRow'
import { FilesOperationSheet } from '../../ui/FilesOperationSheet'
import { SourceIngestToolbarAction } from '../ingest/SourceIngestAction'
import { useFilesListPaneController } from './useFilesListPaneController'
import { useFilesListOperationController } from './useFilesListOperationController'
import { useFilesListSelectionController } from './useFilesListSelectionController'

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
  canGoBack,
  onBack,
  scopeControl,
  onScopeChange,
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
  canGoBack: boolean
  onBack: () => void
  scopeControl: FilesListScopeControlModel
  onScopeChange: (scope: FilesBrowserScopeId) => void
}) {
  const currentSortLabel = sortOptions.find((option) => option.id === sortField)?.label ?? sortField
  const directionActionLabel = sortDirection === 'desc' ? '升序' : '降序'

  return (
    <div aria-label={toolbarChrome.toolbarLabel} className="flex items-center gap-2 px-4 py-2 border-b border-border/50 shrink-0">
      <button
        type="button"
        aria-label="返回上一个文件夹"
        title="返回上一个文件夹"
        disabled={!canGoBack}
        onClick={onBack}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:opacity-30"
      >
        <ChevronLeft strokeWidth={1.5} className="h-3.5 w-3.5" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={scopeControl.ariaLabel}
            title={scopeControl.label}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          >
            <FolderTree strokeWidth={1.5} className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-36">
          <DropdownMenuRadioGroup value={scopeControl.id} onValueChange={(value) => onScopeChange(value as FilesBrowserScopeId)}>
            {scopeControl.options.map((option) => (
              <DropdownMenuRadioItem key={option.id} value={option.id}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
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
      <SourceIngestToolbarAction />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={toolbarChrome.mimeTypeFilterLabel}
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground',
              mimeTypeFilter && 'bg-primary/10 text-primary',
            )}
            title={mimeTypeFilter ?? toolbarChrome.allMimeTypesLabel}
          >
            <ListFilter strokeWidth={1.5} className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
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
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="排序"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            title={`${currentSortLabel} · ${sortDirection === 'asc' ? '升序' : '降序'}`}
          >
            <ArrowUpDown strokeWidth={1.5} className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-36">
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={toolbarChrome.tagFilterLabel}
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:opacity-40',
              tagFilter && 'bg-primary/10 text-primary',
            )}
            title={tagFilter ?? toolbarChrome.allTagsLabel}
            disabled={!canFilterByTag}
          >
            <Tags strokeWidth={1.5} className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuRadioGroup
            value={tagFilter ?? '__all__'}
            onValueChange={(value) => onTagFilterChange(value === '__all__' ? null : value)}
          >
            <DropdownMenuRadioItem value="__all__">{toolbarChrome.allTagsLabel}</DropdownMenuRadioItem>
            {tagOptions.map((tag) => (
              <DropdownMenuRadioItem key={tag} value={tag}>
                {tag}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function FilesListPane(_props: MicroAppPaneProps) {
  const listPane = useFilesListPaneController()
  const listSelection = useFilesListSelectionController({
    files: listPane.files,
    openFile: listPane.openFile,
  })
  const listOperation = useFilesListOperationController({
    baseEntries: listPane.baseEntries,
    clearListSelection: listSelection.clearListSelection,
    replaceFileSelection: listSelection.replaceFileSelection,
    selectFile: listPane.selectFile,
  })

  const openDeleteSelectedFiles = () => {
    if (!listSelection.hasSelectedVisibleFiles) return
    listOperation.openDeleteFiles(listSelection.selectedVisibleFiles)
  }

  const renderFileContextMenu = (file: FilesEntry) => {
    const contextMenuView = listSelection.contextMenuViewForFile(file)
    return (
      <ContextMenuContent className="w-40">
        {contextMenuView.showSingleFileActions ? (
          <>
            <ContextMenuItem onSelect={() => listSelection.runContextMenuAction(() => listPane.openFile(file, 'explicit-open'))}>
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

  return (
    <div className="flex flex-col h-full">
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
        canGoBack={listPane.canGoBack}
        onBack={listPane.goBackFolder}
        scopeControl={listPane.scopeControl}
        onScopeChange={listPane.changeBrowserScope}
      />
      <div
        aria-label="当前文件夹路径"
        className="shrink-0 truncate border-b border-border/30 px-4 py-1.5 text-[11px] text-muted-foreground"
        title={listPane.currentPathLabel}
      >
        {listPane.currentPathLabel}
      </div>
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
      <FilesListColumnHeader
        columns={listPane.columnHeaders}
        sortKey={listPane.sortField}
        sortDirection={listPane.sortDirection}
        onSort={listPane.sortList}
      />
      {listPane.contentState.kind === 'loading' ? (
        <FilesEmptyState {...listPane.contentState.loadingState} />
      ) : listPane.contentState.kind === 'error' ? (
        <FilesEmptyState {...listPane.errorState} />
      ) : listPane.contentState.kind === 'empty' ? (
        <FilesEmptyState
          title={listPane.emptyState.title}
          description={listPane.emptyState.description}
          icon={LIST_EMPTY_STATE_ICON[listPane.emptyState.iconKind]}
        />
      ) : (
        <ScrollArea className="flex-1">
          <div className="divide-y divide-border/20">
            {listPane.visibleRows.map(({ file, row }) => {
              return (
                <FilesListRow
                  key={file.id}
                  {...row}
                  isSelected={listSelection.selectedFileId === file.uri || listSelection.selectedFileIds.has(file.uri)}
                  isContextTarget={listSelection.contextMenuTargetUri === file.uri}
                  onClick={(event) => listSelection.selectVisibleFile(file, event)}
                  onContextMenu={() => listSelection.prepareContextMenuSelection(file)}
                  onContextMenuOpenChange={(open) => listSelection.handleContextMenuOpenChange(file, open)}
                  onOpen={(trigger) => listPane.openFile(file, trigger)}
                  renderContextMenu={() => renderFileContextMenu(file)}
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
