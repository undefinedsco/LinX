export type LinxInteractiveVersionCheckContext = {
  interactive: any
  args: unknown[]
  originalCheckForNewVersion: () => Promise<string | undefined>
}

export type LinxInteractiveVersionCheckResult = {
  handled: true
  version?: string
} | {
  handled: false
}

export type LinxInteractiveUpdateNotificationContext = {
  interactive: any
  newVersion: unknown
  args: unknown[]
}

type LinxInteractiveVersionCheckHandlerEntry = {
  name: string
  priority?: number
  handler: (context: LinxInteractiveVersionCheckContext) => Promise<LinxInteractiveVersionCheckResult> | LinxInteractiveVersionCheckResult
}

type LinxInteractiveUpdateNotificationHandlerEntry = {
  name: string
  priority?: number
  handler: (context: LinxInteractiveUpdateNotificationContext) => boolean | void
}

type LinxInteractiveUpdateRouterState = {
  installed: boolean
  checkHandlers: LinxInteractiveVersionCheckHandlerEntry[]
  notificationHandlers: LinxInteractiveUpdateNotificationHandlerEntry[]
}

const LINX_INTERACTIVE_UPDATE_ROUTER = Symbol.for('linx.tui.updateRouter')

export function registerLinxInteractiveVersionCheckHandler(
  interactive: any,
  entry: LinxInteractiveVersionCheckHandlerEntry,
): void {
  const state = getLinxInteractiveUpdateRouterState(interactive)
  if (state.checkHandlers.some((existing) => existing.name === entry.name)) {
    return
  }

  state.checkHandlers.push(entry)
  state.checkHandlers.sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0))
  installLinxInteractiveUpdateRouter(interactive, state)
}

export function registerLinxInteractiveUpdateNotificationHandler(
  interactive: any,
  entry: LinxInteractiveUpdateNotificationHandlerEntry,
): void {
  const state = getLinxInteractiveUpdateRouterState(interactive)
  if (state.notificationHandlers.some((existing) => existing.name === entry.name)) {
    return
  }

  state.notificationHandlers.push(entry)
  state.notificationHandlers.sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0))
  installLinxInteractiveUpdateRouter(interactive, state)
}

function getLinxInteractiveUpdateRouterState(interactive: any): LinxInteractiveUpdateRouterState {
  if (!interactive || typeof interactive !== 'object') {
    return { installed: true, checkHandlers: [], notificationHandlers: [] }
  }

  const existing = interactive[LINX_INTERACTIVE_UPDATE_ROUTER]
  if (
    existing
    && typeof existing === 'object'
    && Array.isArray(existing.checkHandlers)
    && Array.isArray(existing.notificationHandlers)
  ) {
    return existing as LinxInteractiveUpdateRouterState
  }

  const state: LinxInteractiveUpdateRouterState = {
    installed: false,
    checkHandlers: [],
    notificationHandlers: [],
  }
  interactive[LINX_INTERACTIVE_UPDATE_ROUTER] = state
  return state
}

function installLinxInteractiveUpdateRouter(
  interactive: any,
  state: LinxInteractiveUpdateRouterState,
): void {
  if (state.installed) {
    return
  }

  const originalCheckForNewVersion = typeof interactive?.checkForNewVersion === 'function'
    ? interactive.checkForNewVersion.bind(interactive)
    : async () => undefined
  const originalShowNewVersionNotification = typeof interactive?.showNewVersionNotification === 'function'
    ? interactive.showNewVersionNotification.bind(interactive)
    : undefined

  interactive.checkForNewVersion = async function patchedLinxInteractiveVersionCheckRouter(...args: unknown[]): Promise<string | undefined> {
    const context: LinxInteractiveVersionCheckContext = {
      interactive: this,
      args,
      originalCheckForNewVersion,
    }
    for (const entry of state.checkHandlers) {
      const result = await entry.handler(context)
      if (result.handled) {
        return result.version
      }
    }
    return originalCheckForNewVersion(...args)
  }

  interactive.showNewVersionNotification = function patchedLinxInteractiveUpdateNotificationRouter(newVersion: unknown, ...args: unknown[]): unknown {
    const context: LinxInteractiveUpdateNotificationContext = {
      interactive: this,
      newVersion,
      args,
    }
    for (const entry of state.notificationHandlers) {
      if (entry.handler(context) === true) {
        return undefined
      }
    }
    return originalShowNewVersionNotification?.(newVersion, ...args)
  }

  state.installed = true
}
