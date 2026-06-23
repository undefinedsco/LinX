import type { AutoModePeerCommandRoute } from '@linx/agent-runtime/auto-mode'
import { setLinxInteractiveGoalModeEnabled } from './linx-interactive-shell-state.js'
import {
  getSessionCommandRouterOriginalPrompt,
  getSessionCommandRouterOriginalSendUserMessage,
} from './linx-session-command-routing-host.js'
import { submitLinxSessionUserInput } from './linx-session-work-control.js'

export async function routeLinxPeerCommand(
  interactive: any,
  runtime: any,
  route: AutoModePeerCommandRoute,
): Promise<void> {
  const goalMode = route.secretaryBehavior?.goalMode
  if (goalMode !== undefined) {
    setLinxInteractiveGoalModeEnabled(interactive, runtime, goalMode)
    interactive.showStatus?.(`Peer command routed; Secretary goal supervision mirror is ${goalMode ? 'active' : 'paused'}.`)
  } else {
    interactive.showStatus?.('Peer command routed to current chat peer.')
  }
  await submitPeerCommandToBackend(interactive, route.text)
  interactive.ui?.requestRender?.()
}

async function submitPeerCommandToBackend(interactive: any, text: string): Promise<void> {
  const session = interactive?.session
  await submitLinxSessionUserInput(session, text, {
    sendUserMessage: getSessionCommandRouterOriginalSendUserMessage(session),
    prompt: getSessionCommandRouterOriginalPrompt(session),
    unavailableMessage: 'Active LinX session cannot accept peer goal input',
  })
}
