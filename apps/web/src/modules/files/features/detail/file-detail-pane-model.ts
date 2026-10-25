import { isExplorerSystemDataFolder, projectExplorerEntryLabel } from '../../domain/list/explorer-virtual-entries'
import {
  projectFileDetailShellState,
  type FileDetailShellTab,
} from '../../domain/detail/file-detail-shell-model'
import { getFilesDetailErrorState } from '../../domain/resource/files-error-state'
import { displayContainerLocation, displayResourceName } from '../../domain/resource/resource-semantics'
import type { FilesDetail, FilesEntry } from '../../domain/resource/resource-model'

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
  file: FilesEntry | null | undefined
  favorites: FavoriteSource[]
}) {
  return !!file && favorites.some((favorite) => favorite.sourceId === file.uri)
}

export function planFileDetailFavoriteToggle({
  file,
  isFavorite,
  selectedTreeNodeId,
}: {
  file: FilesEntry | null | undefined
  isFavorite: boolean
  selectedTreeNodeId: string | null | undefined
}) {
  if (!file) return null
  const snapshotContent = 'previewText' in file && typeof file.previewText === 'string'
    ? file.previewText
    : undefined
  return {
    sourceModule: 'files' as const,
    sourceId: file.uri,
    starred: !isFavorite,
    metadata: {
      // Same label the Files tree shows (.data -> 数据, no .md/.ttl).
      title: projectExplorerEntryLabel(file),
      searchText: file.name,
      snapshotContent,
      snapshotMeta: JSON.stringify({
        fileId: file.uri,
        treeNodeId: selectedTreeNodeId ?? null,
      }),
    },
  }
}

export function shouldResetFileDetailHorizontalScroll({
  structuredViewMode: _structuredViewMode,
}: {
  structuredViewMode: string
}) {
  return true
}

function fileDetailPathLabel(containerUri: string, podRootUri?: string | null): string {
  return displayContainerLocation(containerUri, podRootUri)
}

function fileDetailKindLabel(file: FilesDetail): string {
  // `.data/` is the Pod's shared business-data area: LinX and other Solid apps store records here.
  if (file.kind === 'container' && /\/\.data\/?$/.test(file.uri)) return '各应用共用的数据'
  if (file.kind === 'container') return '文件夹'
  const mime = file.mimeType ?? ''
  if (mime === 'text/markdown') return '文档'
  if (mime === 'text/turtle') return '表格'
  if (mime === 'application/json') return '数据文件'
  if (mime.startsWith('text/')) return '文本文档'
  if (mime.startsWith('image/')) return '图片'
  return '文件'
}

function fileDetailSizeLabel(size: number | null): string | null {
  if (size === null || Number.isNaN(size)) return null
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function fileDetailModifiedLabel(modifiedAt: string | null): string | null {
  if (!modifiedAt) return null
  const date = new Date(modifiedAt)
  if (Number.isNaN(date.getTime())) return null
  return modifiedAt.slice(0, 16).replace('T', ' ')
}

export function projectFileDetailChrome(file: FilesDetail, podRootUri?: string | null): {
  title: string
  subtitle: string
  footer: string
} {
  const subtitle = `${fileDetailKindLabel(file)} · ${fileDetailPathLabel(file.parentUri, podRootUri)}`
  const segments: string[] = []
  if (file.kind === 'container') {
    segments.push(`${(file.childEntries ?? []).filter((child) => !isExplorerSystemDataFolder(child)).length} 项`)
  }
  const sizeLabel = file.kind === 'container' ? null : fileDetailSizeLabel(file.size)
  if (sizeLabel) segments.push(sizeLabel)
  const modifiedLabel = fileDetailModifiedLabel(file.modifiedAt)
  if (modifiedLabel) segments.push(modifiedLabel)
  return {
    // `.data/` is shown as 数据, as in the tree (explorer-virtual-entries); documents and tables lose their extension.
    title: file.kind === 'container' ? (/\/\.data\/?$/.test(file.uri) ? '数据' : file.name) : displayResourceName(file.name),
    subtitle,
    footer: segments.join(' · '),
  }
}

export function projectFileDetailStructuredReturnAction({  file,
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
    showFileDrawerMetadata: shellState?.showFileDrawerMetadata ?? false,
    showSourceLinkedDrawerMetadata: shellState?.showSourceLinkedDrawerMetadata ?? false,
    showTabs: shellState?.showTabs ?? false,
    sidecarOwnerTarget: shellState?.sidecarOwnerTarget ?? (file ? { uri: file.uri, kind: file.kind } : null),
  }
}
