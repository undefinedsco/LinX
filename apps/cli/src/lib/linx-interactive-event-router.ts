export type LinxInteractiveEventContext = {
  interactive: any
  event: unknown
  args: unknown[]
  originalHandleEvent: (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown
}

export type LinxInteractiveErrorContext = {
  interactive: any
  errorMessage: unknown
  args: unknown[]
  originalShowError: (errorMessage: unknown, ...args: unknown[]) => unknown
}

export type LinxInteractiveEventHandlerResult = {
  handled: true
  result?: unknown
} | {
  handled: false
  event?: unknown
}

export type LinxInteractiveErrorHandlerResult = {
  handled: true
  result?: unknown
} | {
  handled: false
  errorMessage?: unknown
}

type LinxInteractiveEventHandlerEntry = {
  name: string
  priority?: number
  handler: (context: LinxInteractiveEventContext) => Promise<LinxInteractiveEventHandlerResult> | LinxInteractiveEventHandlerResult
}

type LinxInteractiveErrorHandlerEntry = {
  name: string
  priority?: number
  handler: (context: LinxInteractiveErrorContext) => LinxInteractiveErrorHandlerResult
}

type LinxInteractiveEventRouterState = {
  installed: boolean
  eventHandlers: LinxInteractiveEventHandlerEntry[]
  errorHandlers: LinxInteractiveErrorHandlerEntry[]
}

const LINX_INTERACTIVE_EVENT_ROUTER = Symbol.for('linx.tui.eventRouter')

export function registerLinxInteractiveEventHandler(
  interactive: any,
  entry: LinxInteractiveEventHandlerEntry,
): void {
  const state = getLinxInteractiveEventRouterState(interactive)
  if (state.eventHandlers.some((existing) => existing.name === entry.name)) {
    return
  }

  state.eventHandlers.push(entry)
  state.eventHandlers.sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0))
  installLinxInteractiveEventRouter(interactive, state)
}

export function registerLinxInteractiveErrorHandler(
  interactive: any,
  entry: LinxInteractiveErrorHandlerEntry,
): void {
  const state = getLinxInteractiveEventRouterState(interactive)
  if (state.errorHandlers.some((existing) => existing.name === entry.name)) {
    return
  }

  state.errorHandlers.push(entry)
  state.errorHandlers.sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0))
  installLinxInteractiveEventRouter(interactive, state)
}

function getLinxInteractiveEventRouterState(interactive: any): LinxInteractiveEventRouterState {
  if (!interactive || typeof interactive !== 'object') {
    return { installed: true, eventHandlers: [], errorHandlers: [] }
  }

  const existing = interactive[LINX_INTERACTIVE_EVENT_ROUTER]
  if (
    existing
    && typeof existing === 'object'
    && Array.isArray(existing.eventHandlers)
    && Array.isArray(existing.errorHandlers)
  ) {
    return existing as LinxInteractiveEventRouterState
  }

  const state: LinxInteractiveEventRouterState = {
    installed: false,
    eventHandlers: [],
    errorHandlers: [],
  }
  interactive[LINX_INTERACTIVE_EVENT_ROUTER] = state
  return state
}

function installLinxInteractiveEventRouter(
  interactive: any,
  state: LinxInteractiveEventRouterState,
): void {
  if (state.installed) {
    return
  }

  const originalHandleEvent = typeof interactive?.handleEvent === 'function'
    ? interactive.handleEvent.bind(interactive)
    : undefined
  const originalShowError = typeof interactive?.showError === 'function'
    ? interactive.showError.bind(interactive)
    : undefined

  if (originalHandleEvent) {
    interactive.handleEvent = async function patchedLinxInteractiveEventRouter(event: unknown, ...args: unknown[]): Promise<unknown> {
      let currentEvent = event
      for (const entry of state.eventHandlers) {
        const result = await entry.handler({
          interactive: this,
          event: currentEvent,
          args,
          originalHandleEvent,
        })
        if (result.handled) {
          return result.result
        }
        if ('event' in result) {
          currentEvent = result.event
        }
      }
      return originalHandleEvent(currentEvent, ...args)
    }
  }

  if (originalShowError) {
    interactive.showError = function patchedLinxInteractiveErrorRouter(errorMessage: unknown, ...args: unknown[]): unknown {
      let currentErrorMessage = errorMessage
      for (const entry of state.errorHandlers) {
        const result = entry.handler({
          interactive: this,
          errorMessage: currentErrorMessage,
          args,
          originalShowError,
        })
        if (result.handled) {
          return result.result
        }
        if ('errorMessage' in result) {
          currentErrorMessage = result.errorMessage
        }
      }
      return originalShowError(currentErrorMessage, ...args)
    }
  }

  state.installed = true
}
