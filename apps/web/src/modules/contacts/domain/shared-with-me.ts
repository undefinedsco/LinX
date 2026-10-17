/**
 * "共享给我": what other people let me open in their space.
 *
 * There is no index of shares, so this is derived from what LinX can actually
 * read: for each saved person, the top level of their space as listed with my
 * own sign-in. What the Pod does not list for me is not here — an empty result
 * means "nothing found", not "nothing shared".
 */
export type SharedWithMeKind = 'file' | 'folder'

export interface SharedWithMeItem {
  /** The saved contact name of the person who shares it. */
  ownerName: string
  /** Where to open it. */
  uri: string
  /** Plain name for the list ("项目计划.pdf"). */
  name: string
  kind: SharedWithMeKind
}

/** Top-level entries of a space that are plumbing or public by design, not something shared with me. */
const SKIPPED_NAMES = new Set(['profile', 'settings', 'inbox', 'public', '.well-known', 'index.html', 'robots.txt'])

function decodeName(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function sharedItemFromUrl(ownerName: string, url: string): SharedWithMeItem | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const isFolder = parsed.pathname.endsWith('/')
  const last = parsed.pathname.split('/').filter(Boolean).pop()
  if (!last) return null
  const name = decodeName(last)
  if (SKIPPED_NAMES.has(name.toLowerCase()) || name.startsWith('.') || /\.(acl|meta)$/i.test(name)) return null
  return { ownerName, uri: parsed.href, name, kind: isFolder ? 'folder' : 'file' }
}

/** Items from one person's space listing; folders first, then by name. */
export function sharedItemsFromListing(ownerName: string, containedUrls: readonly string[]): SharedWithMeItem[] {
  const seen = new Set<string>()
  const items: SharedWithMeItem[] = []
  for (const url of containedUrls) {
    const item = sharedItemFromUrl(ownerName, url)
    if (!item || seen.has(item.uri)) continue
    seen.add(item.uri)
    items.push(item)
  }
  return items.sort((left, right) => (
    left.kind === right.kind ? left.name.localeCompare(right.name, 'zh-Hans-CN') : left.kind === 'folder' ? -1 : 1
  ))
}
