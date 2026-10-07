import type { FilesEntry } from '../resource/resource-model'
import {
  projectBrowsableFiles,
  type FilesListSelectionForEmptyState,
  type FilesListSortDirection,
  type FilesListSortField,
} from './list-view-model'

export interface FilesListProjectionOptions {
  mimeTypeFilter: string | null
  tagFilter: string | null
  searchText: string
  sortField: FilesListSortField
  sortDirection: FilesListSortDirection
}

function sortFiles(
  files: FilesEntry[],
  field: FilesListSortField,
  direction: FilesListSortDirection,
): FilesEntry[] {
  const sorted = [...files].sort((a, b) => {
    let cmp = 0
    switch (field) {
      case 'name':
        cmp = a.name.localeCompare(b.name)
        break
      case 'kind':
        cmp = a.kind.localeCompare(b.kind)
        break
      case 'mimeType':
        cmp = (a.mimeType ?? '').localeCompare(b.mimeType ?? '')
        break
      case 'size':
        cmp = (a.size ?? -1) - (b.size ?? -1)
        break
      case 'modifiedAt':
        cmp = new Date(a.modifiedAt ?? 0).getTime() - new Date(b.modifiedAt ?? 0).getTime()
        break
    }
    return cmp
  })
  return direction === 'desc' ? sorted.reverse() : sorted
}

function isRecentFilesCandidate(file: FilesEntry) {
  return Boolean(file.modifiedAt)
}

function searchableTextForFile(file: FilesEntry) {
  return [
    file.name,
    file.uri,
    file.parentUri,
    file.mimeType,
    file.semanticKind,
    file.kind,
    ...(file.tags ?? []),
  ].filter(Boolean).join(' ').toLowerCase()
}

export function projectVisibleFiles(entries: FilesEntry[], options: FilesListProjectionOptions): FilesEntry[] {
  let result = projectBrowsableFiles(entries)

  if (options.mimeTypeFilter) {
    result = result.filter((file) => file.mimeType === options.mimeTypeFilter)
  }

  if (options.tagFilter) {
    result = result.filter((file) => file.tags?.includes(options.tagFilter!))
  }

  if (options.searchText) {
    const lower = options.searchText.toLowerCase()
    result = result.filter((file) => searchableTextForFile(file).includes(lower))
  }

  return sortFiles(result, options.sortField, options.sortDirection)
}

export function projectFilesListBaseEntries(
  entries: FilesEntry[],
  selection: Pick<FilesListSelectionForEmptyState, 'kind'>,
): FilesEntry[] {
  if (selection.kind === 'recent') {
    return getRecentFiles(entries)
  }

  return projectBrowsableFiles(entries)
}

export function getRecentFiles(entries: FilesEntry[], limit = 20): FilesEntry[] {
  return sortFiles(
    projectBrowsableFiles(entries).filter(isRecentFilesCandidate),
    'modifiedAt',
    'desc',
  ).slice(0, limit)
}

export function getVisibleMimeTypeOptions(entries: FilesEntry[]): string[] {
  return Array.from(new Set(projectBrowsableFiles(entries)
    .map((file) => file.mimeType)
    .filter((mimeType): mimeType is string => !!mimeType))).sort()
}

export function getVisibleTagOptions(entries: FilesEntry[]): string[] {
  return Array.from(new Set(projectBrowsableFiles(entries)
    .flatMap((file) => file.tags ?? [])
    .filter((tag) => !!tag.trim()))).sort()
}
