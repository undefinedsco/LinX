const autoEditorIndicatorInstalled = new WeakSet<object>()
const autoEditorIndicatorRenderInstalled = new WeakSet<object>()

export function isAutoEditorIndicatorInstalled(interactive: unknown): boolean {
  return Boolean(interactive && typeof interactive === 'object' && autoEditorIndicatorInstalled.has(interactive))
}

export function markAutoEditorIndicatorInstalled(interactive: object): void {
  autoEditorIndicatorInstalled.add(interactive)
}

export function isAutoEditorIndicatorRenderInstalled(editor: unknown): boolean {
  return Boolean(editor && typeof editor === 'object' && autoEditorIndicatorRenderInstalled.has(editor))
}

export function markAutoEditorIndicatorRenderInstalled(editor: object): void {
  autoEditorIndicatorRenderInstalled.add(editor)
}
