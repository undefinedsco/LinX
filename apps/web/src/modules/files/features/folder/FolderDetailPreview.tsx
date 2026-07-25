import { Copy, FilePlus, FolderPlus, Grid3X3, List, Trash2, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { FilesDetail } from '../../domain/resource/resource-model'
import { FilesEmptyState } from '../../ui/FilesEmptyState'
import { ResourceViewBar } from '../../ui/ResourceViewBar'
import { DocumentEditorModal } from '../editor/DocumentEditorModal'
import { FolderChildCollectionView } from './FolderDetailChildViews'
import { FolderDetailTreeView } from './FolderDetailTreeView'
import { FolderChildOperationSheet } from './FolderChildOperationSheet'
import { useFolderDetailNavigationController } from './useFolderDetailNavigationController'
import { useFolderDetailOperationController } from './useFolderDetailOperationController'
import { useFolderDetailSelectionController } from './useFolderDetailSelectionController'
import { useFolderDetailUploadController } from './useFolderDetailUploadController'
import { type FolderDetailViewModeIconKind, useFolderDetailViewController } from './useFolderDetailViewController'

const folderViewModeIconByKind = {
  list: List,
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
    folderPathLabel,
    sort,
    sortedChildren,
    sortedCollectionRows,
    toolbarChrome,
    visibleChildren,
    viewModeOptions,
  } = useFolderDetailViewController({ children, containerUri: file.uri })
  const folderSelection = useFolderDetailSelectionController({
    visibleChildren,
    sortedChildren,
  })
  const childUriSet = folderSelection.childUriSet
  const folderNavigation = useFolderDetailNavigationController({
    childUriSet,
    selectedChildren: folderSelection.selectedChildren,
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
  const openDeleteSelectedChildren = () => {
    folderOperation.openDeleteChildren(folderSelection.selectedChildren, { containerUri: file.uri, siblingEntries: visibleChildren })
  }

  return (
    <div
      aria-label="Folder detail surface"
      className={cn('space-y-3 p-4', folderUpload.isDropTargetActive && 'rounded-md bg-primary/5 ring-1 ring-primary/30')}
      onDragOver={folderUpload.handleUploadDragOver}
      onDragLeave={folderUpload.handleUploadDragLeave}
      onDrop={folderUpload.handleUploadDrop}
    >
      <p className="truncate text-xs text-muted-foreground" title={folderPathLabel}>{folderPathLabel}</p>
      <ResourceViewBar
        ariaLabel="文件夹视图"
        views={viewModeOptions.map((option) => ({
          id: option.mode,
          label: option.label,
          icon: folderViewModeIconByKind[option.iconKind],
        }))}
        activeViewId={viewModeOptions.find((option) => option.active)?.mode ?? 'list'}
        addViewLabel="添加视图"
        onSelectView={setViewMode}
        rightActions={(
          <>
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
          </>
        )}
      />
      {folderUpload.uploadProgress ? (
        <div role="status" aria-label="文件上传进度" className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${folderUpload.uploadProgress.total > 0 ? Math.round((folderUpload.uploadProgress.completed / folderUpload.uploadProgress.total) * 100) : 0}%` }}
            />
          </span>
          <span className="truncate">{folderUpload.uploadProgress.completed}/{folderUpload.uploadProgress.total} 上传中 · {folderUpload.uploadProgress.currentName}</span>
        </div>
      ) : null}
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
        <FilesEmptyState
          title="当前容器为空"
          description={contentState.emptyState.message}
          action={(
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                onClick={() => folderOperation.openOperation({ type: 'create-markdown' })}
              >
                <FilePlus className="h-3.5 w-3.5" aria-hidden="true" />
                新建文件
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                disabled={folderUpload.uploadPending}
                onClick={folderUpload.openUploadPicker}
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                上传文件
              </Button>
            </div>
          )}
        />
      ) : (
          contentState.viewMode === 'list' ? (
            <FolderDetailTreeView
              file={file}
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
              onRename={(parentFile, siblingEntries, child) => folderOperation.openOperation({ type: 'rename', child, containerUri: parentFile.uri, siblingEntries })}
              onCopy={(parentFile, siblingEntries, child) => folderOperation.openTransferOperation('copy', child, { containerUri: parentFile.uri, siblingEntries })}
              onMove={(parentFile, siblingEntries, child) => folderOperation.openTransferOperation('move', child, { containerUri: parentFile.uri, siblingEntries })}
              onDelete={(parentFile, siblingEntries, child) => folderOperation.openDeleteChildren([child], { containerUri: parentFile.uri, siblingEntries })}
            />
          ) : (
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
          )
      )}
      {folderNavigation.sheetChild ? (
        <DocumentEditorModal
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
