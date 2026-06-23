export type LinxInteractiveErrorDisplayTarget = {
  showError?: (message: string) => unknown
  showStatus?: (message: string) => unknown
}

export function showLinxInteractiveError(
  target: LinxInteractiveErrorDisplayTarget | null | undefined,
  message: string,
): void {
  if (typeof target?.showError === 'function') {
    target.showError(message)
    return
  }
  target?.showStatus?.(message)
}
