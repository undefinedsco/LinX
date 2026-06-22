import { parseLinxShellCommand, type LinxShellCommand } from './linx-shell-command-router.js'
import { checkAndShowLinxUpdate } from './linx-update-notification.js'
import { handleInteractiveAiConnectCommand } from './linx-ai-connect-command.js'
import { handleInteractiveStatusLineCommand } from './linx-status-line-command.js'
import { handleInteractiveRewindSelector, handleInteractiveRewindTurnsCommand } from './linx-rewind-command.js'
import { changeInteractiveCwd, installLinxCwdStartupNotice } from './linx-workspace-command.js'
import { installLinxAutoEditorIndicator } from './linx-auto-editor-indicator.js'
import { getSecretaryAutoInputController } from './secretary-auto-input-controller.js'
import { getSessionControlManager } from './session-control.js'
import { registerLinxInteractiveSubmitHandler } from './linx-interactive-submit-router.js'
import {
  configureLinxInteractiveShellState,
  getLinxInteractiveAiConnectCommand,
  isLinxInteractiveAutoModeEnabled,
  notifyLinxInteractiveAutoControlChange,
  setLinxInteractiveAutoModeEnabled,
} from './linx-interactive-shell-state.js'
import {
  installLinxSessionCommandRouter as installOwnedLinxSessionCommandRouter,
  installLinxSessionCommandRouterAfterRebind as installOwnedLinxSessionCommandRouterAfterRebind,
} from './linx-session-command-routing.js'
import {
  isGlobalCommandHandlerInstalled,
  markGlobalCommandHandlerInstalled,
} from './linx-interactive-command-routing-host.js'
import {
  installLinxFinalSubmitCommandRouter as installOwnedLinxFinalSubmitCommandRouter,
  installLinxInputCommandRouter as installOwnedLinxInputCommandRouter,
} from './linx-input-command-routing.js'
import { routeLinxPeerCommand } from './linx-peer-command-routing.js'

type ShellCommandOptions = {
  onAutoControlChange?: (enabled: boolean) => void | Promise<void>
  handleAiConnectCommand?: (
    interactive: any,
    runtime: any,
    command: Extract<LinxShellCommand, { action: 'ai-connect' }>,
  ) => Promise<void>
}

export function installLinxShellCommands(
  interactive: any,
  runtime: any,
  sessionCwd: string,
  options: ShellCommandOptions = {},
): void {
  installLinxCwdStartupNotice(interactive, sessionCwd)
  installLinxAutoEditorIndicator(interactive)
  if (options.onAutoControlChange) {
    configureLinxInteractiveShellState(interactive, {
      autoControlChange: options.onAutoControlChange,
    })
  }
  if (options.handleAiConnectCommand) {
    configureLinxInteractiveShellState(interactive, {
      aiConnectCommand: options.handleAiConnectCommand,
    })
  }
  installLinxShellCommandHandler(interactive, runtime)
}

export const installLinxGlobalCommands = installLinxShellCommands

function installLinxShellCommandHandler(interactive: any, runtime: any): void {
  if (isGlobalCommandHandlerInstalled(interactive)) {
    return
  }

  registerLinxInteractiveSubmitHandler(interactive, {
    name: 'linx-shell-command',
    priority: 50,
    async handler({ interactive: target, text, input, originalSubmit }) {
      const command = parseLinxShellCommand(input)
      if (!command) {
        recordSubmittedUserMessage(target, runtime, text)
        return false
      }

      target.editor?.setText?.('')
      await handleLinxShellCommand(target, runtime, command)
      return true
    },
  })

  markGlobalCommandHandlerInstalled(interactive)
  configureLinxInteractiveShellState(interactive, {
    projectedGlobalCommand: async (text: string): Promise<boolean | 'peer-command'> => {
      const command = parseLinxShellCommand(text.trim())
      if (!command) {
        return false
      }
      await handleLinxShellCommand(interactive, runtime, command)
      if (command.action === 'peer-command') {
        return 'peer-command'
      }
      return true
    },
  })
  installProjectedCommandRouter(interactive)
}

export function installLinxInputCommandRouter(interactive: any, runtime: any): void {
  installOwnedLinxInputCommandRouter(interactive, runtime, handleLinxShellCommand)
}

export function installLinxFinalSubmitCommandRouter(interactive: any, runtime: any): void {
  installOwnedLinxFinalSubmitCommandRouter(interactive, runtime, handleLinxShellCommand)
}

