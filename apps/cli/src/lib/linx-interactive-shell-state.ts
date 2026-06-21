type ShellControlChangeHandler = (enabled: boolean) => void | Promise<void>
type ProjectedCommandResult = boolean | 'peer-command'
type ProjectedCommandHandler = (text: string) => ProjectedCommandResult | Promise<ProjectedCommandResult>
type AiConnectCommandHandler = (interactive: any, runtime: any, command: any) => void | Promise<void>

export type LinxInteractiveSymphonyState = {
  podProjectionRuntime?: any
  workerBackend?: unknown
  workerCredentialSource?: unknown
  agentRuntime?: unknown
  agentRuntimeConfig?: unknown
  workerModel?: unknown
  workerSupervisorIntervalMs?: unknown
  statusPodTimeoutMs?: unknown
  runSymphony?: (...args: any[]) => any
  listSymphonyIssues?: () => any
  listSymphonySessions?: () => any
  dispatches?: Promise<unknown>[]
  dispatchControllers?: Set<AbortController>
}

export type LinxInteractiveShellState = {
  autoControlChange?: ShellControlChangeHandler
  autoModeEnabled: boolean
  autoInputController?: unknown
  symphonyControlChange?: ShellControlChangeHandler
  symphonyModeEnabled: boolean
  symphonyModeGeneration: number
  goalModeEnabled: boolean
  goalModeSupervisorIntervalMs?: unknown
  goalModeSupervisorLastAt?: number
  aiConnectCommand?: AiConnectCommandHandler
  projectedGlobalCommand?: ProjectedCommandHandler
  projectedBackendCommand?: ProjectedCommandHandler
  symphony: LinxInteractiveSymphonyState
}

const LINX_INTERACTIVE_SHELL_STATE = Symbol.for('linx.tui.shellState')

export function getLinxInteractiveShellState(interactive: any): LinxInteractiveShellState {
  if (!interactive || typeof interactive !== 'object') {
    return createDefaultShellState()
  }

  const existing = interactive[LINX_INTERACTIVE_SHELL_STATE]
  if (existing && typeof existing === 'object') {
    return existing as LinxInteractiveShellState
  }

  const state = createDefaultShellState()
  interactive[LINX_INTERACTIVE_SHELL_STATE] = state
  return state
}

export function configureLinxInteractiveShellState(
  interactive: any,
  options: {
    autoControlChange?: ShellControlChangeHandler
    autoModeEnabled?: boolean
    autoInputController?: unknown
    symphonyControlChange?: ShellControlChangeHandler
    symphonyModeEnabled?: boolean
    goalModeEnabled?: boolean
    goalModeSupervisorIntervalMs?: unknown
    aiConnectCommand?: AiConnectCommandHandler
    projectedGlobalCommand?: ProjectedCommandHandler
    projectedBackendCommand?: ProjectedCommandHandler
    symphony?: Partial<LinxInteractiveSymphonyState>
  },
): LinxInteractiveShellState {
  const state = getLinxInteractiveShellState(interactive)
  if (options.autoControlChange) {
    state.autoControlChange = options.autoControlChange
  }
  if (options.autoModeEnabled !== undefined) {
    state.autoModeEnabled = options.autoModeEnabled
  }
  if (options.autoInputController !== undefined) {
    state.autoInputController = options.autoInputController
  }
  if (options.symphonyControlChange) {
    state.symphonyControlChange = options.symphonyControlChange
  }
  if (options.symphonyModeEnabled !== undefined) {
    state.symphonyModeEnabled = options.symphonyModeEnabled
  }
  if (options.goalModeEnabled !== undefined) {
    state.goalModeEnabled = options.goalModeEnabled
  }
  if (options.goalModeSupervisorIntervalMs !== undefined) {
    state.goalModeSupervisorIntervalMs = options.goalModeSupervisorIntervalMs
  }
  if (options.aiConnectCommand) {
    state.aiConnectCommand = options.aiConnectCommand
  }
  if (options.projectedGlobalCommand) {
    state.projectedGlobalCommand = options.projectedGlobalCommand
  }
  if (options.projectedBackendCommand) {
    state.projectedBackendCommand = options.projectedBackendCommand
  }
  if (options.symphony) {
    Object.assign(state.symphony, options.symphony)
  }
  return state
}

