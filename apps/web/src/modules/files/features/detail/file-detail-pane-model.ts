import {
  projectFileDetailShellState,
  type FileDetailShellTab,
} from '../../domain/detail/file-detail-shell-model'
import { getFilesDetailErrorState } from '../../domain/resource/files-error-state'
import type { FilesDetail } from '../../domain/resource/resource-model'

type FavoriteSource = {
  sourceId: string
}

type StructuredReturnContext = {
  documentUri: string
  subject: string
}

export type FileDetailStructuredReturnAction = {
  label: string
}

export function projectFileDetailFavoriteState({
  file,
  favorites,
}: {
  file: FilesDetail | null | undefined
  favorites: FavoriteSource[]
}) {
  return !!file && favorites.some((favorite) => favorite.sourceId === file.uri)
}

export function planFileDetailFavoriteToggle({
  file,
  isFavorite,
  selectedTreeNodeId,
}: {
  file: FilesDetail | null | undefined
  isFavorite: boolean
  selectedTreeNodeId: string | null | undefined
}) {
  if (!file) return null
  return {
    sourceModule: 'files' as const,
    sourceId: file.uri,
    starred: !isFavorite,
    metadata: {
      title: file.name,
      searchText: file.name,
      snapshotContent: file.previewText ?? undefined,
      snapshotMeta: JSON.stringify({
        fileId: file.uri,
        treeNodeId: selectedTreeNodeId ?? null,
      }),
    },
  }
}

export function shouldResetFileDetailHorizontalScroll({
  structuredViewMode,
}: {
  structuredViewMode: string
}) {
  return structuredViewMode !== 'table'
}

export function projectFileDetailStructuredReturnAction({
  file,
  returnContext,
}: {
  file: FilesDetail | null | undefined
  returnContext: StructuredReturnContext | null | undefined
}): FileDetailStructuredReturnAction | null {
  if (!file || !returnContext || file.uri === returnContext.documentUri) return null
  return {
    label: `返回来源表 · ${returnContext.subject}`,
  }
}

export function projectFileDetailControllerState({
  selectedFileId,
  isLoading,
  error,
  file,
  detailTab,
  hasSystemOpen,
}: {
  selectedFileId: string | null | undefined
  isLoading: boolean
  error: unknown
  file: FilesDetail | null | undefined
  detailTab: FileDetailShellTab
  hasSystemOpen: boolean
}) {
  const emptyState = !selectedFileId
    ? {}
    : isLoading
      ? {}
      : error || !file
        ? getFilesDetailErrorState(error)
        : null

  const shellState = file
    ? projectFileDetailShellState({ detailTab, file, hasSystemOpen })
    : null

  return {
    activeDetailTab: shellState?.activeDetailTab ?? 'preview',
    emptyState,
    resourceActions: shellState?.resourceActions ?? [],
    showHeadSidecarActions: shellState?.showHeadSidecarActions ?? false,
    showMetaDrawer: shellState?.showMetaDrawer ?? false,
    showSourceLinkedDrawerMetadata: shellState?.showSourceLinkedDrawerMetadata ?? false,
    showTabs: shellState?.showTabs ?? false,
    sidecarOwnerTarget: shellState?.sidecarOwnerTarget ?? (file ? { uri: file.uri, kind: file.kind } : null),
  }
}
