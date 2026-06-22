import { handleInteractiveAutoCommand } from './linx-auto-command-routing.js'
import { scheduleLinxCwdStartupNotice } from './linx-workspace-command.js'
import { installLinxEscapeInterrupt as installLinxInterruptControl } from './linx-interrupt-control.js'
import {
  installLinxFinalSubmitCommandRouter,
  installLinxInputCommandRouter,
  installLinxSessionCommandRouter,
} from './linx-interactive-command-routing.js'

const initializedInteractives = new WeakSet<object>()
const postInitHooksInstalled = new WeakSet<object>()

export function installLinxInteractivePostInitHooks(interactive: any, runtime: any, sessionCwd: string = process.cwd()): void {
  if (!interactive || postInitHooksInstalled.has(interactive)) {
    return
  }
  const originalInit = interactive.init?.bind(interactive)
  if (typeof originalInit !== 'function') {
    return
  }

  interactive.init = async function patchedLinxInteractivePostInit(...args: unknown[]): Promise<unknown> {
    const target = resolveInteractiveInitTarget(this, interactive)
    if (initializedInteractives.has(target)) {
      installPostInitInteractiveControls(this, runtime, sessionCwd)
      return undefined
    }

    const result = await originalInit(...args)
    initializedInteractives.add(target)
    installPostInitInteractiveControls(this, runtime, sessionCwd)
    return result
  }
  postInitHooksInstalled.add(interactive)
}

function resolveInteractiveInitTarget(value: unknown, fallback: object): object {
  return typeof value === 'object' && value !== null ? value : fallback
}

function installPostInitInteractiveControls(interactive: any, runtime: any, sessionCwd: string): void {
  installLinxSessionCommandRouter(interactive, runtime)
  installLinxInputCommandRouter(interactive, runtime)
  installLinxFinalSubmitCommandRouter(interactive, runtime)
  installLinxEscapeInterrupt(interactive)
  scheduleLinxCwdStartupNotice(interactive, sessionCwd)
}

export function installLinxEscapeInterrupt(interactive: any): void {
  installLinxInterruptControl(interactive, {
    disableAutoMode(target) {
      void handleInteractiveAutoCommand(target, target?.runtime, false)
    },
  })
}
