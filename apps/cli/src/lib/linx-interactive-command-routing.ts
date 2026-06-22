import { parseLinxShellCommand, type LinxShellCommand } from './linx-shell-command-router.js'
import { installLinxCwdStartupNotice } from './linx-workspace-command.js'
import { installLinxAutoEditorIndicator } from './linx-auto-editor-indicator.js'
import { registerLinxInteractiveSubmitHandler } from './linx-interactive-submit-router.js'
import {
  configureLinxInteractiveShellState,
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
import { recordInteractiveSubmittedUserMessage } from './linx-submitted-user-message-recording.js'
import { executeLinxShellCommand } from './linx-shell-command-executor.js'

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
        recordInteractiveSubmittedUserMessage(target, runtime, text)
        return false
      }

      target.editor?.setText?.('')
      await executeLinxShellCommand(target, runtime, command)
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
      await executeLinxShellCommand(interactive, runtime, command)
      if (command.action === 'peer-command') {
        return 'peer-command'
      }
      return true
    },
  })
  installProjectedCommandRouter(interactive)
}

export function installLinxInputCommandRouter(interactive: any, runtime: any): void {
  installOwnedLinxInputCommandRouter(interactive, runtime, executeLinxShellCommand)
}

export function installLinxFinalSubmitCommandRouter(interactive: any, runtime: any): void {
  installOwnedLinxFinalSubmitCommandRouter(interactive, runtime, executeLinxShellCommand)
}

export function installLinxSessionCommandRouter(interactive: any, runtime: any): void {
  installOwnedLinxSessionCommandRouter(interactive, runtime, executeLinxShellCommand)
}

export function installLinxSessionCommandRouterAfterRebind(interactive: any, runtime: any): void {
  installOwnedLinxSessionCommandRouterAfterRebind(interactive, runtime, executeLinxShellCommand)
}

export function installProjectedCommandRouter(interactive: any): void {
  configureLinxInteractiveShellState(interactive, {})
}
