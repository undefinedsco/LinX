export type LinxInteractiveRunContext = {
  interactive: any
  args: unknown[]
}

export type LinxInteractiveRunHandler = (
  context: LinxInteractiveRunContext
) => void | Promise<void>

type LinxInteractiveRunHandlerEntry = {
  name: string
  priority?: number
  handler: LinxInteractiveRunHandler
}

type LinxInteractiveRunRouterState = {
  installed: boolean
  handlers: LinxInteractiveRunHandlerEntry[]
}

const LINX_INTERACTIVE_RUN_ROUTER = Symbol.for('linx.tui.runRouter')

export function registerLinxInteractiveRunHandler(
  interactive: any,
  entry: LinxInteractiveRunHandlerEntry,
): void {
  const state = getLinxInteractiveRunRouterState(interactive)
  if (state.handlers.some((existing) => existing.name === entry.name)) {
    return
  }

  state.handlers.push(entry)
  state.handlers.sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0))
  installLinxInteractiveRunRouter(interactive, state)
}

function getLinxInteractiveRunRouterState(interactive: any): LinxInteractiveRunRouterState {
  if (!interactive || typeof interactive !== 'object') {
    return { installed: true, handlers: [] }
  }

  const existing = interactive[LINX_INTERACTIVE_RUN_ROUTER]
  if (existing && typeof existing === 'object' && Array.isArray(existing.handlers)) {
    return existing as LinxInteractiveRunRouterState
  }

  const state: LinxInteractiveRunRouterState = {
    installed: false,
    handlers: [],
  }
  interactive[LINX_INTERACTIVE_RUN_ROUTER] = state
  return state
}

function installLinxInteractiveRunRouter(
  interactive: any,
  state: LinxInteractiveRunRouterState,
): void {
  if (state.installed) {
    return
  }

  const originalRun = interactive?.run?.bind(interactive)
  if (typeof originalRun !== 'function') {
    return
  }

  interactive.run = async function patchedLinxInteractiveRunRouter(...args: unknown[]): Promise<unknown> {
    const context = { interactive: this, args }
    for (const entry of state.handlers) {
      await entry.handler(context)
    }
    return originalRun(...args)
  }
  state.installed = true
}