export function configureLinxInteractiveSymphonyState(
  interactive: any,
  options: Partial<LinxInteractiveSymphonyState>,
): LinxInteractiveSymphonyState {
  const state = getLinxInteractiveShellState(interactive).symphony
  Object.assign(state, options)
  return state
}

export function getLinxInteractiveSymphonyState(interactive: any): LinxInteractiveSymphonyState {
  return getLinxInteractiveShellState(interactive).symphony
}

export function getLinxInteractiveSymphonyDispatches(interactive: any): Promise<unknown>[] {
  const state = getLinxInteractiveSymphonyState(interactive)
  if (!Array.isArray(state.dispatches)) {
    state.dispatches = []
  }
  return state.dispatches
}

export function getLinxInteractiveSymphonyDispatchControllers(interactive: any): Set<AbortController> {
  const state = getLinxInteractiveSymphonyState(interactive)
  if (!(state.dispatchControllers instanceof Set)) {
    state.dispatchControllers = new Set<AbortController>()
  }
  return state.dispatchControllers
}

export function getLinxInteractiveSymphonyPodProjectionRuntime(interactive: any): any {
  return getLinxInteractiveSymphonyState(interactive).podProjectionRuntime
}

export function getLinxInteractiveSymphonyWorkerBackend(interactive: any): unknown {
  return getLinxInteractiveSymphonyState(interactive).workerBackend
}

export function getLinxInteractiveSymphonyWorkerCredentialSource(interactive: any): unknown {
  return getLinxInteractiveSymphonyState(interactive).workerCredentialSource
}

export function getLinxInteractiveSymphonyAgentRuntime(interactive: any): unknown {
  return getLinxInteractiveSymphonyState(interactive).agentRuntime
}

export function getLinxInteractiveSymphonyAgentRuntimeConfig(interactive: any): unknown {
  return getLinxInteractiveSymphonyState(interactive).agentRuntimeConfig
}

export function getLinxInteractiveSymphonyWorkerModel(interactive: any): unknown {
  return getLinxInteractiveSymphonyState(interactive).workerModel
}

export function getLinxInteractiveSymphonyWorkerSupervisorIntervalMs(interactive: any): unknown {
  return getLinxInteractiveSymphonyState(interactive).workerSupervisorIntervalMs
}

export function getLinxInteractiveSymphonyStatusPodTimeoutMs(interactive: any): unknown {
  return getLinxInteractiveSymphonyState(interactive).statusPodTimeoutMs
}

export function getLinxInteractiveRunSymphony(interactive: any): ((...args: any[]) => any) | undefined {
  return getLinxInteractiveSymphonyState(interactive).runSymphony
}

export function getLinxInteractiveListSymphonyIssues(interactive: any): (() => any) | undefined {
  return getLinxInteractiveSymphonyState(interactive).listSymphonyIssues
}

export function getLinxInteractiveListSymphonySessions(interactive: any): (() => any) | undefined {
  return getLinxInteractiveSymphonyState(interactive).listSymphonySessions
}

export function getLinxInteractiveAiConnectCommand(interactive: any): AiConnectCommandHandler | undefined {
  return getLinxInteractiveShellState(interactive).aiConnectCommand
}

export function isLinxInteractiveAutoModeEnabled(interactive: any, runtime?: any): boolean {
  return getLinxInteractiveShellState(interactive).autoModeEnabled === true || runtime?.autoEnabled === true
}

export function setLinxInteractiveAutoModeEnabled(interactive: any, runtime: any, enabled: boolean): void {
  getLinxInteractiveShellState(interactive).autoModeEnabled = enabled
  if (runtime && typeof runtime === 'object') {
    runtime.autoEnabled = enabled
  }
}

