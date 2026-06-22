import { parseLinxShellCommand, type LinxShellCommand } from './linx-shell-command-router.js'
import { checkAndShowLinxUpdate } from './linx-update-notification.js'
import { handleInteractiveAiConnectCommand } from './linx-ai-connect-command.js'
import { handleInteractiveStatusLineCommand } from './linx-status-line-command.js'
import { handleInteractiveRewindSelector, handleInteractiveRewindTurnsCommand } from './linx-rewind-command.js'
import { changeInteractiveCwd, installLinxCwdStartupNotice } from './linx-workspace-command.js'
import { installLinxAutoEditorIndicator } from './linx-auto-editor-indicator.js'
import { getSessionControlManager } from './session-control.js'
import { registerLinxInteractiveSubmitHandler } from './linx-interactive-submit-router.js'
import {
  configureLinxInteractiveShellState,
  getLinxInteractiveAiConnectCommand,
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
import { routeLinxAutoCommand } from './linx-auto-command-routing.js'

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
    await routeLinxAutoCommand(interactive, runtime, command.route)
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
