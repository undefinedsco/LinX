import type { LinxShellCommand } from './linx-shell-command-router.js'
import { checkAndShowLinxUpdate } from './linx-update-notification.js'
import { handleInteractiveAiConnectCommand } from './linx-ai-connect-command.js'
import { handleInteractiveStatusLineCommand } from './linx-status-line-command.js'
import { handleInteractiveRewindSelector, handleInteractiveRewindTurnsCommand } from './linx-rewind-command.js'
import { changeInteractiveCwd } from './linx-workspace-command.js'
import { getLinxInteractiveAiConnectCommand } from './linx-interactive-shell-state.js'
import { routeLinxPeerCommand } from './linx-peer-command-routing.js'
import { routeLinxAutoCommand } from './linx-auto-command-routing.js'

export async function executeLinxShellCommand(
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
