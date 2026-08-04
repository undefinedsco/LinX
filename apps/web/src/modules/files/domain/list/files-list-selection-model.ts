import type { FilesEntry } from '../resource/resource-model'

export type FilesListSelectionProjection = {
  batchSelectionActions: FilesListBatchSelectionActions
  batchSelectionLabel: string
  hasBatchSelection: boolean
  hasSelectedVisibleFiles: boolean
  selectedVisibleCount: number
  selectedVisibleFiles: FilesEntry[]
}

export type FilesListBatchSelectionActions = {
  cancelLabel: string
  copyLabel: string
  deleteLabel: string
}

export type FilesListContextMenuView = {
  copyLabel: string
  copyToLabel: string
  deleteLabel: string
  isBatchContext: boolean
  moveToLabel: string
  openLabel: string
  renameLabel: string
  showSingleFileActions: boolean
  targetFiles: FilesEntry[]
}

export type FilesListInteractionState = {
  contextMenuTargetUri: string | null
  selectionAnchorId: string | null
}

export function createFilesListInteractionState(): FilesListInteractionState {
  return {
    contextMenuTargetUri: null,
    selectionAnchorId: null,
  }
}

export function projectFilesListInteractionAnchor({
  current,
  selectionAnchorId,
}: {
  current: FilesListInteractionState
  selectionAnchorId: string | null
}): FilesListInteractionState {
  return {
    ...current,
    selectionAnchorId,
  }
}

export function projectFilesListInteractionContextTarget({
  contextMenuTargetUri,
  current,
}: {
  current: FilesListInteractionState
  contextMenuTargetUri: string | null
}): FilesListInteractionState {
  return {
    ...current,
    contextMenuTargetUri,
  }
}

export function projectFilesListInteractionReset(
  _current: FilesListInteractionState,
): FilesListInteractionState {
  return createFilesListInteractionState()
}

export function projectFilesListSelectionProjection({
  files,
  selectedFileIds,
}: {
  files: FilesEntry[]
  selectedFileIds: Set<string>
}): FilesListSelectionProjection {
  const selectedVisibleFiles = files.filter((file) => selectedFileIds.has(file.uri))
  const selectedVisibleCount = selectedVisibleFiles.length

  return {
    batchSelectionActions: {
      cancelLabel: '取消选择',
      copyLabel: '复制所选 URI',
      deleteLabel: '删除所选项',
    },
    batchSelectionLabel: `已选择 ${selectedVisibleCount} 项`,
    hasBatchSelection: selectedVisibleCount > 1,
    hasSelectedVisibleFiles: selectedVisibleCount > 0,
    selectedVisibleCount,
    selectedVisibleFiles,
  }
}

export function projectFilesListRangeSelectionUris({
  files,
  anchorUri,
  fileUri,
}: {
  files: FilesEntry[]
  anchorUri: string
  fileUri: string
}) {
  const anchorIndex = files.findIndex((entry) => entry.uri === anchorUri)
  const fileIndex = files.findIndex((entry) => entry.uri === fileUri)
  if (anchorIndex < 0 || fileIndex < 0) return null

  const start = Math.min(anchorIndex, fileIndex)
  const end = Math.max(anchorIndex, fileIndex)
  return files.slice(start, end + 1).map((entry) => entry.uri)
}

export function projectFilesListContextSelection({
  file,
  selectedFileIds,
  selectedVisibleFiles,
}: {
  file: FilesEntry
  selectedFileIds: Set<string>
  selectedVisibleFiles: FilesEntry[]
}) {
  if (selectedFileIds.has(file.uri) && selectedVisibleFiles.length > 1) return selectedVisibleFiles
  return [file]
}

export function projectFilesListContextMenuView({
  file,
  selectedFileIds,
  selectedVisibleFiles,
}: {
  file: FilesEntry
  selectedFileIds: Set<string>
  selectedVisibleFiles: FilesEntry[]
}): FilesListContextMenuView {
  const targetFiles = projectFilesListContextSelection({
    file,
    selectedFileIds,
    selectedVisibleFiles,
  })
  const isBatchContext = targetFiles.length > 1

  return {
    copyLabel: isBatchContext ? '复制所选 URI' : '复制 URI',
    copyToLabel: '复制到...',
    deleteLabel: isBatchContext ? '删除所选项' : '删除',
    isBatchContext,
    moveToLabel: '移动到...',
    openLabel: '打开',
    renameLabel: '重命名',
    showSingleFileActions: !isBatchContext,
    targetFiles,
  }
}

export function shouldApplyFilesListContextSelection({
  file,
  selectedFileId,
  selectedFileIds,
  selectedVisibleCount,
}: {
  file: FilesEntry
  selectedFileId: string | null
  selectedFileIds: Set<string>
  selectedVisibleCount: number
}) {
  if (!selectedFileIds.has(file.uri)) return true
  if (selectedVisibleCount > 1) return false
  if (selectedFileIds.size === 1 && selectedFileId === file.uri) return false
  return true
}
