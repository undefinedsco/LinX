type ShellControlChangeHandler = (enabled: boolean) => void | Promise<void>
type ProjectedCommandResult = boolean | 'peer-command'
type ProjectedCommandHandler = (text: string) => ProjectedCommandResult | Promise<ProjectedCommandResult>
type AiConnectCommandHandler = (interactive: any, runtime: any, command: any) => void | Promise<void>

export type LinxInteractiveShellState = {
  autoControlChange?: ShellControlChangeHandler
  symphonyControlChange?: ShellControlChangeHandler
  symphonyModeEnabled: boolean
  symphonyModeGeneration: number
  goalModeEnabled: boolean
  goalModeSupervisorLastAt?: number
  aiConnectCommand?: AiConnectCommandHandler
  projectedGlobalCommand?: ProjectedCommandHandler
  projectedBackendCommand?: ProjectedCommandHandler
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
    symphonyControlChange?: ShellControlChangeHandler
    symphonyModeEnabled?: boolean
    goalModeEnabled?: boolean
    aiConnectCommand?: AiConnectCommandHandler
    projectedGlobalCommand?: ProjectedCommandHandler
    projectedBackendCommand?: ProjectedCommandHandler
  },
): LinxInteractiveShellState {
  const state = getLinxInteractiveShellState(interactive)
  if (options.autoControlChange) {
    state.autoControlChange = options.autoControlChange
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
  if (options.aiConnectCommand) {
    state.aiConnectCommand = options.aiConnectCommand
  }
  if (options.projectedGlobalCommand) {
    state.projectedGlobalCommand = options.projectedGlobalCommand
  }
  if (options.projectedBackendCommand) {
    state.projectedBackendCommand = options.projectedBackendCommand
  }
  return state
}


export function getLinxInteractiveAiConnectCommand(interactive: any): AiConnectCommandHandler | undefined {
  return getLinxInteractiveShellState(interactive).aiConnectCommand
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
    symphonyModeEnabled: false,
    symphonyModeGeneration: 0,
    goalModeEnabled: false,
  }
}
