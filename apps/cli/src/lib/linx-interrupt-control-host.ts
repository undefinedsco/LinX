const escapeInterruptInstalled = new WeakSet<object>()
const clearInterruptInstalled = new WeakSet<object>()
const escapeInterruptWrappers = new WeakSet<Function>()

export function isEscapeInterruptInstalled(editor: unknown): boolean {
  return Boolean(editor && typeof editor === 'object' && escapeInterruptInstalled.has(editor))
}

export function markEscapeInterruptInstalled(editor: object): void {
  escapeInterruptInstalled.add(editor)
}

export function isClearInterruptInstalled(editor: unknown): boolean {
  return Boolean(editor && typeof editor === 'object' && clearInterruptInstalled.has(editor))
}

export function markClearInterruptInstalled(editor: object): void {
  clearInterruptInstalled.add(editor)
}

export function isEscapeInterruptWrapper(value: unknown): boolean {
  return Boolean(value && typeof value === 'function' && escapeInterruptWrappers.has(value))
}

export function markEscapeInterruptWrapper(value: Function): void {
  escapeInterruptWrappers.add(value)
}
