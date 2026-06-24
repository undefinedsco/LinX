export type LinxEditorComponentRebindContext = {
  interactive: any
  args: unknown[]
  result: unknown
}

export type LinxEditorComponentRebindHandler = (
  context: LinxEditorComponentRebindContext
) => void

type LinxEditorComponentRebindHandlerEntry = {
  name: string
  priority?: number
  handler: LinxEditorComponentRebindHandler
}

type LinxEditorComponentRouterState = {
  installed: boolean
  handlers: LinxEditorComponentRebindHandlerEntry[]
}

const LINX_EDITOR_COMPONENT_ROUTER = Symbol.for('linx.tui.editorComponentRouter')

export function registerLinxEditorComponentRebindHandler(
  interactive: any,
  entry: LinxEditorComponentRebindHandlerEntry,
): void {
  const state = getLinxEditorComponentRouterState(interactive)
  if (state.handlers.some((existing) => existing.name === entry.name)) {
    return
  }

  state.handlers.push(entry)
  state.handlers.sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0))
  installLinxEditorComponentRouter(interactive, state)
}

function getLinxEditorComponentRouterState(interactive: any): LinxEditorComponentRouterState {
  if (!interactive || typeof interactive !== 'object') {
    return { installed: true, handlers: [] }
  }

  const existing = interactive[LINX_EDITOR_COMPONENT_ROUTER]
  if (existing && typeof existing === 'object' && Array.isArray(existing.handlers)) {
    return existing as LinxEditorComponentRouterState
  }

  const state: LinxEditorComponentRouterState = {
    installed: false,
    handlers: [],
  }
  interactive[LINX_EDITOR_COMPONENT_ROUTER] = state
  return state
}

function installLinxEditorComponentRouter(
  interactive: any,
  state: LinxEditorComponentRouterState,
): void {
  if (state.installed) {
    return
  }

  const originalSetCustomEditorComponent = interactive?.setCustomEditorComponent?.bind(interactive)
  if (typeof originalSetCustomEditorComponent !== 'function') {
    return
  }

  interactive.setCustomEditorComponent = function patchedLinxEditorComponentRouter(...args: unknown[]): unknown {
    const result = originalSetCustomEditorComponent(...args)
    const context = { interactive: this, args, result }
    for (const entry of state.handlers) {
      entry.handler(context)
    }
    return result
  }
  state.installed = true
}

export function canMountLinxEditorComponent(interactive: any): boolean {
  return Boolean(
    interactive?.ui
      && interactive?.editor
      && typeof interactive?.editorContainer?.clear === 'function'
      && typeof interactive?.editorContainer?.addChild === 'function'
      && typeof interactive?.ui?.setFocus === 'function'
      && typeof interactive?.ui?.requestRender === 'function',
  )
}

export function mountLinxEditorComponent(interactive: any, component: unknown): () => void {
  interactive.editorContainer.clear()
  interactive.editorContainer.addChild(component)
  interactive.ui?.setFocus?.(component)
  interactive.ui?.requestRender?.()

  return () => restoreLinxEditorComponent(interactive)
}

export function forEachLinxInteractiveEditorComponent(
  interactive: any,
  callback: (editor: any) => void,
): void {
  const editors = [interactive?.defaultEditor, interactive?.editor]
  const seen = new Set<unknown>()
  for (const editor of editors) {
    if (!editor || seen.has(editor)) {
      continue
    }
    seen.add(editor)
    callback(editor)
  }
}

function restoreLinxEditorComponent(interactive: any): void {
  interactive.editorContainer.clear()
  interactive.editorContainer.addChild(interactive.editor)
  interactive.ui?.setFocus?.(interactive.editor)
  interactive.ui?.requestRender?.()
}
