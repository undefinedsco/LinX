export type LinxInteractiveAuthState<LoginReason = unknown, PendingRetry = unknown> = {
  loginInProgress: boolean
  loginOnInit: LoginReason | false | undefined
  pendingRetry: PendingRetry | undefined
  loginScheduled: boolean
  reportingError: boolean
}

const LINX_AUTH_LOGIN_IN_PROGRESS = Symbol.for('linx.tui.authLoginInProgress')
const LINX_AUTH_LOGIN_ON_INIT = Symbol.for('linx.tui.authLoginOnInit')
const LINX_AUTH_PENDING_RETRY = Symbol.for('linx.tui.authPendingRetry')
const LINX_AUTH_LOGIN_SCHEDULED = Symbol.for('linx.tui.authLoginScheduled')
const LINX_AUTH_REPORTING_ERROR = Symbol.for('linx.tui.authReportingError')

type AuthStateTarget = Record<symbol, unknown>

export function getLinxInteractiveAuthState<LoginReason = unknown, PendingRetry = unknown>(
  interactive: any,
): LinxInteractiveAuthState<LoginReason, PendingRetry> {
  const target = isAuthStateTarget(interactive) ? interactive : undefined

  return {
    get loginInProgress() {
      return Boolean(target?.[LINX_AUTH_LOGIN_IN_PROGRESS])
    },
    set loginInProgress(value: boolean) {
      setAuthStateValue(target, LINX_AUTH_LOGIN_IN_PROGRESS, value)
    },
    get loginOnInit() {
      return target?.[LINX_AUTH_LOGIN_ON_INIT] as LoginReason | false | undefined
    },
    set loginOnInit(value: LoginReason | false | undefined) {
      setAuthStateValue(target, LINX_AUTH_LOGIN_ON_INIT, value)
    },
    get pendingRetry() {
      return target?.[LINX_AUTH_PENDING_RETRY] as PendingRetry | undefined
    },
    set pendingRetry(value: PendingRetry | undefined) {
      setAuthStateValue(target, LINX_AUTH_PENDING_RETRY, value)
    },
    get loginScheduled() {
      return Boolean(target?.[LINX_AUTH_LOGIN_SCHEDULED])
    },
    set loginScheduled(value: boolean) {
      setAuthStateValue(target, LINX_AUTH_LOGIN_SCHEDULED, value)
    },
    get reportingError() {
      return Boolean(target?.[LINX_AUTH_REPORTING_ERROR])
    },
    set reportingError(value: boolean) {
      setAuthStateValue(target, LINX_AUTH_REPORTING_ERROR, value)
    },
  }
}

export function clearLinxInteractiveAuthPromptOnStart(interactive: any): void {
  for (const candidate of getLinxInteractiveAuthBridgeCandidates(interactive)) {
    const bridge = candidate?.linxAuthBridge
    if (bridge && typeof bridge === 'object') {
      bridge.shouldPromptLoginOnStart = false
    }
  }
}

function getLinxInteractiveAuthBridgeCandidates(interactive: any): any[] {
  return [
    interactive,
    interactive?.runtimeHost,
    interactive?.runtime,
    interactive?.session,
  ]
}

function isAuthStateTarget(value: unknown): value is AuthStateTarget {
  return Boolean(value && (typeof value === 'object' || typeof value === 'function'))
}

function setAuthStateValue(target: AuthStateTarget | undefined, key: symbol, value: unknown): void {
  if (!target) {
    return
  }
  target[key] = value
}
