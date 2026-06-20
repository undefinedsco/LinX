import { InteractiveMode } from '@earendil-works/pi-coding-agent'
import { applyLinxInteractiveBranding, requestLinxCloudLogin } from './branding.js'
import type { BackendCredentialEntry, BackendCredentialInput } from './backend-credentials.js'
import type { BackendCommandRouter } from './backend-command.js'
import { installPodStatusOutputFilter } from './pod-status-output.js'
import { createPodBackedExtensionUiContext } from './pod-approval.js'
import { getSecretaryAutoInputController } from './auto-input-controller.js'
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
} from '../linx-resume-output.js'
import { installLinxEscapeInterrupt as installLinxInterruptControl } from '../linx-interrupt-control.js'
import { installSymphonyAutocomplete } from '../linx-command-autocomplete.js'
import { installLinxFooterPatch, setLinxFooterInteractive } from '../linx-footer-patch.js'
import { patchPiAssistantMessageRendering } from '../linx-assistant-message-rendering.js'
import { installBackendCommandRouter as installBackendCommandRouterWithProjection } from '../linx-backend-command-router.js'
import { promptForBackendCredential } from '../linx-ai-connect-command.js'
import { installSymphonyCommand } from '../linx-symphony-interactive-command.js'
import {
  handleInteractiveAutoCommand,
  installLinxFinalSubmitCommandRouter,
  installLinxInputCommandRouter,
  installLinxSessionCommandRouter,
  installLinxSessionCommandRouterAfterRebind,
  installLinxShellCommands,
  installProjectedCommandRouter,
} from '../linx-interactive-command-routing.js'
export { buildLinxExitMessage, installLinxResumeOutputStyle, withLinxResumeOutputStyle, withSuppressedPiResumeOutput }
export { buildLinxAutoEditorIndicatorLine, installLinxAutoEditorIndicator } from '../linx-auto-editor-indicator.js'
export { installLinxCommandAutocomplete, installSymphonyAutocomplete } from '../linx-command-autocomplete.js'
export { installLinxFooterPatch, setLinxFooterInteractive, buildLinxFooterModePrefix } from '../linx-footer-patch.js'
export { changeInteractiveCwd, installLinxCwdStartupNotice, resolveInteractiveCwd, setRuntimeCwd } from '../linx-workspace-command.js'
export { patchPiAssistantMessageRendering } from '../linx-assistant-message-rendering.js'
export { installSymphonyCommand } from '../linx-symphony-interactive-command.js'
export {
  installLinxFinalSubmitCommandRouter,
  installLinxGlobalCommands,
  installLinxInputCommandRouter,
  installLinxSessionCommandRouter,
  installLinxShellCommands,
  installProjectedCommandRouter,
} from '../linx-interactive-command-routing.js'


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
  patchInteractivePodStatusFilterCleanup(interactive as any, restorePodStatusOutputFilter)
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

function installLinxInteractivePostInitHooks(interactive: any, runtime: any): void {
  if (!interactive || interactive.__linxInteractivePostInitHooksInstalled) {
    return
  }
  const originalInit = interactive.init?.bind(interactive)
  if (typeof originalInit !== 'function') {
    return
  }

  interactive.init = async function patchedLinxInteractivePostInit(...args: unknown[]): Promise<unknown> {
    if (this.__linxInteractiveInitCompleted === true) {
      installLinxSessionCommandRouter(this, runtime)
      installLinxInputCommandRouter(this, runtime)
      installLinxFinalSubmitCommandRouter(this, runtime)
      installLinxEscapeInterrupt(this)
      return undefined
    }

    const result = await originalInit(...args)
    this.__linxInteractiveInitCompleted = true
    installLinxSessionCommandRouter(this, runtime)
    installLinxInputCommandRouter(this, runtime)
    installLinxFinalSubmitCommandRouter(this, runtime)
    installLinxEscapeInterrupt(this)
    return result
  }
  interactive.__linxInteractivePostInitHooksInstalled = true
}

/** @deprecated Use bootstrapLinxInteractiveMode. */
export const bootstrapPiInteractiveMode = bootstrapLinxInteractiveMode

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

function ensureInteractiveRuntimeHost(runtime: any): void {
  if (!runtime || typeof runtime !== 'object') {
    return
  }

  if (typeof runtime.setBeforeSessionInvalidate !== 'function') {
    runtime.setBeforeSessionInvalidate = (callback?: () => void): void => {
      runtime.__linxBeforeSessionInvalidate = callback
    }
  }

  if (typeof runtime.setRebindSession !== 'function') {
    runtime.setRebindSession = (callback?: (session: unknown) => Promise<void>): void => {
      runtime.__linxRebindSession = callback
    }
  }
}

function patchInteractivePodStatusFilterCleanup(interactive: any, restore: () => void): void {
  const originalStop = interactive.stop?.bind(interactive)
  if (typeof originalStop !== 'function') {
    return
  }

  interactive.stop = function patchedStopWithPodStatusCleanup(...args: unknown[]): void {
    try {
      originalStop(...args)
    } finally {
      restore()
    }
  }
}

export function installPodBackedExtensionUi(interactive: any, runtime: any, sessionControl = getSessionControlManager(interactive, runtime)): void {
  if (interactive.__linxPodBackedExtensionUiInstalled) {
    return
  }

  const originalCreate = interactive.createExtensionUIContext?.bind(interactive)
  if (typeof originalCreate !== 'function') {
    return
  }

  interactive.createExtensionUIContext = function patchedCreateExtensionUIContext(...args: unknown[]): unknown {
    const baseUi = originalCreate(...args)
    if (!baseUi || typeof baseUi !== 'object') {
      return baseUi
    }

    return createPodBackedExtensionUiContext(baseUi, {
      cwd: interactive?.session?.cwd ?? runtime?.cwd ?? process.cwd(),
      sessionId: () => interactive?.sessionManager?.getSessionId?.()
        ?? interactive?.session?.sessionManager?.getSessionId?.()
        ?? interactive?.session?.sessionId,
      sessionControl,
      onWarning(error) {
        const message = error instanceof Error ? error.message : String(error)
        interactive.showWarning?.(`Pod approval sync unavailable: ${message}`)
      },
    })
  }

  interactive.__linxPodBackedExtensionUiInstalled = true
}

export function installBackendCommandRouter(interactive: any, router: BackendCommandRouter | undefined): void {
  installBackendCommandRouterWithProjection(interactive, router, {
    installProjectedCommandRouter,
  })
}

export function installLinxEscapeInterrupt(interactive: any): void {
  installLinxInterruptControl(interactive, {
    disableAutoMode(target) {
      void handleInteractiveAutoCommand(target, target?.runtime, false)
    },
  })
}
