export type LinxExtensionUiContext = {
  interactive: any
  args: unknown[]
  ui: unknown
}

export type LinxExtensionUiContextHandler = (
  context: LinxExtensionUiContext
) => unknown

type LinxExtensionUiContextHandlerEntry = {
  name: string
  priority?: number
  handler: LinxExtensionUiContextHandler
}

type LinxExtensionUiContextRouterState = {
  installed: boolean
  handlers: LinxExtensionUiContextHandlerEntry[]
}

const LINX_EXTENSION_UI_CONTEXT_ROUTER = Symbol.for('linx.tui.extensionUiContextRouter')

export function registerLinxExtensionUiContextHandler(
  interactive: any,
  entry: LinxExtensionUiContextHandlerEntry,
): void {
  const state = getLinxExtensionUiContextRouterState(interactive)
  if (state.handlers.some((existing) => existing.name === entry.name)) {
    return
  }

  state.handlers.push(entry)
  state.handlers.sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0))
  installLinxExtensionUiContextRouter(interactive, state)
}

function getLinxExtensionUiContextRouterState(interactive: any): LinxExtensionUiContextRouterState {
  if (!interactive || typeof interactive !== 'object') {
    return { installed: true, handlers: [] }
  }

  const existing = interactive[LINX_EXTENSION_UI_CONTEXT_ROUTER]
  if (existing && typeof existing === 'object' && Array.isArray(existing.handlers)) {
    return existing as LinxExtensionUiContextRouterState
  }

  const state: LinxExtensionUiContextRouterState = {
    installed: false,
    handlers: [],
  }
  interactive[LINX_EXTENSION_UI_CONTEXT_ROUTER] = state
  return state
}

function installLinxExtensionUiContextRouter(
  interactive: any,
  state: LinxExtensionUiContextRouterState,
): void {
  if (state.installed) {
    return
  }

  const originalCreateExtensionUiContext = interactive?.createExtensionUIContext?.bind(interactive)
  if (typeof originalCreateExtensionUiContext !== 'function') {
    return
  }

  interactive.createExtensionUIContext = function patchedLinxExtensionUiContextRouter(...args: unknown[]): unknown {
    let ui = originalCreateExtensionUiContext(...args)
    for (const entry of state.handlers) {
      ui = entry.handler({ interactive: this, args, ui })
    }
    return ui
  }
  state.installed = true
}
