export type LinxInteractiveStopPhase = 'before' | 'after' | 'finally'

export type LinxInteractiveStopContext = {
  interactive: any
  args: unknown[]
}

export type LinxInteractiveStopHandler = (
  context: LinxInteractiveStopContext
) => void

type LinxInteractiveStopHandlerEntry = {
  name: string
  phase: LinxInteractiveStopPhase
  priority?: number
  handler: LinxInteractiveStopHandler
}

type LinxInteractiveStopRouterState = {
  installed: boolean
  handlers: LinxInteractiveStopHandlerEntry[]
}

const LINX_INTERACTIVE_STOP_ROUTER = Symbol.for('linx.tui.stopRouter')

const PHASE_ORDER: Record<LinxInteractiveStopPhase, number> = {
  before: 0,
  after: 1,
  finally: 2,
}

export function registerLinxInteractiveStopHandler(
  interactive: any,
  entry: LinxInteractiveStopHandlerEntry,
): void {
  const state = getLinxInteractiveStopRouterState(interactive)
  if (state.handlers.some((existing) => existing.name === entry.name)) {
    return
  }

  state.handlers.push(entry)
  state.handlers.sort(compareStopHandlers)
  installLinxInteractiveStopRouter(interactive, state)
}

function getLinxInteractiveStopRouterState(interactive: any): LinxInteractiveStopRouterState {
  if (!interactive || typeof interactive !== 'object') {
    return { installed: true, handlers: [] }
  }

  const existing = interactive[LINX_INTERACTIVE_STOP_ROUTER]
  if (existing && typeof existing === 'object' && Array.isArray(existing.handlers)) {
    return existing as LinxInteractiveStopRouterState
  }

  const state: LinxInteractiveStopRouterState = {
    installed: false,
    handlers: [],
  }
  interactive[LINX_INTERACTIVE_STOP_ROUTER] = state
  return state
}

function installLinxInteractiveStopRouter(
  interactive: any,
  state: LinxInteractiveStopRouterState,
): void {
  if (state.installed) {
    return
  }

  const originalStop = interactive?.stop?.bind(interactive)
  if (typeof originalStop !== 'function') {
    return
  }

  interactive.stop = function patchedLinxInteractiveStopRouter(...args: unknown[]): void {
    const context = { interactive: this, args }
    const errors: unknown[] = []
    let originalStopFailed = false

    try {
      collectStopHandlerErrors(state, 'before', context, errors)
      try {
        originalStop(...args)
      } catch (error) {
        originalStopFailed = true
        errors.push(error)
      }
      if (!originalStopFailed) {
        collectStopHandlerErrors(state, 'after', context, errors)
      }
    } finally {
      collectStopHandlerErrors(state, 'finally', context, errors)
    }

    if (errors.length > 0) {
      throw errors[0]
    }
  }
  state.installed = true
}

function collectStopHandlerErrors(
  state: LinxInteractiveStopRouterState,
  phase: LinxInteractiveStopPhase,
  context: LinxInteractiveStopContext,
  errors: unknown[],
): void {
  for (const entry of state.handlers) {
    if (entry.phase !== phase) {
      continue
    }
    try {
      entry.handler(context)
    } catch (error) {
      errors.push(error)
    }
  }
}

function compareStopHandlers(
  left: LinxInteractiveStopHandlerEntry,
  right: LinxInteractiveStopHandlerEntry,
): number {
  const phaseDiff = PHASE_ORDER[left.phase] - PHASE_ORDER[right.phase]
  if (phaseDiff !== 0) {
    return phaseDiff
  }
  return (left.priority ?? 0) - (right.priority ?? 0)
}
