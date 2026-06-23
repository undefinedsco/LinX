export type LinxInteractiveStatusDisplayTarget = {
  showStatus?: (message: string) => unknown
  ui?: {
    requestRender?: () => unknown
  }
}

export type LinxInteractiveStatusDisplayOptions = {
  render?: boolean
}

export function showLinxInteractiveStatus(
  target: LinxInteractiveStatusDisplayTarget | null | undefined,
  message: string,
  options: LinxInteractiveStatusDisplayOptions = {},
): void {
  target?.showStatus?.(message)
  if (options.render !== false) {
    target?.ui?.requestRender?.()
  }
}
