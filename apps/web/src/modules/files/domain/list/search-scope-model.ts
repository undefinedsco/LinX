import type { FilesEntry } from '../resource/resource-model'
import { normalizeContainerUri } from '../resource/resource-semantics'

/** R6 K3/K3b: search from the title bar with a scope; results are a flat list that says why they matched. */

export type FilesSearchScopeId = 'mine' | 'cards' | 'folder'

export interface FilesSearchScopeOption {
  id: FilesSearchScopeId
  label: string
}

export const FILES_SEARCH_SCOPE_OPTIONS: readonly FilesSearchScopeOption[] = [
  { id: 'mine', label: '我的空间' },
  { id: 'cards', label: '只搜卡片' },
  { id: 'folder', label: '当前文件夹' },
]

export function projectFilesSearchScopeLabel(scope: FilesSearchScopeId, folderLabel?: string | null): string {
  if (scope === 'folder') return folderLabel ? `当前文件夹：${folderLabel}` : '当前文件夹'
  return FILES_SEARCH_SCOPE_OPTIONS.find((option) => option.id === scope)?.label ?? '我的空间'
}

function isCardEntry(entry: FilesEntry) {
  return entry.kind === 'resource' && (
    entry.semanticKind === 'structured-data'
    || entry.semanticKind === 'source-linked-card'
    || entry.semanticKind.startsWith('vocab-')
    || entry.mimeType === 'text/markdown'
  )
}

export function entryInFilesSearchScope(entry: FilesEntry, scope: FilesSearchScopeId, currentFolderUri: string | null): boolean {
  if (scope === 'cards') return isCardEntry(entry)
  if (scope === 'folder') {
    if (!currentFolderUri) return true
    return normalizeContainerUri(entry.parentUri) === normalizeContainerUri(currentFolderUri)
  }
  return true
}

/** Plain-word reason a result matched. Only what the loaded entries can tell us. */
export function projectFilesSearchMatchReason(entry: FilesEntry, query: string, displayName = entry.name): string | null {
  const needle = query.trim().toLowerCase()
  if (!needle) return null
  if (displayName.toLowerCase().includes(needle) || entry.name.toLowerCase().includes(needle)) return '标题匹配'
  if ((entry.tags ?? []).some((tag) => tag.toLowerCase().includes(needle))) return '标签匹配'
  if (entry.mimeType?.toLowerCase().includes(needle)) return '类型匹配'
  if (entry.uri.toLowerCase().includes(needle) || entry.parentUri.toLowerCase().includes(needle)) return '路径匹配'
  return null
}

export type FilesSearchNote =
  | { kind: 'info'; text: string }
  | { kind: 'warning'; text: string }

/** At most one grey line under the search box, only when coverage is partial. */
export function projectFilesSearchNote({ offline }: { offline: boolean }): FilesSearchNote {
  if (offline) return { kind: 'warning', text: '没有网络，只搜了这台电脑上已有的内容' }
  return { kind: 'info', text: '文件正文还没建立索引，这次只按标题搜索' }
}

export function projectFilesSearchEmptyText(scopeLabel: string, query: string): { title: string; description: string } {
  return {
    title: `“${scopeLabel}”里没有找到 ${query.trim()}`,
    description: '不代表别处没有',
  }
}

export const FILES_SEARCH_INCLUDE_SHARED_LABEL = '也搜共享给我的'

/** Entries whose details could not be read because of missing permission; they are not shown, only counted. */
export function countFilesSearchNoAccess(entries: readonly FilesEntry[]): number {
  return entries.filter((entry) => (
    entry.metadataState === 'unavailable'
    && (entry.metadataErrorKind === 'unauthorized' || entry.metadataErrorKind === 'forbidden')
  )).length
}

export function projectFilesSearchNoAccessLine(count: number): string | null {
  return count > 0 ? `${count} 个没有权限，不显示` : null
}

export const FILES_SEARCH_ERROR_TEXT = '搜索出错了，没有搜完'
