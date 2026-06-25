import type { AutoModePeerCommandRoute } from '@linx/agent-runtime/auto-mode'
import { setLinxInteractiveGoalModeEnabled } from './linx-interactive-shell-state.js'
import { showLinxInteractiveStatus } from './linx-interactive-status-display.js'
import { submitLinxInteractiveSessionUserInputBypassingCommandRouter } from './linx-session-work-control.js'

export async function routeLinxPeerCommand(
  interactive: any,
  runtime: any,
  route: AutoModePeerCommandRoute,
): Promise<void> {
  const goalMode = route.secretaryBehavior?.goalMode
  const message = goalMode !== undefined
    ? `Peer command routed; Secretary goal supervision mirror is ${goalMode ? 'active' : 'paused'}.`
    : 'Peer command routed to current chat peer.'
  if (goalMode !== undefined) {
    setLinxInteractiveGoalModeEnabled(interactive, runtime, goalMode)
  }
  await submitPeerCommandToBackend(interactive, route.text)
  showLinxInteractiveStatus(interactive, message)
}

async function submitPeerCommandToBackend(interactive: any, text: string): Promise<void> {
  await submitLinxInteractiveSessionUserInputBypassingCommandRouter(interactive, text, {
    unavailableMessage: 'Active LinX session cannot accept peer goal input',
  })
}
