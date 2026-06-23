export type LinxInteractiveOAuthSelectorContext = {
  interactive: any
  mode: unknown
  args: unknown[]
  originalShowOAuthSelector: (mode?: unknown, ...args: unknown[]) => Promise<unknown> | unknown
}

export type LinxInteractiveLoginDialogContext = {
  interactive: any
  providerId: unknown
  args: unknown[]
  originalShowLoginDialog: (providerId?: unknown, ...args: unknown[]) => Promise<unknown> | unknown
}

export type LinxInteractiveLoginUiHandlerResult = {
  handled: true
  result?: unknown
} | {
  handled: false
}

type LinxInteractiveOAuthSelectorHandlerEntry = {
  name: string
  priority?: number
  handler: (context: LinxInteractiveOAuthSelectorContext) => Promise<LinxInteractiveLoginUiHandlerResult> | LinxInteractiveLoginUiHandlerResult
}

type LinxInteractiveLoginDialogHandlerEntry = {
  name: string
  priority?: number
  handler: (context: LinxInteractiveLoginDialogContext) => Promise<LinxInteractiveLoginUiHandlerResult> | LinxInteractiveLoginUiHandlerResult
}

type LinxInteractiveLoginUiRouterState = {
  installed: boolean
  oauthSelectorHandlers: LinxInteractiveOAuthSelectorHandlerEntry[]
  loginDialogHandlers: LinxInteractiveLoginDialogHandlerEntry[]
}

const LINX_INTERACTIVE_LOGIN_UI_ROUTER = Symbol.for('linx.tui.loginUiRouter')

export function registerLinxInteractiveOAuthSelectorHandler(
  interactive: any,
  entry: LinxInteractiveOAuthSelectorHandlerEntry,
): void {
  const state = getLinxInteractiveLoginUiRouterState(interactive)
  if (state.oauthSelectorHandlers.some((existing) => existing.name === entry.name)) {
    return
  }

  state.oauthSelectorHandlers.push(entry)
  state.oauthSelectorHandlers.sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0))
  installLinxInteractiveLoginUiRouter(interactive, state)
}

export function registerLinxInteractiveLoginDialogHandler(
  interactive: any,
  entry: LinxInteractiveLoginDialogHandlerEntry,
): void {
  const state = getLinxInteractiveLoginUiRouterState(interactive)
  if (state.loginDialogHandlers.some((existing) => existing.name === entry.name)) {
    return
  }

  state.loginDialogHandlers.push(entry)
  state.loginDialogHandlers.sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0))
  installLinxInteractiveLoginUiRouter(interactive, state)
}

function getLinxInteractiveLoginUiRouterState(interactive: any): LinxInteractiveLoginUiRouterState {
  if (!interactive || typeof interactive !== 'object') {
    return { installed: true, oauthSelectorHandlers: [], loginDialogHandlers: [] }
  }

  const existing = interactive[LINX_INTERACTIVE_LOGIN_UI_ROUTER]
  if (
    existing
    && typeof existing === 'object'
    && Array.isArray(existing.oauthSelectorHandlers)
    && Array.isArray(existing.loginDialogHandlers)
  ) {
    return existing as LinxInteractiveLoginUiRouterState
  }

  const state: LinxInteractiveLoginUiRouterState = {
    installed: false,
    oauthSelectorHandlers: [],
    loginDialogHandlers: [],
  }
  interactive[LINX_INTERACTIVE_LOGIN_UI_ROUTER] = state
  return state
}

function installLinxInteractiveLoginUiRouter(
  interactive: any,
  state: LinxInteractiveLoginUiRouterState,
): void {
  if (state.installed) {
    return
  }

  const originalShowOAuthSelector = typeof interactive?.showOAuthSelector === 'function'
    ? interactive.showOAuthSelector.bind(interactive)
    : async () => undefined
  const originalShowLoginDialog = typeof interactive?.showLoginDialog === 'function'
    ? interactive.showLoginDialog.bind(interactive)
    : async () => undefined

  interactive.showOAuthSelector = async function patchedLinxInteractiveOAuthSelectorRouter(mode: unknown = 'login', ...args: unknown[]): Promise<unknown> {
    const context: LinxInteractiveOAuthSelectorContext = {
      interactive: this,
      mode,
      args,
      originalShowOAuthSelector,
    }
    for (const entry of state.oauthSelectorHandlers) {
      const result = await entry.handler(context)
      if (result.handled) {
        return result.result
      }
    }
    return originalShowOAuthSelector(mode, ...args)
  }

  interactive.showLoginDialog = async function patchedLinxInteractiveLoginDialogRouter(providerId?: unknown, ...args: unknown[]): Promise<unknown> {
    const context: LinxInteractiveLoginDialogContext = {
      interactive: this,
      providerId,
      args,
      originalShowLoginDialog,
    }
    for (const entry of state.loginDialogHandlers) {
      const result = await entry.handler(context)
      if (result.handled) {
        return result.result
      }
    }
    return originalShowLoginDialog(providerId, ...args)
  }

  state.installed = true
}
