import { Columns3, Copy, FilePlus, FolderPlus, Grid3X3, List, Trash2, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { FilesDetail } from '../../domain/resource/resource-model'
import { FileEditorSheet } from '../editor/FileEditorSheet'
import { FolderChildPreview } from './FolderChildPreview'
import { FolderChildCollectionView } from './FolderDetailChildViews'
import {
  FolderColumnPanel,
  FolderDescendantColumn,
  type FolderColumnChildAction,
} from './FolderDetailColumnView'
import { FolderChildOperationSheet } from './FolderChildOperationSheet'
import { useFolderDetailColumnController } from './useFolderDetailColumnController'
import { useFolderDetailNavigationController } from './useFolderDetailNavigationController'
import { useFolderDetailOperationController } from './useFolderDetailOperationController'
import { useFolderDetailSelectionController } from './useFolderDetailSelectionController'
import { useFolderDetailUploadController } from './useFolderDetailUploadController'
import { type FolderDetailViewModeIconKind, useFolderDetailViewController } from './useFolderDetailViewController'

const folderViewModeIconByKind = {
  list: List,
  columns: Columns3,
  icons: Grid3X3,
} satisfies Record<FolderDetailViewModeIconKind, typeof List>

export function FolderDetailPreview({
  file,
}: {
  file: FilesDetail
}) {
  const children = file.childEntries ?? []
  const {
    setSortKey,
    setViewMode,
    childActionMenu,
    collectionChrome,
    contentState,
    sort,
    sortedChildren,
    sortedCollectionRows,
    toolbarChrome,
    visibleChildCount,
    visibleChildren,
    viewModeOptions,
  } = useFolderDetailViewController({ children })
  const folderSelection = useFolderDetailSelectionController({
    visibleChildren,
    sortedChildren,
  })
  const childUriSet = folderSelection.childUriSet
  const folderNavigation = useFolderDetailNavigationController({
    childUriSet,
    selectedChildren: folderSelection.selectedChildren,
    selectChildUri: folderSelection.selectChildUri,
  })
  const folderUpload = useFolderDetailUploadController({
    containerUri: file.uri,
    onUploadedResource: folderNavigation.openUploadedResource,
  })
  const folderOperation = useFolderDetailOperationController({
    file,
    children,
    visibleChildren,
    onDeletedUris: folderSelection.removeSelectionUris,
  })
  const folderColumn = useFolderDetailColumnController({
    file,
    visibleChildren,
    childUriSet,
    selectedChild: folderSelection.selectedChild,
    selectedChildUri: folderSelection.selectedChildUri,
    selectOnlyChild: folderSelection.selectOnlyChild,
    prepareContextMenuSelection: folderSelection.prepareContextMenuSelection,
  })
  const openDeleteSelectedChildren = () => {
    folderOperation.openDeleteChildren(folderSelection.selectedChildren, { containerUri: file.uri, siblingEntries: visibleChildren })
  }

  const openColumnCopy: FolderColumnChildAction = (parentFile, siblingEntries, child) => {
    folderOperation.openTransferOperation('copy', child, { containerUri: parentFile.uri, siblingEntries })
  }
  const openColumnMove: FolderColumnChildAction = (parentFile, siblingEntries, child) => {
    folderOperation.openTransferOperation('move', child, { containerUri: parentFile.uri, siblingEntries })
  }
  const openColumnRename: FolderColumnChildAction = (parentFile, siblingEntries, child) => {
    folderOperation.openOperation({ type: 'rename', child, containerUri: parentFile.uri, siblingEntries })
  }
  const openColumnDelete: FolderColumnChildAction = (parentFile, siblingEntries, child) => {
    folderOperation.openDeleteChildren([child], { containerUri: parentFile.uri, siblingEntries })
  }
  const columnPreviewChild = folderColumn.columnPreviewChild

  return (
    <div
      aria-label="Folder detail surface"
      className={cn('space-y-3 p-4', folderUpload.isDropTargetActive && 'rounded-md bg-primary/5 ring-1 ring-primary/30')}
      onDragOver={folderUpload.handleUploadDragOver}
      onDragLeave={folderUpload.handleUploadDragLeave}
      onDrop={folderUpload.handleUploadDrop}
    >
      <div className="flex flex-wrap items-center justify-end gap-3 border-b border-border/35 pb-3">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={toolbarChrome.createFolderLabel}
            title={toolbarChrome.createFolderLabel}
            disabled={folderOperation.createFolderPending}
            onClick={() => folderOperation.openOperation({ type: 'create-folder' })}
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={toolbarChrome.createMarkdownLabel}
            title={toolbarChrome.createMarkdownLabel}
            disabled={folderOperation.createMarkdownPending}
            onClick={() => folderOperation.openOperation({ type: 'create-markdown' })}
          >
            <FilePlus className="h-3.5 w-3.5" />
          </Button>
          <input
            ref={folderUpload.uploadInputRef}
            type="file"
            className="sr-only"
            aria-label={toolbarChrome.uploadInputLabel}
            multiple
            onChange={(event) => void folderUpload.uploadPickedFiles(event)}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={toolbarChrome.uploadLabel}
            title={toolbarChrome.uploadLabel}
            disabled={folderUpload.uploadPending}
            onClick={folderUpload.openUploadPicker}
          >
            <Upload className="h-3.5 w-3.5" />
          </Button>
          <div className="flex rounded-md border border-border/40 bg-background p-0.5">
            {viewModeOptions.map((option) => {
              const Icon = folderViewModeIconByKind[option.iconKind]
              return (
              <button
                key={option.mode}
                aria-label={option.label}
                title={option.label}
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded transition-colors',
                  option.active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/70',
                )}
                onClick={() => setViewMode(option.mode)}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              )
            })}
          </div>
        </div>
      </div>
      {folderSelection.hasBatchSelection ? (
        <div className="flex items-center justify-between rounded-md border border-border/35 bg-muted/20 px-3 py-2">
          <span className="text-xs font-medium text-foreground/80">{folderSelection.batchSelectionLabel}</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label={folderSelection.batchSelectionActions.copyLabel}
              title={folderSelection.batchSelectionActions.copyLabel}
              onClick={folderNavigation.copySelectedChildUris}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive hover:text-destructive"
              aria-label={folderSelection.batchSelectionActions.deleteLabel}
              title={folderSelection.batchSelectionActions.deleteLabel}
              disabled={folderOperation.deletePending}
              onClick={openDeleteSelectedChildren}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
      {contentState.kind === 'empty' ? (
        <div className="rounded-md border border-border/40 bg-background/50 px-3 py-2 text-xs text-muted-foreground">
          {contentState.emptyState.message}
        </div>
      ) : contentState.kind === 'columns' ? (
          <div
            className="flex min-h-[320px] overflow-x-auto rounded-md border border-border/40 bg-background/60"
            aria-label="Folder column view"
          >
            <FolderColumnPanel
              ariaLabel="Folder column current items"
              title={file.name}
              parentFile={file}
              entries={visibleChildren}
              selectedUri={folderColumn.rootColumnSelectedUri}
              sort={sort}
              columnDepth={0}
              onSelect={folderColumn.selectColumnChild}
              onContextMenuSelect={folderColumn.prepareColumnChildContextMenuSelection}
              onOpen={folderNavigation.openChild}
              onCopyUri={folderNavigation.copyChildUri}
              onCopy={openColumnCopy}
              onMove={openColumnMove}
              onRename={openColumnRename}
              onDelete={openColumnDelete}
            />
            {folderColumn.columnContainerPath.map((containerUri, index) => (
              <FolderDescendantColumn
                key={containerUri}
                containerUri={containerUri}
                selectedUri={folderColumn.columnSelectionByContainer[containerUri]}
                sort={sort}
                columnDepth={index + 1}
                onSelect={folderColumn.selectColumnChild}
                onContextMenuSelect={folderColumn.prepareColumnChildContextMenuSelection}
                onOpen={folderNavigation.openChild}
                onCopyUri={folderNavigation.copyChildUri}
                onCopy={openColumnCopy}
                onMove={openColumnMove}
                onRename={openColumnRename}
                onDelete={openColumnDelete}
              />
            ))}
            <div className="min-w-[280px] flex-1 bg-background/50 p-3" aria-label="Folder column detail">
              <FolderChildPreview
                file={folderColumn.columnPreviewParentFile}
                child={columnPreviewChild}
                childCount={folderColumn.columnPreviewChildCount}
                onOpen={columnPreviewChild ? () => folderNavigation.openChild(columnPreviewChild, 'explicit-open') : undefined}
              />
            </div>
          </div>
      ) : (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(220px,0.75fr)]">
            <FolderChildCollectionView
              viewMode={contentState.viewMode}
              rows={sortedCollectionRows}
              selectedUris={folderSelection.selectedChildUris}
              sort={sort}
              actionMenu={childActionMenu}
              collectionChrome={collectionChrome}
              onSortKey={setSortKey}
              onSelect={folderSelection.selectChild}
              onKeyboardSelect={folderSelection.selectChildFromKeyboard}
              onContextMenuSelect={folderSelection.prepareChildContextMenuSelection}
              onOpen={folderNavigation.openChild}
              onCopyUri={folderNavigation.copyChildUri}
              onRename={(child) => folderOperation.openOperation({ type: 'rename', child, containerUri: file.uri, siblingEntries: visibleChildren })}
              onCopy={(child) => folderOperation.openTransferOperation('copy', child, { containerUri: file.uri, siblingEntries: visibleChildren })}
              onMove={(child) => folderOperation.openTransferOperation('move', child, { containerUri: file.uri, siblingEntries: visibleChildren })}
              onDelete={(child) => folderOperation.openDeleteChildren([child], { containerUri: file.uri, siblingEntries: visibleChildren })}
            />
            <FolderChildPreview
              file={file}
              child={folderSelection.selectedChild}
              childCount={visibleChildCount}
              onOpen={folderSelection.selectedChild ? () => folderNavigation.openChild(folderSelection.selectedChild!, 'explicit-open') : undefined}
            />
          </div>
      )}
      {folderNavigation.sheetChild ? (
        <FileEditorSheet
          file={folderNavigation.sheetChild}
          open
          onOpenChange={(open) => {
            if (!open) folderNavigation.closeSheetChild()
          }}
        />
      ) : null}
      <FolderChildOperationSheet
        operation={folderOperation.operation}
        value={folderOperation.operationValue}
        validationMessage={folderOperation.validationMessage}
        pending={folderOperation.pending || folderUpload.uploadPending}
        confirmDisabled={folderOperation.operationConfirmDisabled || folderUpload.uploadPending}
        onValueChange={folderOperation.setOperationValue}
        onClose={folderOperation.closeOperation}
        onConfirm={(currentOperation, submittedValue) => void folderOperation.confirmOperation(currentOperation, submittedValue)}
      />
    </div>
  )
}
