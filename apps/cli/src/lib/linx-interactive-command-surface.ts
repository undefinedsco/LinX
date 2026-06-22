import { installBackendCommandRouter } from './linx-backend-command-router.js'
import { installSymphonyAutocomplete } from './linx-command-autocomplete.js'
import {
  installLinxSessionCommandRouter,
  installLinxSessionCommandRouterAfterRebind,
  installLinxShellCommands,
} from './linx-interactive-command-routing.js'
import { installSymphonyCommand } from './linx-symphony-interactive-command.js'
import { installSessionControlRuntimeEventBridge, type SessionControlManager } from './session-control.js'

export interface LinxInteractiveCommandSurfaceOptions {
  sessionCwd: string
  sessionControlManager: SessionControlManager
  shellCommandOptions?: {
    onAutoControlChange?: (enabled: boolean) => void | Promise<void>
    handleAiConnectCommand?: (interactive: any, runtime: any, command: any) => Promise<void>
  }
}

export function installLinxInteractiveCommandSurface(
  interactive: any,
  runtime: any,
  options: LinxInteractiveCommandSurfaceOptions,
): void {
  runtime?.backendCommandRouter?.setSessionControl?.(options.sessionControlManager)
  installSymphonyAutocomplete(interactive)
  installLinxShellCommands(interactive, runtime, options.sessionCwd, options.shellCommandOptions)
  installSymphonyCommand(interactive)
  installBackendCommandRouter(interactive, runtime?.backendCommandRouter)
  installSessionControlRuntimeEventBridge(interactive, runtime, options.sessionCwd)
  installLinxSessionCommandRouter(interactive, runtime)
  installLinxSessionCommandRouterAfterRebind(interactive, runtime)
}
