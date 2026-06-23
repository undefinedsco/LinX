import { getSecretaryAutoInputController } from './secretary-auto-input-controller.js'
import { getSessionControlManager } from './session-control.js'
import { isLinxInteractiveAutoModeEnabled } from './linx-interactive-shell-state.js'
import { showLinxInteractiveStatus } from './linx-interactive-status-display.js'

const restoredAutoStartupInstalled = new WeakSet<object>()

export function startLinxRestoredAutoAfterInit(
  interactive: any,
  runtime: any,
  sessionControl = getSessionControlManager(interactive, runtime),
): void {
  if (!interactive || restoredAutoStartupInstalled.has(interactive)) {
    return
  }

  if (!isLinxInteractiveAutoModeEnabled(interactive, runtime)) {
    return
  }

  restoredAutoStartupInstalled.add(interactive)

  const controller = getSecretaryAutoInputController(interactive, runtime, sessionControl)
  controller.start({ scheduleImmediately: true })
  showLinxInteractiveStatus(interactive, [
    'Auto restored from the previous session.',
    'auto · Ctrl+C or /auto off to hand control back',
  ].join('\n'))
}
