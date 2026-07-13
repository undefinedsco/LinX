import {
  getFilesEntrySemanticLabel,
  isFilesSidecarSemanticKind,
  type FilesEntryKind,
  type FilesEntrySemanticKind,
} from '../resource/resource-semantics'
import type { FilesEntryScope } from './entry-scope'

export type FilesListSortField = 'name' | 'kind' | 'mimeType' | 'size' | 'modifiedAt'
export type FilesListSortDirection = 'asc' | 'desc'

export interface FilesListEntry {
  uri: string
  name: string
  kind: FilesEntryKind
  semanticKind: FilesEntrySemanticKind
  parentUri: string
  mimeType: string | null
  size: number | null
  modifiedAt: string | null
  metadataState?: 'available' | 'unavailable'
  metadataErrorKind?: 'unauthorized' | 'forbidden' | 'missing' | 'network' | 'unknown'
  metadataError?: string
  tags?: string[]
}

export interface FilesListRowModel {
  iconKind: 'folder' | 'document'
  kind: FilesEntryKind
  name: string
  semanticLabel: string
  mimeTypeLabel: string
  sizeLabel: string
  modifiedLabel: string
  parentPath: string | null
  parentUri: string
  metadataWarning: {
    label: string
    title: string
  } | null
}

export type FilesListVisibleRow = {
  file: FilesListEntry
  row: FilesListRowModel
}

export type FilesListContentState =
  | { kind: 'loading'; loadingState: FilesListLoadingStateModel }
  | { kind: 'error' }
  | { kind: 'empty' }
  | { kind: 'ready' }

export type FilesListLoadingStateModel = {
  title: string
  description: string
}

export type FilesListEmptyStateIconKind = 'file' | 'folder' | 'drive'

export type FilesListEmptyStateModel = {
  title: string
  description: string
  iconKind: FilesListEmptyStateIconKind
}

export type FilesListScopeHeaderModel = {
  label: string
}

export type FilesBrowserScopeId = 'all' | 'recent' | 'chat-files'

export type FilesListScopeControlModel = {
  id: FilesBrowserScopeId
  label: string
  ariaLabel: string
  options: ReadonlyArray<{
    id: FilesBrowserScopeId
    label: string
  }>
}

export type FilesListToolbarChromeModel = {
  toolbarLabel: string
  searchPlaceholder: string
  clearSearchLabel: string
  filterAndSortLabel: string
  mimeTypeFilterLabel: string
  allMimeTypesLabel: string
  tagFilterLabel: string
  allTagsLabel: string
}

export type FilesListSelectionForEmptyState = {
  kind: 'all' | 'recent' | 'local-workspace' | 'container'
  localPath?: string | null
}