export function installLinxSessionCommandRouter(interactive: any, runtime: any): void {
  installOwnedLinxSessionCommandRouter(interactive, runtime, handleLinxShellCommand)
}

export function installLinxSessionCommandRouterAfterRebind(interactive: any, runtime: any): void {
  installOwnedLinxSessionCommandRouterAfterRebind(interactive, runtime, handleLinxShellCommand)
}

function recordSubmittedUserMessage(interactive: any, runtime: any, text: string): void {
  const input = text.trim()
  if (!input || input.startsWith('/')) {
    return
  }
  try {
    getSessionControlManager(interactive, runtime).recordUserMessage({ text: input })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    interactive.showWarning?.(`Thread reconciliation unavailable: ${message}`)
  }
}

async function handleLinxShellCommand(
  interactive: any,
  runtime: any,
  command: LinxShellCommand,
): Promise<void> {
  if (command.action === 'auto') {
    const auto = command.route.auto
    const enabled = auto?.action === 'set' ? auto.enabled : undefined
    const initialInput = auto?.action === 'set' ? auto.initialInput : undefined
    await handleInteractiveAutoCommand(interactive, runtime, enabled, {
      scheduleImmediately: initialInput === undefined,
    })
    if (initialInput) {
      const controller = getSecretaryAutoInputController(
        interactive,
        runtime,
        getSessionControlManager(interactive, runtime),
      )
      await controller.submit(initialInput, { reason: 'auto-on' })
    }
    return
  }

  if (command.action === 'peer-command') {
    await routeLinxPeerCommand(interactive, runtime, command.route)
    return
  }

  if (command.action === 'ai-connect') {
    const handler = getLinxInteractiveAiConnectCommand(interactive) ?? handleInteractiveAiConnectCommand
    await handler(interactive, runtime, command)
    return
  }

  if (command.action === 'statusline') {
    await handleInteractiveStatusLineCommand(interactive, command.args)
    return
  }

  if (command.action === 'update') {
    await checkAndShowLinxUpdate(interactive, { manual: true })
    return
  }

  if (command.action === 'rewind-select') {
    await handleInteractiveRewindSelector(interactive, runtime)
    return
  }

  if (command.action === 'rewind-turns') {
    await handleInteractiveRewindTurnsCommand(interactive, runtime, command.turns)
    return
  }

  await changeInteractiveCwd(interactive, runtime, command.target)
}

export function installProjectedCommandRouter(interactive: any): void {
  configureLinxInteractiveShellState(interactive, {})
}

export async function handleInteractiveAutoCommand(
  interactive: any,
  runtime: any,
  enabled: boolean | undefined,
  options: { scheduleImmediately?: boolean } = {},
): Promise<void> {
  if (enabled === undefined) {
    const active = isLinxInteractiveAutoModeEnabled(interactive, runtime)
    interactive.showStatus?.(formatAutoModeChangeStatus(active))
    interactive.ui?.requestRender?.()
    return
  }

  const control = getSessionControlManager(interactive, runtime)
  control.setAutoEnabled(enabled)
  setLinxInteractiveAutoModeEnabled(interactive, runtime, enabled)
  const controller = getSecretaryAutoInputController(interactive, runtime, control)
  if (enabled) {
    controller.start({ scheduleImmediately: options.scheduleImmediately !== false })
  } else {
    controller.stop()
  }
  interactive.showStatus?.(formatAutoModeChangeStatus(enabled))
  interactive.ui?.requestRender?.()
  await notifyLinxInteractiveAutoControlChange(interactive, enabled)
}

function formatAutoModeChangeStatus(enabled: boolean): string {
  return enabled
    ? [
      'Auto is on.',
      'Auto on: Secretary drives the current session input loop.',
      'What changed: backend prompts and blocked approval/input requests go to Secretary first; Secretary answers in-policy and asks you only when blocked.',
      'User-visible state: the input bar shows auto; Ctrl+C or /auto off hands control back to you.',
      'Backend approval policy is unchanged.',
    ].join('\n')
    : [
      'Auto is off.',
      'Auto off: you drive the current session directly.',
      'What changed: backend prompts, approvals, and free-form input return to the local TUI unless another explicit control path handles them.',
      'Auto only controls input ownership; it does not change whether the current chat peer is Secretary or worker/backend.',
      'Use /auto on to hand control back to Secretary.',
    ].join('\n')
}
