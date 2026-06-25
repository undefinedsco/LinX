import { InteractiveMode } from '@earendil-works/pi-coding-agent'
import { applyLinxInteractiveBranding, requestLinxCloudLogin } from './linx-interactive-branding.js'
import type { BackendCredentialEntry, BackendCredentialInput } from './backend-credentials.js'
import { installPodStatusOutputFilter } from './pod-status-output.js'
import { getSessionControlManager } from './session-control.js'
import {
  buildLinxExitMessage,
  installLinxExitMessage,
  installLinxResumeOutputStyle,
  withLinxResumeOutputStyle,
  withSuppressedPiResumeOutput,
} from './linx-resume-output.js'
import { installInteractiveStopCleanup } from './shell-lifecycle.js'
import { installLinxFooterPatch, setLinxFooterInteractive } from './linx-footer-patch.js'
import { patchPiAssistantMessageRendering } from './linx-assistant-message-rendering.js'
import { promptForBackendCredential } from './linx-ai-connect-command.js'
import { installLinxInteractiveCommandSurface } from './linx-interactive-command-surface.js'
import { installLinxInteractivePostInitHooks, installLinxEscapeInterrupt } from './linx-interactive-post-init.js'
import { ensureInteractiveRuntimeHost, setLinxInteractiveRuntime } from './linx-interactive-runtime-host.js'
import { installPodBackedExtensionUi } from './linx-pod-backed-extension-ui.js'
import { configureLinxInteractiveShellState } from './linx-interactive-shell-state.js'

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
  setLinxInteractiveRuntime(interactive, runtime)
  configureLinxInteractiveShellState(interactive as any, {
    autoModeEnabled: runtime?.autoEnabled === true,
    symphonyModeEnabled: runtime?.symphonyEnabled === true,
    ...(options.onSymphonyControlChange ? { symphonyControlChange: options.onSymphonyControlChange } : {}),
  })
  setLinxFooterInteractive(interactive as any)

  const sessionControlManager = getSessionControlManager(interactive as any, runtime, sessionCwd)
  const restorePodStatusOutputFilter = installPodStatusOutputFilter()
  applyLinxInteractiveBranding(interactive as any)
  installLinxExitMessage(interactive as any)
  installInteractiveStopCleanup(interactive as any, restorePodStatusOutputFilter)
  installPodBackedExtensionUi(interactive as any, runtime, sessionControlManager)
  installLinxInteractiveCommandSurface(interactive as any, runtime, {
    sessionCwd,
    sessionControlManager,
    shellCommandOptions: options,
  })
  installLinxInteractivePostInitHooks(interactive as any, runtime, sessionCwd, {
    restoredAuto: options.restoredAuto === true,
    sessionControlManager,
  })

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
