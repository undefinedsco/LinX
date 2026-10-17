import { FileText } from 'lucide-react'
import type { FilesSearchScopeId } from '../../domain/list/search-scope-model'
import { useFilesBodySearch, useOpenBodyHit, type FilesBodySearch } from './useFilesBodySearch'

/** Splits a snippet around the first occurrence of the matched text, for highlighting. */
export function splitSnippet(snippet: string, matched: string): [string, string, string] {
  const at = matched ? snippet.toLowerCase().indexOf(matched.toLowerCase()) : -1
  if (at < 0) return [snippet, '', '']
  return [snippet.slice(0, at), snippet.slice(at, at + matched.length), snippet.slice(at + matched.length)]
}

/**
 * K3: results that matched inside the file text, each with a snippet and why it
 * matched, plus the one grey coverage line. Clicking opens the card popup at
 * the matching line. Mount it under the search strip in Files.
 */
export function FilesBodySearchSection({
  query,
  scope,
  currentFolderUri,
  search: provided,
}: {
  query: string
  scope?: FilesSearchScopeId
  currentFolderUri?: string | null
  /** Results already computed by the parent (it also needs them for the empty state). */
  search?: FilesBodySearch
}) {
  const own = useFilesBodySearch(provided ? '' : query, { scope, currentFolderUri })
  const search = provided ?? own
  const openHit = useOpenBodyHit()
  if (!search.active) return null
  return (
    <section aria-label="正文里的结果" className="border-b border-border/30 py-1">
      {search.note ? (
        <p role="status" className="px-3 py-1 text-xs text-muted-foreground">{search.note}</p>
      ) : null}
      {search.hits.map((hit) => {
        const [before, match, after] = splitSnippet(hit.snippet, hit.matched)
        return (
          <button
            key={hit.uri}
            type="button"
            onClick={() => openHit(hit)}
            className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
          >
            <FileText strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground">{hit.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {before}<mark className="bg-transparent font-medium text-foreground">{match}</mark>{after}
              </span>
              <span className="block text-[11px] text-muted-foreground">{hit.reason} · 第 {hit.line} 行</span>
            </span>
          </button>
        )
      })}
    </section>
  )
}
