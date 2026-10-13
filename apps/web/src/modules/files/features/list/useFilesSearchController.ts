import { useEffect, useMemo, useState } from 'react'

import type { FilesExplorerRowModel } from '../../domain/list/explorer-tree-model'
import {
  entryInFilesSearchScope,
  projectFilesSearchEmptyText,
  projectFilesSearchMatchReason,
  projectFilesSearchNote,
  projectFilesSearchScopeLabel,
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
}: {
  rows: FilesExplorerRowModel[]
  searchText: string
  currentFolderUri: string | null
}) {
  const [scope, setScope] = useState<FilesSearchScopeId>('mine')
  const online = useOnline()
  const query = searchText.trim()
  const active = query.length > 0

  const folderLabel = currentFolderUri ? getEntryName(currentFolderUri) : null
  const scopeLabel = projectFilesSearchScopeLabel(scope, folderLabel)

  const results = useMemo(() => {
    if (!active) return []
    return rows.flatMap((row) => {
      if (row.kind !== 'entry') return []
      if (!entryInFilesSearchScope(row.entry, scope, currentFolderUri)) return []
      const reason = projectFilesSearchMatchReason(row.entry, query, row.label)
      return reason ? [{ row, reason }] : []
    })
  }, [active, currentFolderUri, query, rows, scope])

  return {
    active,
    scope,
    setScope,
    scopeLabel,
    scopeOptions: FILES_SEARCH_SCOPE_OPTIONS,
    note: active ? projectFilesSearchNote({ offline: !online }) : null,
    results,
    emptyText: active && results.length === 0 ? projectFilesSearchEmptyText(scopeLabel, query) : null,
  }
}
