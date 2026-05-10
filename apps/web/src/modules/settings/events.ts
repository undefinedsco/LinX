export const OPEN_SERVICE_MANAGEMENT_EVENT = 'linx:open-service-management'

export function requestOpenServiceManagement() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_SERVICE_MANAGEMENT_EVENT))
}
