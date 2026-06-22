export type LinxTerminalTitleContext = {
  interactive: any
  args: unknown[]
}

export type LinxTerminalTitleHandler = (
  context: LinxTerminalTitleContext
) => void

type LinxTerminalTitleHandlerEntry = {
  name: string
  priority?: number
  handler: LinxTerminalTitleHandler
}

type LinxTerminalTitleRouterState = {
  installed: boolean
  handlers: LinxTerminalTitleHandlerEntry[]
}

const LINX_TERMINAL_TITLE_ROUTER = Symbol.for('linx.tui.terminalTitleRouter')

export function registerLinxTerminalTitleHandler(
  interactive: any,
  entry: LinxTerminalTitleHandlerEntry,
): void {
  const state = getLinxTerminalTitleRouterState(interactive)
  if (state.handlers.some((existing) => existing.name === entry.name)) {
    return
  }

  state.handlers.push(entry)
  state.handlers.sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0))
  installLinxTerminalTitleRouter(interactive, state)
}

function getLinxTerminalTitleRouterState(interactive: any): LinxTerminalTitleRouterState {
  if (!interactive || typeof interactive !== 'object') {
    return { installed: true, handlers: [] }
  }

  const existing = interactive[LINX_TERMINAL_TITLE_ROUTER]
  if (existing && typeof existing === 'object' && Array.isArray(existing.handlers)) {
    return existing as LinxTerminalTitleRouterState
  }

  const state: LinxTerminalTitleRouterState = {
    installed: false,
    handlers: [],
  }
  interactive[LINX_TERMINAL_TITLE_ROUTER] = state
  return state
}

function installLinxTerminalTitleRouter(
  interactive: any,
  state: LinxTerminalTitleRouterState,
): void {
  if (state.installed) {
    return
  }

  const originalUpdateTerminalTitle = typeof interactive?.updateTerminalTitle === 'function'
    ? interactive.updateTerminalTitle.bind(interactive)
    : undefined

  interactive.updateTerminalTitle = function patchedLinxTerminalTitleRouter(...args: unknown[]): unknown {
    const result = originalUpdateTerminalTitle?.(...args)
    const context = { interactive: this, args }
    for (const entry of state.handlers) {
      entry.handler(context)
    }
    return result
  }
  state.installed = true
}
