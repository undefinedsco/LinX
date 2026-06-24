export function showLinxInteractiveWarning(interactive: any, message: string): void {
  interactive?.showWarning?.(message)
}
