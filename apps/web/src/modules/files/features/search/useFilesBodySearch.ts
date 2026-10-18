import { useCallback, useMemo } from 'react'
import { useCardDialog } from '@/lib/card-dialog'
import { useFilesBodyIndex } from '../../data/queries/body-search-queries'
import type { BodyHit } from '../../domain/search/body-index'
import { entryInFilesSearchScope, type FilesSearchScopeId } from '../../domain/list/search-scope-model'

export type FilesBodyHit = BodyHit
export type FilesBodySearch = ReturnType<typeof useFilesBodySearch>

/**
 * File body search (R6 K3/S2): hits come from the client-side body index of
 * text that is cheap to read or already prepared for the AI. Reading starts the
 * first time something is searched. `note` is the one grey coverage line.
 */
export function useFilesBodySearch(
  query: string,
  options: { scope?: FilesSearchScopeId; currentFolderUri?: string | null; limit?: number } = {},
) {
  const { scope = 'mine', currentFolderUri = null, limit } = options
  const trimmed = query.trim()
  const active = trimmed.length > 0
  const { store, snapshot, entries, isLoadingEntries } = useFilesBodyIndex(active)

  const hits = useMemo<FilesBodyHit[]>(() => {
    if (!active || !store) return []
    const byUri = new Map(entries.map((entry) => [entry.uri, entry]))
    return store.search(trimmed, {
      limit,
      filter: scope === 'mine'
        ? undefined
        : (uri) => {
            const entry = byUri.get(uri)
            return !!entry && entryInFilesSearchScope(entry, scope, currentFolderUri)
          },
    })
    // snapshot.version changes whenever the index does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, currentFolderUri, entries, limit, scope, snapshot.version, store, trimmed])

  return {
    active,
    hits,
    note: active ? snapshot.note : null,
    isIndexing: active && (snapshot.indexing || isLoadingEntries),
    coverage: snapshot.coverage,
  }
}

/** Opens the card popup at the matching line, with the matched text as the quote to highlight. */
export function useOpenBodyHit() {
  const open = useCardDialog((state) => state.open)
  return useCallback((hit: Pick<BodyHit, 'uri' | 'line' | 'quote'>) => {
    open({ uri: hit.uri, locator: { line: hit.line, quote: hit.quote }, from: 'search' })
  }, [open])
}