export function getLinxInteractiveAutoInputController<T = unknown>(interactive: any): T | undefined {
  return getLinxInteractiveShellState(interactive).autoInputController as T | undefined
}

export function setLinxInteractiveAutoInputController<T = unknown>(interactive: any, controller: T): T {
  getLinxInteractiveShellState(interactive).autoInputController = controller
  return controller
}

export function getLinxInteractiveGoalModeSupervisorIntervalMs(interactive: any): unknown {
  return getLinxInteractiveShellState(interactive).goalModeSupervisorIntervalMs
}

export async function handleLinxInteractiveProjectedCommand(
  interactive: any,
  text: string,
): Promise<ProjectedCommandResult> {
  const command = String(text ?? '').trim()
  if (!command.startsWith('/')) {
    return false
  }

  const state = getLinxInteractiveShellState(interactive)
  if (state.projectedGlobalCommand) {
    const handled = await state.projectedGlobalCommand(command)
    if (handled === 'peer-command') {
      return 'peer-command'
    }
    if (handled === true) {
      return true
    }
  }

  if (state.projectedBackendCommand) {
    const handled = await state.projectedBackendCommand(command)
    if (handled === true) {
      return true
    }
  }

  return false
}

export function isLinxInteractiveSymphonyModeEnabled(interactive: any): boolean {
  return getLinxInteractiveShellState(interactive).symphonyModeEnabled === true
}

export function setLinxInteractiveSymphonyModeEnabled(interactive: any, runtime: any, enabled: boolean): number {
  const state = getLinxInteractiveShellState(interactive)
  state.symphonyModeEnabled = enabled
  state.symphonyModeGeneration += 1
  if (runtime && typeof runtime === 'object') {
    runtime.symphonyEnabled = enabled
  }
  return state.symphonyModeGeneration
}

export function getLinxInteractiveSymphonyModeGeneration(interactive: any): number {
  return getLinxInteractiveShellState(interactive).symphonyModeGeneration
}

export async function notifyLinxInteractiveSymphonyControlChange(interactive: any, enabled: boolean): Promise<void> {
  await getLinxInteractiveShellState(interactive).symphonyControlChange?.(enabled)
}

export async function notifyLinxInteractiveAutoControlChange(interactive: any, enabled: boolean): Promise<void> {
  await getLinxInteractiveShellState(interactive).autoControlChange?.(enabled)
}

export function isLinxInteractiveGoalModeEnabled(interactive: any, runtime?: any): boolean {
  return getLinxInteractiveShellState(interactive).goalModeEnabled === true || runtime?.goalMode === true
}

export function setLinxInteractiveGoalModeEnabled(interactive: any, runtime: any, enabled: boolean, now = Date.now()): void {
  const state = getLinxInteractiveShellState(interactive)
  state.goalModeEnabled = enabled
  if (enabled) {
    state.goalModeSupervisorLastAt = now
  } else {
    delete state.goalModeSupervisorLastAt
  }
  if (runtime && typeof runtime === 'object') {
    runtime.goalMode = enabled
    if (enabled) {
      runtime.goalModeSupervisorLastAt = state.goalModeSupervisorLastAt
    } else {
      delete runtime.goalModeSupervisorLastAt
    }
  }
}

export function getLinxInteractiveGoalModeSupervisorLastAt(interactive: any, runtime?: any): number {
  const stateValue = getLinxInteractiveShellState(interactive).goalModeSupervisorLastAt
  const value = Number(stateValue ?? runtime?.goalModeSupervisorLastAt)
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function setLinxInteractiveGoalModeSupervisorLastAt(interactive: any, runtime: any, at = Date.now()): void {
  const state = getLinxInteractiveShellState(interactive)
  state.goalModeSupervisorLastAt = at
  if (runtime && typeof runtime === 'object') {
    runtime.goalModeSupervisorLastAt = at
  }
}

function createDefaultShellState(): LinxInteractiveShellState {
  return {
    autoModeEnabled: false,
    symphonyModeEnabled: false,
    symphonyModeGeneration: 0,
    goalModeEnabled: false,
    symphony: {},
  }
}
