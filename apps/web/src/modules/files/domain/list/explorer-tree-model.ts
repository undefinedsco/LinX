import type { FilesEntry } from '../resource/resource-model'
import { normalizeContainerUri } from '../resource/resource-semantics'
import {
  formatFilesListDate,
  formatFilesListSize,
  isFilesListSidecarEntry,
} from './list-view-model'

export type FilesExplorerEntryRow = {
  kind: 'entry'
  id: string
  entry: FilesEntry
  depth: number
  expandable: boolean
  expanded: boolean
  iconKind: 'folder' | 'document'
  sizeLabel: string
  modifiedLabel: string
  metadataWarning: {
    label: string
    title: string
  } | null
}

export type FilesExplorerStateRow = {
  kind: 'loading' | 'error'
  id: string
  depth: number
  containerUri: string
  label: string
}

export type FilesExplorerRowModel = FilesExplorerEntryRow | FilesExplorerStateRow

export interface FilesExplorerProjectionInput {
  rootEntries: FilesEntry[]
  expandedUris: ReadonlySet<string>
  childEntriesByContainerUri: Record<string, FilesEntry[]>
  loadingContainerUris: ReadonlySet<string>
  errorByContainerUri: Record<string, unknown>
  searchText: string
}

function normalizeContainerKey(uri: string): string {
  return normalizeContainerUri(uri)
}

function isContainerEntry(entry: FilesEntry): boolean {
  return entry.kind === 'container'
}

function compareEntries(a: FilesEntry, b: FilesEntry): number {
  if (a.kind !== b.kind) return a.kind === 'container' ? -1 : 1
  return a.name.localeCompare(b.name)
}

function searchableTextForEntry(entry: FilesEntry) {
  return [
    entry.name,
    entry.uri,
    entry.parentUri,
    entry.mimeType,
    entry.semanticKind,
    entry.kind,
    ...(entry.tags ?? []),
  ].filter(Boolean).join(' ').toLowerCase()
}

function warningForEntry(entry: FilesEntry): FilesExplorerEntryRow['metadataWarning'] {
  if (entry.metadataState !== 'unavailable') return null
  const label = entry.metadataErrorKind === 'unauthorized' || entry.metadataErrorKind === 'forbidden'
    ? '无权限读取元数据'
    : '元数据不可用'
  return {
    label,
    title: entry.metadataError ? `${label}：${entry.metadataError}` : label,
  }
}

function projectEntryRow(entry: FilesEntry, depth: number, expandedUris: ReadonlySet<string>): FilesExplorerEntryRow {
  const container = isContainerEntry(entry)
  const containerUri = container ? normalizeContainerKey(entry.uri) : entry.uri
  return {
    kind: 'entry',
    id: entry.uri,
    entry,
    depth,
    expandable: container,
    expanded: container && expandedUris.has(containerUri),
    iconKind: container ? 'folder' : 'document',
    sizeLabel: formatFilesListSize(entry.size),
    modifiedLabel: formatFilesListDate(entry.modifiedAt),
    metadataWarning: warningForEntry(entry),
  }
}

function childEntriesFor(
  containerUri: string,
  childEntriesByContainerUri: Record<string, FilesEntry[]>,
): FilesEntry[] {
  return childEntriesByContainerUri[normalizeContainerKey(containerUri)] ?? []
}

function entryMatchesSearch(entry: FilesEntry, searchText: string): boolean {
  if (!searchText) return true
  return searchableTextForEntry(entry).includes(searchText)
}

function projectRowsForEntries({
  depth,
  entries,
  input,
  normalizedSearch,
}: {
  depth: number
  entries: FilesEntry[]
  input: FilesExplorerProjectionInput
  normalizedSearch: string
}): FilesExplorerRowModel[] {
  const rows: FilesExplorerRowModel[] = []
  for (const entry of entries.filter((candidate) => !isFilesListSidecarEntry(candidate)).sort(compareEntries)) {
    const row = projectEntryRow(entry, depth, input.expandedUris)
    const containerUri = isContainerEntry(entry) ? normalizeContainerKey(entry.uri) : null
    const children = containerUri && input.expandedUris.has(containerUri)
      ? projectRowsForEntries({
          depth: depth + 1,
          entries: childEntriesFor(containerUri, input.childEntriesByContainerUri),
          input,
          normalizedSearch,
        })
      : []
    const ownMatch = entryMatchesSearch(entry, normalizedSearch)
    const includeForSearch = !normalizedSearch || ownMatch || children.some((child) => child.kind === 'entry')

    if (!includeForSearch) continue

    rows.push(row)
    if (containerUri && row.expanded) {
      if (input.loadingContainerUris.has(containerUri) && !normalizedSearch) {
        rows.push({
          kind: 'loading',
          id: `${containerUri}::loading`,
          depth: depth + 1,
          containerUri,
          label: '正在读取…',
        })
      }
      if (input.errorByContainerUri[containerUri] && !normalizedSearch) {
        rows.push({
          kind: 'error',
          id: `${containerUri}::error`,
          depth: depth + 1,
          containerUri,
          label: '读取失败',
        })
      }
      rows.push(...children)
    }
  }
  return rows
}

export function projectFilesExplorerRows(input: FilesExplorerProjectionInput): FilesExplorerRowModel[] {
  return projectRowsForEntries({
    depth: 0,
    entries: input.rootEntries,
    input,
    normalizedSearch: input.searchText.trim().toLowerCase(),
  })
}
