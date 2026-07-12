export const OPEN_SERVICE_MANAGEMENT_EVENT = 'linx:open-service-management'

export function requestOpenServiceManagement(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_SERVICE_MANAGEMENT_EVENT))
}

export async function openSettingsExternalUrl(url: string): Promise<void> {
  if (!url) return
  const desktopOpenExternal = typeof window !== 'undefined' ? window.xpodDesktop?.app?.openExternal : undefined
  if (desktopOpenExternal) {
    await desktopOpenExternal(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
