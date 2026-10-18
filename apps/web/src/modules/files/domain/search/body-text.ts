/**
 * R6 K3: what file bodies the search may index. Parsing stays hidden from users:
 * search only uses text that is cheap to read directly (plain text, markdown,
 * csv) or that the Ingest pipeline already wrote next to the source (a markdown
 * body with `linx-source-block` markers). Nothing is parsed just for search.
 */

export const BODY_INDEX_MAX_BYTES = 200_000

export interface BodyIndexableEntry {
  kind: string
  semanticKind: string
  name: string
  mimeType: string | null
  size: number | null
}

const READABLE_MIME = new Set(['text/markdown', 'text/plain', 'text/csv', 'text/x-markdown'])
const READABLE_EXT = /\.(md|markdown|txt|csv)$/i

/** Files that are not documents a person would look into: sidecars, folders. */
export function isSearchableFile(entry: Pick<BodyIndexableEntry, 'kind' | 'semanticKind'>): boolean {
  return entry.kind !== 'container'
    && entry.semanticKind !== 'meta-sidecar'
    && entry.semanticKind !== 'access-policy-sidecar'
}

/** Cheap to read directly, and small enough to keep in memory. */
export function isBodyReadable(entry: BodyIndexableEntry): boolean {
  if (!isSearchableFile(entry)) return false
  if (entry.size != null && entry.size > BODY_INDEX_MAX_BYTES) return false
  const mime = entry.mimeType?.split(';')[0].trim().toLowerCase() ?? ''
  return READABLE_MIME.has(mime) || READABLE_EXT.test(entry.name)
}

/**
 * Drops machine markers (`<!-- linx-source-block ... -->`, other one-line HTML
 * comments) but keeps every line break, so line numbers match the file.
 */
export function normalizeBodyText(content: string): string {
  return content
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => (/^\s*<!--.*-->\s*$/.test(line) ? '' : line))
    .join('\n')
}

/** Small stable hash (FNV-1a) used to skip re-indexing unchanged content. */
export function hashBodyText(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36).padStart(7, '0')
}

/** Cheap change stamp from the listing, so unchanged files are not even re-read. */
export function bodyStamp(entry: { modifiedAt: string | null; size: number | null }): string {
  return `${entry.modifiedAt ?? ''}|${entry.size ?? ''}`
}
