import { getSecretaryAutoInputController } from './secretary-auto-input-controller.js'
import { getSessionControlManager } from './session-control.js'

export function installLinxRestoredAutoStartup(
  interactive: any,
  runtime: any,
  sessionControl = getSessionControlManager(interactive, runtime),
): void {
  if (!interactive || interactive.__linxRestoredAutoStartupInstalled) {
    return
  }

  const originalInit = interactive.init?.bind(interactive)
  if (typeof originalInit !== 'function') {
    return
  }

  interactive.init = async function patchedLinxRestoredAutoInit(...args: unknown[]): Promise<unknown> {
    const result = await originalInit(...args)
    if (this.__autoEnabled === true && runtime?.autoEnabled === true) {
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

  interactive.__linxRestoredAutoStartupInstalled = true
}
