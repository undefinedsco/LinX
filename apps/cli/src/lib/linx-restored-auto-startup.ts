import { getSecretaryAutoInputController } from './secretary-auto-input-controller.js'
import { getSessionControlManager } from './session-control.js'
import { isLinxInteractiveAutoModeEnabled } from './linx-interactive-shell-state.js'

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
  interactive.showStatus?.([
    'Auto restored from the previous session.',
    'auto · Ctrl+C or /auto off to hand control back',
  ].join('\n'))
  interactive.ui?.requestRender?.()
}
