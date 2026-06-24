export type LinxInteractiveEditorTextOptions = {
  focus?: boolean
  render?: boolean
}

export function setLinxInteractiveEditorText(
  interactive: any,
  text: string,
  options: LinxInteractiveEditorTextOptions = {},
): void {
  interactive.editor?.setText?.(text)

  if (options.focus) {
    interactive.ui?.setFocus?.(interactive.editor)
  }

  if (options.render) {
    interactive.ui?.requestRender?.()
  }
}

export function getLinxInteractiveEditorText(interactive: any): string | undefined {
  if (typeof interactive?.editor?.getText !== 'function') {
    return undefined
  }
  return String(interactive.editor.getText() ?? '')
}
