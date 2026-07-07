import type { FilesDetail, FilesEntryKind, FilesOpenMode, FilesResourceAction } from '../resource/resource-model'
import {
  getFilesEntryOpenMode,
  getFilesResourceActions,
  resolveFilesSidecarOwnerTarget,
} from '../resource/resource-semantics'

export type FileDetailShellTab = 'preview' | 'metadata' | 'lineage'

export interface FileDetailShellState {
  activeDetailTab: FileDetailShellTab
  openMode: FilesOpenMode
  resourceActions: FilesResourceAction[]
  showHeadSidecarActions: boolean
  showMetaDrawer: boolean
  showSourceLinkedDrawerMetadata: boolean
  showTabs: boolean
  sidecarOwnerTarget: {
    uri: string
    kind: FilesEntryKind
  }
}

export function projectFileDetailShellState({
  detailTab,
  file,
  hasSystemOpen,
}: {
  detailTab: FileDetailShellTab
  file: FilesDetail
  hasSystemOpen: boolean
}): FileDetailShellState {
  const openMode = getFilesEntryOpenMode(file)
  const isEmbeddedStructuredMode = openMode === 'structured-data-table' || openMode === 'locked-vocab-table'
  const isEditableSheetMode = openMode === 'editable-file-sheet'
  const sidecarOwnerTarget = resolveFilesSidecarOwnerTarget(file)

  return {
    activeDetailTab: detailTab === 'metadata' ? 'preview' : detailTab,
    openMode,
    resourceActions: getFilesResourceActions(file, { systemOpen: hasSystemOpen }),
    showHeadSidecarActions: !isEditableSheetMode,
    showMetaDrawer: !isEditableSheetMode,
    showSourceLinkedDrawerMetadata: openMode === 'source-linked-card-preview',
    showTabs: !isEditableSheetMode && !isEmbeddedStructuredMode,
    sidecarOwnerTarget: {
      uri: sidecarOwnerTarget.uri,
      kind: sidecarOwnerTarget.kind,
    },
  }
}
