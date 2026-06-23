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
  message: string | null | undefined,
  options: LinxInteractiveStatusDisplayOptions = {},
): void {
  if (message !== undefined && message !== null) {
    target?.showStatus?.(message)
  }
  if (options.render !== false) {
    target?.ui?.requestRender?.()
  }
}
