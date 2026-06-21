import { InteractiveMode } from '@earendil-works/pi-coding-agent'
import { applyLinxInteractiveBranding, requestLinxCloudLogin } from './linx-interactive-branding.js'
import type { BackendCredentialEntry, BackendCredentialInput } from './backend-credentials.js'
import { installPodStatusOutputFilter } from './pod-status-output.js'
import {
  getSessionControlManager,
  installSessionControlRuntimeEventBridge,
} from './session-control.js'
import {
  buildLinxExitMessage,
  installLinxExitMessage,
  installLinxResumeOutputStyle,
  withLinxResumeOutputStyle,
  withSuppressedPiResumeOutput,
} from './linx-resume-output.js'
import { installInteractiveStopCleanup } from './shell-lifecycle.js'
import { installSymphonyAutocomplete } from './linx-command-autocomplete.js'
import { installLinxFooterPatch, setLinxFooterInteractive } from './linx-footer-patch.js'
import { patchPiAssistantMessageRendering } from './linx-assistant-message-rendering.js'
import { installBackendCommandRouter } from './linx-backend-command-router.js'
import { promptForBackendCredential } from './linx-ai-connect-command.js'
import { installSymphonyCommand } from './linx-symphony-interactive-command.js'
import { installLinxRestoredAutoStartup } from './linx-restored-auto-startup.js'
import { installLinxInteractivePostInitHooks, installLinxEscapeInterrupt } from './linx-interactive-post-init.js'
import { ensureInteractiveRuntimeHost } from './linx-interactive-runtime-host.js'
import { installPodBackedExtensionUi } from './linx-pod-backed-extension-ui.js'
import {
  installLinxSessionCommandRouter,
  installLinxSessionCommandRouterAfterRebind,
  installLinxShellCommands,
} from './linx-interactive-command-routing.js'

export { buildLinxExitMessage, installLinxResumeOutputStyle, withLinxResumeOutputStyle, withSuppressedPiResumeOutput }

export interface LinxInteractiveBootstrap {
  init(): Promise<void>
  run(): Promise<void>
  requestLogin(reason?: LinxLoginReason): void
  requestBackendCredential(details: BackendCredentialInput): Promise<BackendCredentialEntry | null | undefined>
  readonly __unsafeInteractiveForTests?: unknown
  stop(): void
}

/** @deprecated Use LinxInteractiveBootstrap. */
export type PiInteractiveBootstrap = LinxInteractiveBootstrap

export type LinxLoginReason = 'startup' | 'expired' | 'manual'

export interface LinxInteractiveBootstrapOptions {
  initialMessage?: string
  initialMessages?: string[]
  restoredAuto?: boolean
  onAutoControlChange?: (enabled: boolean) => void | Promise<void>
  onSymphonyControlChange?: (enabled: boolean) => void | Promise<void>
}

/** @deprecated Use LinxInteractiveBootstrapOptions. */
export type PiInteractiveBootstrapOptions = LinxInteractiveBootstrapOptions

export function bootstrapLinxInteractiveMode(
  runtime: any,
  options: LinxInteractiveBootstrapOptions = {},
): LinxInteractiveBootstrap {
  installLinxResumeOutputStyle()
  installLinxFooterPatch()
  patchPiAssistantMessageRendering()
  const sessionCwd = runtime?.cwd || process.cwd()
  ensureInteractiveRuntimeHost(runtime)
  const interactive = new InteractiveMode(runtime, options)
  ;(interactive as any).runtime = runtime
  ;(interactive as any).__autoEnabled = runtime?.autoEnabled === true
  ;(interactive as any).__linxSymphonyModeEnabled = runtime?.symphonyEnabled === true
  setLinxFooterInteractive(interactive as any)

  if (options.onSymphonyControlChange) {
    ;(interactive as any).__linxOnSymphonyControlChange = options.onSymphonyControlChange
  }
  const sessionControlManager = getSessionControlManager(interactive as any, runtime, sessionCwd)
  runtime?.backendCommandRouter?.setSessionControl?.(sessionControlManager)
  const restorePodStatusOutputFilter = installPodStatusOutputFilter()
  applyLinxInteractiveBranding(interactive as any)
  installLinxExitMessage(interactive as any)
  installInteractiveStopCleanup(interactive as any, restorePodStatusOutputFilter)
  installPodBackedExtensionUi(interactive as any, runtime, sessionControlManager)
  installSymphonyAutocomplete(interactive as any)
  // Register /cd slash command; workspace follows terminal while session stays.
  installLinxShellCommands(interactive as any, runtime, sessionCwd, options)
  installSymphonyCommand(interactive as any)
  installBackendCommandRouter(interactive as any, runtime?.backendCommandRouter)
  installSessionControlRuntimeEventBridge(interactive as any, runtime, sessionCwd)
  installLinxSessionCommandRouter(interactive as any, runtime)
  installLinxSessionCommandRouterAfterRebind(interactive as any, runtime)
  if (options.restoredAuto === true && runtime?.autoEnabled === true) {
    installLinxRestoredAutoStartup(interactive as any, runtime, sessionControlManager)
  }
  installLinxInteractivePostInitHooks(interactive as any, runtime)

  const bootstrap = {
    async init(): Promise<void> {
      await interactive.init()
    },
    async run(): Promise<void> {
      await bootstrap.init()
      await withLinxResumeOutputStyle(() => interactive.run())
    },
    requestLogin(reason: LinxLoginReason = 'manual'): void {
      requestLinxCloudLogin(interactive as any, reason)
    },
    async requestBackendCredential(details: BackendCredentialInput): Promise<BackendCredentialEntry | null | undefined> {
      return promptForBackendCredential(interactive as any, details)
    },
    __unsafeInteractiveForTests: interactive,
    stop(): void {
      interactive.stop()
    },
  }
  return bootstrap
}

/** @deprecated Use bootstrapLinxInteractiveMode. */
export const bootstrapPiInteractiveMode = bootstrapLinxInteractiveMode
