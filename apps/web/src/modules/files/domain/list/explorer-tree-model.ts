import type { FilesEntry } from '../resource/resource-model'
import { normalizeContainerUri } from '../resource/resource-semantics'
import {
  formatFilesListDate,
  formatFilesListSize,
  isFilesListSidecarEntry,
} from './list-view-model'
import { isExplorerSystemDataFolder, isExplorerTreeEntry, parseAgentHomeContainer, projectExplorerEntryLabel } from './explorer-virtual-entries'

export type FilesExplorerEntryRow = {
  kind: 'entry'
  id: string
  entry: FilesEntry
  depth: number
  expandable: boolean
  expanded: boolean
  iconKind: 'folder' | 'document'
  /** Plain-word name shown in the tree (词表, 属性, 授权 …). */
  label: string
  sizeLabel: string
  modifiedLabel: string
  metadataWarning: {
    label: string
    title: string
  } | null
}

export type FilesExplorerStateRow = {
  kind: 'loading' | 'error' | 'group'
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
  /** Show only folders and data tables (R6 K0). */
  treeOnly?: boolean
  /** Put root rows under 我的空间 and add 共享给我 (R6 K0). */
  groups?: boolean
  /** Assistant folder key -> display name, so `/.data/agents/<id>/` is named by the assistant. */
  agentNames?: Record<string, string>
  /** Items other people shared with me, listed under 共享给我 (R6 K0), grouped by who shared them. */
  sharedWithMe?: {
    items: ReadonlyArray<{ ownerName: string; uri: string; name: string; kind: 'file' | 'folder' }>
    isLoading: boolean
  }
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

function projectEntryRow(
  entry: FilesEntry,
  depth: number,
  expandedUris: ReadonlySet<string>,
  agentNames?: Record<string, string>,
): FilesExplorerEntryRow {
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
    label: (container && agentNames && agentNames[parseAgentHomeContainer(entry.uri)?.agentId ?? '']) || projectExplorerEntryLabel(entry),
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
  for (const entry of entries
    .filter((candidate) => !isFilesListSidecarEntry(candidate) && !isExplorerSystemDataFolder(candidate) && (!input.treeOnly || !!normalizedSearch || isExplorerTreeEntry(candidate)))
    .sort(compareEntries)) {
    const row = projectEntryRow(entry, depth, input.expandedUris, input.agentNames)
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
  const rows = projectRowsForEntries({
    depth: 0,
    entries: input.rootEntries,
    input,
    normalizedSearch: input.searchText.trim().toLowerCase(),
  })
  if (!input.groups || input.searchText.trim()) return rows
  return [
    { kind: 'group', id: 'group::mine', depth: 0, containerUri: '', label: '我的空间' },
    ...rows,
    { kind: 'group', id: 'group::shared', depth: 0, containerUri: '', label: '共享给我' },
    ...projectSharedWithMeRows(input),
  ]
}

function projectSharedWithMeRows(input: FilesExplorerProjectionInput): FilesExplorerRowModel[] {
  const shared = input.sharedWithMe
  if (!shared) return []
  if (shared.isLoading && shared.items.length === 0) {
    return [{ kind: 'loading', id: 'shared::loading', depth: 0, containerUri: '', label: '正在读取…' }]
  }
  if (shared.items.length === 0) {
    return [{ kind: 'loading', id: 'shared::empty', depth: 0, containerUri: '', label: '没有找到别人共享给你的文件夹' }]
  }
  const owners = new Map<string, Array<(typeof shared.items)[number]>>()
  for (const item of shared.items) owners.set(item.ownerName, [...(owners.get(item.ownerName) ?? []), item])
  const rows: FilesExplorerRowModel[] = []
  for (const [ownerName, items] of owners) {
    rows.push({ kind: 'group', id: `shared::owner::${ownerName}`, depth: 0, containerUri: '', label: ownerName })
    const entries = sharedWithMeItemsToEntries(items)
    rows.push(...projectRowsForEntries({ depth: 1, entries, input, normalizedSearch: '' }))
  }
  return rows
}

/** Shared items as entries the tree and search can show like any other file or folder. */
export function sharedWithMeItemsToEntries(
  items: ReadonlyArray<{ ownerName: string; uri: string; name: string; kind: 'file' | 'folder' }>,
): FilesEntry[] {
  return items.map((item): FilesEntry => ({
    id: item.uri,
    uri: item.uri,
    name: item.name,
    kind: item.kind === 'folder' ? 'container' as const : 'resource' as const,
    semanticKind: item.kind === 'folder' ? 'container' : 'file',
    parentUri: '',
    mimeType: null,
    size: null,
    modifiedAt: null,
    sourceLabel: item.ownerName,
  }))
}
