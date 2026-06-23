export function replaceLinxInteractiveHeader(interactive: any, replacement: unknown): void {
  const currentHeader = interactive?.customHeader ?? interactive?.builtInHeader
  const index = interactive?.headerContainer?.children?.indexOf?.(currentHeader) ?? -1
  if (index >= 0) {
    interactive.headerContainer.children[index] = replacement
  }
  interactive.customHeader = replacement
  interactive.ui?.requestRender?.()
}
