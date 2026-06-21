import { getSecretaryAutoInputController } from './secretary-auto-input-controller.js'
import { getSessionControlManager } from './session-control.js'
import { isLinxInteractiveAutoModeEnabled } from './linx-interactive-shell-state.js'

const restoredAutoStartupInstalled = new WeakSet<object>()

export function installLinxRestoredAutoStartup(
  interactive: any,
  runtime: any,
  sessionControl = getSessionControlManager(interactive, runtime),
): void {
  if (!interactive || restoredAutoStartupInstalled.has(interactive)) {
    return
  }

  const originalInit = interactive.init?.bind(interactive)
  if (typeof originalInit !== 'function') {
    return
  }

  interactive.init = async function patchedLinxRestoredAutoInit(...args: unknown[]): Promise<unknown> {
    const result = await originalInit(...args)
    if (isLinxInteractiveAutoModeEnabled(this, runtime)) {
      const controller = getSecretaryAutoInputController(this, runtime, sessionControl)
      controller.start({ scheduleImmediately: true })
      interactive.showStatus?.([
        'Auto restored from the previous session.',
        'auto · Ctrl+C or /auto off to hand control back',
      ].join('\n'))
      interactive.ui?.requestRender?.()
    }
    return result
  }

  restoredAutoStartupInstalled.add(interactive)
}
