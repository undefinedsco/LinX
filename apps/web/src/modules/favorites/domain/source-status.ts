/**
 * Whether the thing a favorite points at can still be shown.
 *
 * A favorite is only a bookmark. When the original is gone or access was
 * withdrawn, the saved snapshot must not keep showing the content.
 */
export type FavoriteSourceStatus =
  | 'unknown' // nothing to check (local id, no target); the snapshot is all we have
  | 'checking'
  | 'available'
  | 'deleted'
  | 'forbidden'
  | 'offline'
  | 'unreachable'

export function isCheckableFavoriteTarget(targetUri: string | null | undefined): targetUri is string {
  return typeof targetUri === 'string' && /^https?:\/\//i.test(targetUri)
}

export function splitFavoriteTarget(targetUri: string): { documentUrl: string; fragment: string | null } {
  const hashIndex = targetUri.indexOf('#')
  if (hashIndex < 0) return { documentUrl: targetUri, fragment: null }
  const fragment = targetUri.slice(hashIndex + 1)
  return { documentUrl: targetUri.slice(0, hashIndex), fragment: fragment || null }
}

export function classifyFavoriteSourceResponse(input: {
  status: number
  body: string | null
  fragment: string | null
}): FavoriteSourceStatus {
  if (input.status === 404 || input.status === 410) return 'deleted'
  if (input.status === 401 || input.status === 403) return 'forbidden'
  if (input.status >= 200 && input.status < 300) {
    // The document still exists, but a single message inside it may have been removed.
    if (input.fragment && input.body !== null && !input.body.includes(input.fragment)) return 'deleted'
    return 'available'
  }
  return 'unreachable'
}

/** Deleted or withdrawn content is never shown; while checking, wait instead of flashing it. */
export function canShowFavoriteSnapshot(status: FavoriteSourceStatus): boolean {
  return status !== 'deleted' && status !== 'forbidden' && status !== 'checking'
}

/** Jumping back needs the original to be reachable right now. */
export function canOpenFavoriteSource(status: FavoriteSourceStatus): boolean {
  return status === 'available' || status === 'unknown'
}
