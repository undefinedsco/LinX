import { handleInteractiveAutoCommand } from './linx-interactive-command-routing.js'
import { installLinxEscapeInterrupt as installLinxInterruptControl } from './linx-interrupt-control.js'
import {
  installLinxFinalSubmitCommandRouter,
  installLinxInputCommandRouter,
  installLinxSessionCommandRouter,
} from './linx-interactive-command-routing.js'

export function installLinxInteractivePostInitHooks(interactive: any, runtime: any): void {
  if (!interactive || interactive.__linxInteractivePostInitHooksInstalled) {
    return
  }
  const originalInit = interactive.init?.bind(interactive)
  if (typeof originalInit !== 'function') {
    return
  }

  interactive.init = async function patchedLinxInteractivePostInit(...args: unknown[]): Promise<unknown> {
    if (this.__linxInteractiveInitCompleted === true) {
      installPostInitInteractiveControls(this, runtime)
      return undefined
    }

    const result = await originalInit(...args)
    this.__linxInteractiveInitCompleted = true
    installPostInitInteractiveControls(this, runtime)
    return result
  }
  interactive.__linxInteractivePostInitHooksInstalled = true
}

function installPostInitInteractiveControls(interactive: any, runtime: any): void {
  installLinxSessionCommandRouter(interactive, runtime)
  installLinxInputCommandRouter(interactive, runtime)
  installLinxFinalSubmitCommandRouter(interactive, runtime)
  installLinxEscapeInterrupt(interactive)
}

export function installLinxEscapeInterrupt(interactive: any): void {
  installLinxInterruptControl(interactive, {
    disableAutoMode(target) {
      void handleInteractiveAutoCommand(target, target?.runtime, false)
    },
  })
}
