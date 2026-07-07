export function openFilesExternalUri(uri: string) {
  if (typeof window === 'undefined') return
  window.open(uri, '_blank', 'noopener,noreferrer')
}

export function copyFilesText(text: string) {
  if (typeof navigator === 'undefined') return Promise.resolve()
  return navigator.clipboard?.writeText(text) ?? Promise.resolve()
}

export function openFilesSystemExternalUri(href: string) {
  if (typeof window === 'undefined') return
  void window.xpodDesktop?.app?.openExternal?.(href)
}

export function hasFilesSystemExternalOpen() {
  return typeof window !== 'undefined' && typeof window.xpodDesktop?.app?.openExternal === 'function'
}
