export interface FolderHistoryEntry {
  treeNodeId: string | null
  selectedFileId: string | null
  scrollKey: string | null
}

export interface FolderPathLocation {
  kind: 'all' | 'recent' | 'local-workspace' | 'container'
  containerUri?: string
  localPath?: string
}

const MAX_FOLDER_HISTORY = 50

export function pushFolderHistory(
  history: readonly FolderHistoryEntry[],
  entry: FolderHistoryEntry,
): FolderHistoryEntry[] {
  const latest = history[history.length - 1]
  if (
    latest?.treeNodeId === entry.treeNodeId
    && latest.selectedFileId === entry.selectedFileId
    && latest.scrollKey === entry.scrollKey
  ) {
    return [...history]
  }
  return [...history, entry].slice(-MAX_FOLDER_HISTORY)
}

export function popFolderHistory(history: readonly FolderHistoryEntry[]): {
  history: FolderHistoryEntry[]
  target: FolderHistoryEntry | null
} {
  if (history.length === 0) return { history: [], target: null }
  return {
    history: history.slice(0, -1),
    target: history[history.length - 1] ?? null,
  }
}

export function projectCurrentFolderPath(location: FolderPathLocation): string {
  if (location.kind === 'all') return '全部文件'
  if (location.kind === 'recent') return '最近使用'
  if (location.kind === 'local-workspace') return location.localPath || '本地工作区'
  if (!location.containerUri) return '文件'

  try {
    const url = new URL(location.containerUri)
    const path = decodeURIComponent(url.pathname).replace(/\/$/u, '')
    return path || '/'
  } catch {
    return decodeURIComponent(location.containerUri).replace(/\/$/u, '') || '/'
  }
}
