import { useEffect, useMemo, useState } from 'react'

import { useSharedWithMe } from '../../data/queries'
import {
  projectFilesExplorerRows,
  sharedWithMeItemsToEntries,
  type FilesExplorerRowModel,
} from '../../domain/list/explorer-tree-model'
import {
  countFilesSearchNoAccess,
  entryInFilesSearchScope,
  projectFilesSearchNoAccessLine,
  projectFilesSearchEmptyText,
  projectFilesSearchMatchReason,
  projectFilesSearchNote,
  projectFilesSearchScopeLabel,
  FILES_SEARCH_ERROR_TEXT,
  FILES_SEARCH_SCOPE_OPTIONS,
  type FilesSearchScopeId,
} from '../../domain/list/search-scope-model'
import { getEntryName } from '../../domain/resource/resource-semantics'

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

/** R6 K3/K3b: scope menu, one coverage note, a flat result list with the reason each one matched. */
export function useFilesSearchController({
  rows,
  searchText,
  currentFolderUri,
  failedContainerCount = 0,
  onRetry,
}: {
  /** Folders that could not be read while searching; the search says so and offers 重试. */
  failedContainerCount?: number
  onRetry?: () => void
  rows: FilesExplorerRowModel[]
  searchText: string
  currentFolderUri: string | null
}) {
  const [scope, setScope] = useState<FilesSearchScopeId>('mine')
  // Default (to be confirmed): shared items are not searched until the person asks.
  const [includeShared, setIncludeShared] = useState(false)
  const shared = useSharedWithMe()
  const online = useOnline()
  const query = searchText.trim()
  const active = query.length > 0

  const folderLabel = currentFolderUri ? getEntryName(currentFolderUri) : null
  const scopeLabel = projectFilesSearchScopeLabel(scope, folderLabel)

  const sharedRows = useMemo(() => (
    includeShared && active
      ? projectFilesExplorerRows({
          rootEntries: sharedWithMeItemsToEntries(shared.items),
          expandedUris: new Set(),
          childEntriesByContainerUri: {},
          loadingContainerUris: new Set(),
          errorByContainerUri: {},
          searchText: '',
        })
      : []
  ), [active, includeShared, shared.items])

  const results = useMemo(() => {
    if (!active) return []
    return [...rows, ...sharedRows].flatMap((row) => {
      if (row.kind !== 'entry') return []
      const isShared = sharedRows.includes(row)
      if (!isShared && !entryInFilesSearchScope(row.entry, scope, currentFolderUri)) return []
      const reason = projectFilesSearchMatchReason(row.entry, query, row.label)
      return reason ? [{ row, reason: isShared && row.entry.sourceLabel ? `${reason} · ${row.entry.sourceLabel}共享` : reason }] : []
    })
  }, [active, currentFolderUri, query, rows, scope, sharedRows])

  const noAccessLine = useMemo(() => projectFilesSearchNoAccessLine(countFilesSearchNoAccess(
    rows.flatMap((row) => (row.kind === 'entry' ? [row.entry] : [])),
  )), [rows])

  return {
    active,
    scope,
    setScope,
    scopeLabel,
    scopeOptions: FILES_SEARCH_SCOPE_OPTIONS,
    includeShared,
    setIncludeShared,
    noAccessLine: active ? noAccessLine : null,
    error: active && failedContainerCount > 0 ? { text: FILES_SEARCH_ERROR_TEXT, retry: onRetry } : null,
    note: active ? projectFilesSearchNote({ offline: !online }) : null,
    results,
    emptyText: active && results.length === 0 ? projectFilesSearchEmptyText(scopeLabel, query) : null,
  }
}
