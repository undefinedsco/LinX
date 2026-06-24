export function openLinxInteractiveExternalUrl(interactive: any, url: string): boolean {
  if (typeof interactive?.openExternal !== 'function') {
    return false
  }

  interactive.openExternal(url)
  return true
}
