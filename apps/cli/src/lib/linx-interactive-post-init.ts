import { handleInteractiveAutoCommand } from './linx-auto-command-routing.js'
import { startLinxRestoredAutoAfterInit } from './linx-restored-auto-startup.js'
import { scheduleLinxCwdStartupNotice } from './linx-workspace-command.js'
import { installLinxEscapeInterrupt as installLinxInterruptControl } from './linx-interrupt-control.js'
import {
  installLinxFinalSubmitCommandRouter,
  installLinxInputCommandRouter,
  installLinxSessionCommandRouter,
} from './linx-interactive-command-routing.js'

const initializedInteractives = new WeakSet<object>()
const postInitHooksInstalled = new WeakSet<object>()

export interface LinxInteractivePostInitOptions {
  restoredAuto?: boolean
  sessionControlManager?: any
}

export function installLinxInteractivePostInitHooks(
  interactive: any,
  runtime: any,
  sessionCwd: string = process.cwd(),
  options: LinxInteractivePostInitOptions = {},
): void {
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
      installPostInitInteractiveControls(this, runtime, sessionCwd, options)
      return undefined
    }

    const result = await originalInit(...args)
    initializedInteractives.add(target)
    installPostInitInteractiveControls(this, runtime, sessionCwd, options)
    return result
  }
  postInitHooksInstalled.add(interactive)
}

function resolveInteractiveInitTarget(value: unknown, fallback: object): object {
  return typeof value === 'object' && value !== null ? value : fallback
}

function installPostInitInteractiveControls(
  interactive: any,
  runtime: any,
  sessionCwd: string,
  options: LinxInteractivePostInitOptions,
): void {
  installLinxSessionCommandRouter(interactive, runtime)
  installLinxInputCommandRouter(interactive, runtime)
  installLinxFinalSubmitCommandRouter(interactive, runtime)
  installLinxEscapeInterrupt(interactive)
  if (options.restoredAuto === true) {
    startLinxRestoredAutoAfterInit(interactive, runtime, options.sessionControlManager)
  }
  scheduleLinxCwdStartupNotice(interactive, sessionCwd)
}

export function installLinxEscapeInterrupt(interactive: any): void {
  installLinxInterruptControl(interactive, {
    disableAutoMode(target) {
      void handleInteractiveAutoCommand(target, target?.runtime, false)
    },
  })
}