export function formatFilesListSize(bytes?: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatFilesListDate(iso?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatFilesListParentPath(parentUri: string): string {
  try {
    const url = new URL(parentUri)
    return url.pathname || '/'
  } catch {
    return parentUri
  }
}

export function isFilesListSidecarEntry(entry: Pick<FilesListEntry, 'kind' | 'name' | 'semanticKind'>): boolean {
  if (isFilesSidecarSemanticKind(entry.semanticKind)) return true
  if (entry.kind !== 'resource') return false

  return entry.name === '.meta' ||
    entry.name === '.acl' ||
    entry.name === '.acr' ||
    entry.name.endsWith('.meta') ||
    entry.name.endsWith('.acl') ||
    entry.name.endsWith('.acr')
}

export function projectBrowsableFiles<T extends Pick<FilesListEntry, 'kind' | 'name' | 'semanticKind'>>(entries: T[]): T[] {
  return entries.filter((entry) => !isFilesListSidecarEntry(entry))
}

export function projectFilesListContentState({
  hasError,
  hasVisibleFiles,
  isLoading,
}: {
  hasError: boolean
  hasVisibleFiles: boolean
  isLoading: boolean
}): FilesListContentState {
  if (isLoading) {
    return {
      kind: 'loading',
      loadingState: {
        title: '正在读取资源',
        description: '稍等，正在从当前空间读取内容。',
      },
    }
  }
  if (hasError) return { kind: 'error' }
  if (!hasVisibleFiles) return { kind: 'empty' }
  return { kind: 'ready' }
}

export function projectFilesListScopeHeaderModel({
  selection,
}: {
  selection: Pick<FilesListSelectionForEmptyState, 'kind'>
}): FilesListScopeHeaderModel | null {
  if (selection.kind === 'recent') {
    return { label: '最近文件' }
  }

  return null
}

export function projectFilesListScopeControlModel({
  entryScope,
  selection,
}: {
  entryScope: FilesEntryScope
  selection: Pick<FilesListSelectionForEmptyState, 'kind'>
}): FilesListScopeControlModel {
  const options = [
    { id: 'all', label: '全部文件' },
    { id: 'recent', label: '最近文件' },
    { id: 'chat-files', label: '聊天文件' },
  ] as const
  const id: FilesBrowserScopeId = entryScope === 'chat-files'
    ? 'chat-files'
    : selection.kind === 'recent'
      ? 'recent'
      : 'all'
  const label = options.find((option) => option.id === id)?.label ?? options[0].label

  return {
    id,
    label,
    ariaLabel: `文件范围：${label}`,
    options,
  }
}

export function projectFilesListToolbarChromeModel(): FilesListToolbarChromeModel {
  return {
    toolbarLabel: '资源工具栏',
    searchPlaceholder: '搜索当前范围...',
    clearSearchLabel: '清空搜索',
    filterAndSortLabel: '筛选和排序',
    mimeTypeFilterLabel: '类型筛选',
    allMimeTypesLabel: '全部类型',
    tagFilterLabel: '标签筛选',
    allTagsLabel: '全部标签',
  }
}

export function projectFilesListRow(entry: FilesListEntry, options: { showParentPath: boolean }): FilesListRowModel {
  const metadataUnavailableLabel = entry.metadataErrorKind === 'unauthorized' || entry.metadataErrorKind === 'forbidden'
    ? '无权限读取元数据'
    : '元数据不可用'

  return {
    iconKind: entry.kind === 'container' ? 'folder' : 'document',
    kind: entry.kind,
    name: entry.name,
    semanticLabel: getFilesEntrySemanticLabel(entry.semanticKind),
    mimeTypeLabel: entry.mimeType ?? '—',
    sizeLabel: formatFilesListSize(entry.size),
    modifiedLabel: formatFilesListDate(entry.modifiedAt),
    parentPath: options.showParentPath ? formatFilesListParentPath(entry.parentUri) : null,
    parentUri: entry.parentUri,
    metadataWarning: entry.metadataState === 'unavailable'
      ? {
          label: metadataUnavailableLabel,
          title: entry.metadataError ? `${metadataUnavailableLabel}：${entry.metadataError}` : metadataUnavailableLabel,
        }
      : null,
  }
}

export function projectFilesListVisibleRows<T extends FilesListEntry>(
  files: T[],
  options: { showParentPath: boolean },
) {
  return files.map((file) => ({
    file,
    row: projectFilesListRow(file, options),
  }))
}

export function projectFilesListCopyText(files: Array<Pick<FilesListEntry, 'uri'>>) {
  return files.map((file) => file.uri).join('\n')
}

export function projectFilesListEmptyStateModel({
  entryScope,
  mimeTypeFilter,
  searchText,
  selection,
  tagFilter,
}: {
  entryScope: FilesEntryScope
  mimeTypeFilter: string | null
  searchText: string
  selection: FilesListSelectionForEmptyState
  tagFilter: string | null
}): FilesListEmptyStateModel {
  if (selection.kind === 'local-workspace') {
    return {
      title: '当前话题绑定的是本地目录',
      description: `${selection.localPath ?? '该目录'} 暂时不能在 Web 端直接浏览；请在桌面端打开，或先把产物同步到你的空间。`,
      iconKind: 'drive',
    }
  }

  if (searchText || mimeTypeFilter || tagFilter) {
    return {
      title: '没有匹配的资源',
      description: '换个关键词，或者切到其它容器继续浏览。',
      iconKind: 'folder',
    }
  }

  if (selection.kind === 'recent') {
    return {
      title: '还没有最近文件',
      description: '打开或修改过的 Pod resource 会出现在这里。',
      iconKind: 'file',
    }
  }

  if (entryScope === 'chat-files') {
    return {
      title: '当前聊天没有关联文件',
      description: '聊天中引用的文件和当前话题 workspace 里的生成文件会显示在这里。',
      iconKind: 'file',
    }
  }

  return {
    title: '当前容器为空',
    description: '这个范围里还没有可浏览的资源。',
    iconKind: 'folder',
  }
}
