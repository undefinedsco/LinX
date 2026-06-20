import { InteractiveMode } from '@earendil-works/pi-coding-agent'
import { AssistantMessageComponent, LoginDialogComponent } from '@earendil-works/pi-coding-agent'
import { connectAiProviderCredential } from '../ai-command.js'
import { listArchivedAutoModeSessions, runAutoMode } from '../auto-mode/runner.js'
import type { AutoModeCredentialSource, AutoModeWorkerBackend } from '../auto-mode/types.js'
import type { AgentRuntimeBackendConfig } from '@linx/agent-runtime'
import { getAIConfigProviderMetadata } from '../models.js'
import { runSymphony, type SymphonyRuntime } from '../symphony-command.js'
import { applyLinxInteractiveBranding, checkAndShowLinxUpdate, requestLinxCloudLogin } from './branding.js'
import { parseLinxShellCommand, shouldRouteToBackendCommand, type LinxShellCommand } from '../linx-shell-command-router.js'
import type { AutoModePeerCommandRoute } from '@linx/agent-runtime/auto-mode'
import type { BackendCredentialEntry, BackendCredentialInput, BackendCredentialRepairReason } from './backend-credentials.js'
import type { BackendCommandRouter } from './backend-command.js'
import { installPodStatusOutputFilter } from './pod-status-output.js'
import { createPodBackedExtensionUiContext } from './pod-approval.js'
import { DEFAULT_SECRETARY_CHAT_ID, secretaryChatUri, secretaryThreadUri } from './pod-mirror-mapping.js'
import { getSecretaryAutoInputController } from './auto-input-controller.js'
import {
  createSymphonyIdeaRecord,
  listSymphonyIssues,
  listSymphonySessions,
  type CaptureSymphonyIdeaInput,
} from '../symphony/archive.js'
import {
  listOpenSymphonyIssuesFromPod,
  listRecentSymphonyReportsFromPod,
  listRunningSymphonyWorkersFromPod,
  mirrorSymphonyProjectionJsonLdFromPod,
  persistSymphonyIdeaToPod,
  persistSymphonyControlStateToPod,
  type SymphonyPodReportStatus,
  type SymphonyPodWorkerStatus,
} from '../symphony/pod-projection.js'
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
import { handleInteractiveStatusLineCommand } from '../linx-status-line-command.js'
import { handleInteractiveRewindSelector, handleInteractiveRewindTurnsCommand } from '../linx-rewind-command.js'
import { installLinxEscapeInterrupt as installLinxInterruptControl } from '../linx-interrupt-control.js'
import { installLinxAutoEditorIndicator } from '../linx-auto-editor-indicator.js'
import { installSymphonyAutocomplete } from '../linx-command-autocomplete.js'
import { installLinxFooterPatch, setLinxFooterInteractive } from '../linx-footer-patch.js'
import { changeInteractiveCwd, installLinxCwdStartupNotice, resolveInteractiveCwd } from '../linx-workspace-command.js'
export { buildLinxExitMessage, installLinxResumeOutputStyle, withLinxResumeOutputStyle, withSuppressedPiResumeOutput }
export { buildLinxAutoEditorIndicatorLine, installLinxAutoEditorIndicator } from '../linx-auto-editor-indicator.js'
export { installLinxCommandAutocomplete, installSymphonyAutocomplete } from '../linx-command-autocomplete.js'
export { installLinxFooterPatch, setLinxFooterInteractive, buildLinxFooterModePrefix } from '../linx-footer-patch.js'
export { changeInteractiveCwd, installLinxCwdStartupNotice, resolveInteractiveCwd, setRuntimeCwd } from '../linx-workspace-command.js'


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

let assistantMessagePatched = false
const SYMPHONY_STATUS_POD_TIMEOUT_MS = 1_200
const DEFAULT_SYMPHONY_WORKER_SUPERVISOR_INTERVAL_MS = 10 * 60 * 1000
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
  if (!router) {
    return
  }

  interactive.__linxHandleProjectedBackendCommand = async (text: string): Promise<boolean> => {
    const command = text.trim()
    if (!shouldRouteToBackendCommand(command)) {
      return false
    }

    let routed
    try {
      routed = await router.execute(command)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      interactive.showError?.(`${router.backend} command failed: ${message}`)
      return true
    }

    if (!routed.handled) {
      return false
    }

    if (routed.message) {
      interactive.showStatus?.(routed.message)
    }
    interactive.ui?.requestRender?.()
    return true
  }
  installProjectedCommandRouter(interactive)

  const originalSetup = interactive.setupEditorSubmitHandler?.bind(interactive)
  if (typeof originalSetup !== 'function') {
    return
  }

  interactive.setupEditorSubmitHandler = function patchedBackendCommandSetupEditorSubmitHandler(...args: unknown[]): unknown {
    const result = originalSetup(...args)
    const originalSubmit = this.defaultEditor?.onSubmit?.bind(this.defaultEditor)
    if (typeof originalSubmit !== 'function') {
      return result
    }

    this.defaultEditor.onSubmit = async (text: string): Promise<void> => {
      const command = text.trim()
      if (!shouldRouteToBackendCommand(command)) {
        await originalSubmit(text)
        return
      }

      let routed
      try {
        routed = await router.execute(command)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.showError?.(`${router.backend} command failed: ${message}`)
        return
      }

      if (!routed.handled) {
        await originalSubmit(text)
        return
      }

      if (routed.clearInput !== false) {
        this.editor?.setText?.('')
      }
      if (routed.message) {
        this.showStatus?.(routed.message)
      }
      this.ui?.requestRender?.()
    }

    return result
  }
}

export function installLinxShellCommands(
  interactive: any,
  runtime: any,
  sessionCwd: string,
  options: Pick<LinxInteractiveBootstrapOptions, 'onAutoControlChange'> = {},
): void {
  installLinxCwdStartupNotice(interactive, sessionCwd)
  installLinxAutoEditorIndicator(interactive)
  if (options.onAutoControlChange) {
    interactive.__linxOnAutoControlChange = options.onAutoControlChange
  }
  installLinxShellCommandHandler(interactive, runtime)
}

export const installLinxGlobalCommands = installLinxShellCommands

function installLinxShellCommandHandler(interactive: any, runtime: any): void {
  if (interactive.__linxGlobalCommandHandlerInstalled) {
    return
  }

  const originalSetup = interactive.setupEditorSubmitHandler?.bind(interactive)
  if (typeof originalSetup !== 'function') {
    return
  }

  interactive.setupEditorSubmitHandler = function patchedLinxGlobalSetupEditorSubmitHandler(...args: unknown[]): unknown {
    const result = originalSetup(...args)
    const originalSubmit = this.defaultEditor?.onSubmit?.bind(this.defaultEditor)
    if (typeof originalSubmit !== 'function') {
      return result
    }

    this.defaultEditor.onSubmit = async (text: string): Promise<void> => {
      const command = parseLinxShellCommand(text.trim())
      if (!command) {
        recordSubmittedUserMessage(this, runtime, text)
        await originalSubmit(text)
        return
      }

      this.editor?.setText?.('')
      await handleLinxShellCommand(this, runtime, command)
    }

    return result
  }

  interactive.__linxGlobalCommandHandlerInstalled = true
  interactive.__linxHandleProjectedGlobalCommand = async (text: string): Promise<boolean | 'peer-command'> => {
    const command = parseLinxShellCommand(text.trim())
    if (!command) {
      return false
    }
    await handleLinxShellCommand(interactive, runtime, command)
    if (command.action === 'peer-command') {
      return 'peer-command'
    }
    return true
  }
  installProjectedCommandRouter(interactive)
}

export function installLinxInputCommandRouter(interactive: any, runtime: any): void {
  if (!interactive || interactive.__linxInputCommandRouterInstalled) {
    return
  }
  const originalGetUserInput = interactive.getUserInput?.bind(interactive)
  if (typeof originalGetUserInput !== 'function') {
    return
  }

  interactive.getUserInput = async function patchedLinxGetUserInput(...args: unknown[]): Promise<unknown> {
    while (true) {
      const input = await originalGetUserInput(...args)
      if (typeof input !== 'string') {
        return input
      }

      const command = parseLinxShellCommand(input.trim())
      if (!command) {
        return input
      }

      this.editor?.setText?.('')
      await handleLinxShellCommand(this, runtime, command)
    }
  }
  interactive.__linxInputCommandRouterInstalled = true
}

export function installLinxFinalSubmitCommandRouter(interactive: any, runtime: any): void {
  if (!interactive) {
    return
  }

  const wrapEditor = (editor: any): void => {
    if (!editor || typeof editor.onSubmit !== 'function') {
      return
    }
    if (editor.onSubmit.__linxFinalSubmitCommandRouterWrapped === true) {
      return
    }

    const originalSubmit = editor.onSubmit.bind(editor)
    const wrappedSubmit = async (text: string): Promise<void> => {
      const command = parseLinxShellCommand(String(text ?? '').trim())
      if (!command) {
        await originalSubmit(text)
        return
      }

      interactive.editor?.setText?.('')
      await handleLinxShellCommand(interactive, runtime, command)
    }
    ;(wrappedSubmit as any).__linxFinalSubmitCommandRouterWrapped = true
    editor.onSubmit = wrappedSubmit
  }

  wrapEditor(interactive.defaultEditor)
  if (interactive.editor !== interactive.defaultEditor) {
    wrapEditor(interactive.editor)
  }

  const originalSetCustomEditorComponent = interactive.setCustomEditorComponent?.bind(interactive)
  if (
    typeof originalSetCustomEditorComponent === 'function'
    && interactive.__linxFinalSubmitSetCustomEditorComponentPatched !== true
  ) {
    interactive.setCustomEditorComponent = function patchedLinxFinalSubmitSetCustomEditorComponent(...args: unknown[]): unknown {
      const result = originalSetCustomEditorComponent(...args)
      wrapEditor(this.defaultEditor)
      if (this.editor !== this.defaultEditor) {
        wrapEditor(this.editor)
      }
      return result
    }
    interactive.__linxFinalSubmitSetCustomEditorComponentPatched = true
  }

  interactive.__linxFinalSubmitCommandRouterInstalled = true
}

export function installLinxSessionCommandRouter(interactive: any, runtime: any): void {
  const session = interactive?.session ?? runtime?.session
  if (!session || typeof session !== 'object' || session.__linxSessionCommandRouterInstalled === true) {
    return
  }

  const originalPrompt = typeof session.prompt === 'function'
    ? session.prompt.bind(session)
    : undefined
  const originalSendUserMessage = typeof session.sendUserMessage === 'function'
    ? session.sendUserMessage.bind(session)
    : undefined

  if (!originalPrompt && !originalSendUserMessage) {
    return
  }

  if (originalPrompt) {
    session.__linxPromptWithoutCommandRouting = originalPrompt
    session.prompt = async (text: unknown, ...args: unknown[]): Promise<unknown> => {
      if (await maybeHandleLinxSessionCommand(interactive, runtime, text)) {
        return undefined
      }
      return originalPrompt(text, ...args)
    }
  }

  if (originalSendUserMessage) {
    session.__linxSendUserMessageWithoutCommandRouting = originalSendUserMessage
    session.sendUserMessage = async (text: unknown, ...args: unknown[]): Promise<unknown> => {
      if (await maybeHandleLinxSessionCommand(interactive, runtime, text)) {
        return undefined
      }
      return originalSendUserMessage(text, ...args)
    }
  }

  session.__linxSessionCommandRouterInstalled = true
}

function installLinxSessionCommandRouterAfterRebind(interactive: any, runtime: any): void {
  if (!interactive || interactive.__linxSessionCommandRouterAfterRebindInstalled === true) {
    return
  }

  const originalRebind = interactive.rebindCurrentSession?.bind(interactive)
  if (typeof originalRebind !== 'function') {
    return
  }

  interactive.rebindCurrentSession = async function patchedLinxRebindCurrentSession(...args: unknown[]): Promise<unknown> {
    const result = await originalRebind(...args)
    installLinxSessionCommandRouter(this, runtime)
    return result
  }
  interactive.__linxSessionCommandRouterAfterRebindInstalled = true
}

async function maybeHandleLinxSessionCommand(interactive: any, runtime: any, text: unknown): Promise<boolean> {
  if (typeof text !== 'string') {
    return false
  }

  const command = parseLinxShellCommand(text.trim())
  if (!command) {
    return false
  }

  interactive.editor?.setText?.('')
  await handleLinxShellCommand(interactive, runtime, command)
  return true
}

function recordSubmittedUserMessage(interactive: any, runtime: any, text: string): void {
  const input = text.trim()
  if (!input || input.startsWith('/')) {
    return
  }
  try {
    getSessionControlManager(interactive, runtime).recordUserMessage({ text: input })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    interactive.showWarning?.(`Thread reconciliation unavailable: ${message}`)
  }
}

async function handleLinxShellCommand(
  interactive: any,
  runtime: any,
  command: LinxShellCommand,
): Promise<void> {
  if (command.action === 'auto') {
    const auto = command.route.auto
    const enabled = auto?.action === 'set' ? auto.enabled : undefined
    const initialInput = auto?.action === 'set' ? auto.initialInput : undefined
    await handleInteractiveAutoCommand(interactive, runtime, enabled, {
      scheduleImmediately: initialInput === undefined,
    })
    if (initialInput) {
      const controller = getSecretaryAutoInputController(
        interactive,
        runtime,
        getSessionControlManager(interactive, runtime),
      )
      await controller.submit(initialInput, { reason: 'auto-on' })
    }
    return
  }

  if (command.action === 'peer-command') {
    await handleInteractivePeerCommand(interactive, runtime, command.route)
    return
  }

  if (command.action === 'ai-connect') {
    await handleInteractiveAiConnectCommand(interactive, runtime, command)
    return
  }

  if (command.action === 'statusline') {
    await handleInteractiveStatusLineCommand(interactive, command.args)
    return
  }

  if (command.action === 'update') {
    await checkAndShowLinxUpdate(interactive, { manual: true })
    return
  }

  if (command.action === 'rewind-select') {
    await handleInteractiveRewindSelector(interactive, runtime)
    return
  }

  if (command.action === 'rewind-turns') {
    await handleInteractiveRewindTurnsCommand(interactive, runtime, command.turns)
    return
  }

  await changeInteractiveCwd(interactive, runtime, command.target)
}

function installProjectedCommandRouter(interactive: any): void {
  interactive.__linxHandleProjectedCommand = async (text: string): Promise<boolean | 'peer-command'> => {
    const command = text.trim()
    if (!command.startsWith('/')) {
      return false
    }

    if (typeof interactive.__linxHandleProjectedGlobalCommand === 'function') {
      const handled = await interactive.__linxHandleProjectedGlobalCommand(command)
      if (handled === 'peer-command') {
        return 'peer-command'
      }
      if (handled === true) {
        return true
      }
    }

    if (typeof interactive.__linxHandleProjectedBackendCommand === 'function') {
      const handled = await interactive.__linxHandleProjectedBackendCommand(command)
      if (handled === true) {
        return true
      }
    }

    return false
  }
}

async function handleInteractivePeerCommand(
  interactive: any,
  runtime: any,
  route: AutoModePeerCommandRoute,
): Promise<void> {
  const goalMode = route.secretaryBehavior?.goalMode
  if (goalMode !== undefined) {
    applyInteractiveGoalMode(interactive, runtime, goalMode)
    interactive.showStatus?.(`Peer command routed; Secretary goal supervision mirror is ${goalMode ? 'active' : 'paused'}.`)
  } else {
    interactive.showStatus?.('Peer command routed to current chat peer.')
  }
  await submitProjectedBackendInput(interactive, route.text)
  interactive.ui?.requestRender?.()
}

function applyInteractiveGoalMode(interactive: any, runtime: any, enabled: boolean): void {
  interactive.__linxGoalModeEnabled = enabled
  if (enabled) {
    interactive.__linxGoalModeSupervisorLastAt = Date.now()
  } else {
    delete interactive.__linxGoalModeSupervisorLastAt
  }
  if (runtime && typeof runtime === 'object') {
    runtime.goalMode = enabled
    if (enabled) {
      runtime.goalModeSupervisorLastAt = interactive.__linxGoalModeSupervisorLastAt
    } else {
      delete runtime.goalModeSupervisorLastAt
    }
  }
}

async function submitProjectedBackendInput(interactive: any, text: string): Promise<void> {
  const session = interactive?.session
  const sendUserMessage = typeof session?.__linxSendUserMessageWithoutCommandRouting === 'function'
    ? session.__linxSendUserMessageWithoutCommandRouting
    : session?.sendUserMessage
  if (typeof sendUserMessage === 'function') {
    await sendUserMessage(text, session.isStreaming ? { deliverAs: 'followUp' } : undefined)
    return
  }

  const prompt = typeof session?.__linxPromptWithoutCommandRouting === 'function'
    ? session.__linxPromptWithoutCommandRouting
    : session?.prompt
  if (typeof prompt === 'function') {
    await prompt(text, session.isStreaming ? { streamingBehavior: 'followUp' } : undefined)
    return
  }

  throw new Error('Active LinX session cannot accept peer goal input')
}

async function handleInteractiveAutoCommand(
  interactive: any,
  runtime: any,
  enabled: boolean | undefined,
  options: { scheduleImmediately?: boolean } = {},
): Promise<void> {
  if (enabled === undefined) {
    const active = interactive.__autoEnabled === true
    interactive.showStatus?.(formatAutoModeChangeStatus(active))
    interactive.ui?.requestRender?.()
    return
  }

  const control = getSessionControlManager(interactive, runtime)
  control.setAutoEnabled(enabled)
  interactive.__autoEnabled = enabled
  if (runtime && typeof runtime === 'object') {
    runtime.autoEnabled = enabled
  }
  const controller = getSecretaryAutoInputController(interactive, runtime, control)
  if (enabled) {
    controller.start({ scheduleImmediately: options.scheduleImmediately !== false })
  } else {
    controller.stop()
  }
  interactive.showStatus?.(formatAutoModeChangeStatus(enabled))
  interactive.ui?.requestRender?.()
  await interactive.__linxOnAutoControlChange?.(enabled)
}

function formatAutoModeChangeStatus(enabled: boolean): string {
  return enabled
    ? [
      'Auto is on.',
      'Auto on: Secretary drives the current session input loop.',
      'What changed: backend prompts and blocked approval/input requests go to Secretary first; Secretary answers in-policy and asks you only when blocked.',
      'User-visible state: the input bar shows auto; Ctrl+C or /auto off hands control back to you.',
      'Backend approval policy is unchanged.',
    ].join('\n')
    : [
      'Auto is off.',
      'Auto off: you drive the current session directly.',
      'What changed: backend prompts, approvals, and free-form input return to the local TUI unless another explicit control path handles them.',
      'Auto only controls input ownership; it does not change whether the current chat peer is Secretary or worker/backend.',
      'Use /auto on to hand control back to Secretary.',
    ].join('\n')
}

export function installSymphonyCommand(interactive: any): void {
  if (interactive.__linxSymphonyCommandInstalled) {
    return
  }

  const originalSetup = interactive.setupEditorSubmitHandler?.bind(interactive)
  if (typeof originalSetup !== 'function') {
    return
  }

  interactive.setupEditorSubmitHandler = function patchedSymphonySetupEditorSubmitHandler(...args: unknown[]): unknown {
    const result = originalSetup(...args)
    const originalSubmit = this.defaultEditor?.onSubmit?.bind(this.defaultEditor)
    if (typeof originalSubmit !== 'function') {
      return result
    }

    this.defaultEditor.onSubmit = async (text: string): Promise<void> => {
      const input = text.trim()
      const command = parseSymphonyCommand(input)
      if (command) {
        this.editor?.setText?.('')
        await handleSymphonyCommand(this, command)
        return
      }

      if (this.__linxSymphonyModeEnabled && shouldProjectSymphonyInput(input)) {
        getSessionControlManager(this, this.runtime).recordUserMessage({ text: input })
        await originalSubmit(renderSymphonySecretaryProjection(input))
        return
      }

      await originalSubmit(text)
    }

    return result
  }

  interactive.__linxSymphonyCommandInstalled = true
}

type SymphonyCommand =
  | { action: 'enable' }
  | { action: 'disable' }
  | { action: 'status' }
  | { action: 'usage'; input: string }

function parseSymphonyCommand(input: string): SymphonyCommand | null {
  if (input !== '/symphony' && !input.startsWith('/symphony ')) {
    return null
  }

  const args = input === '/symphony' ? '' : input.slice('/symphony'.length).trim()
  if (!args || args.toLowerCase() === 'on' || args.toLowerCase() === 'enable') {
    return { action: 'enable' }
  }

  const normalized = args.toLowerCase()
  if (normalized === 'off' || normalized === 'disable' || normalized === 'exit') {
    return { action: 'disable' }
  }
  if (normalized === 'status') {
    return { action: 'status' }
  }

  return { action: 'usage', input: args }
}

async function handleSymphonyCommand(interactive: any, command: SymphonyCommand): Promise<void> {
  if (command.action === 'enable') {
    interactive.__linxSymphonyModeEnabled = true
    interactive.__linxSymphonyModeGeneration = (Number(interactive.__linxSymphonyModeGeneration) || 0) + 1
    if (interactive.runtime && typeof interactive.runtime === 'object') {
      interactive.runtime.symphonyEnabled = true
    }
    interactive.showStatus?.(formatSymphonyModeChangeStatus(true))
    interactive.ui?.requestRender?.()
    await interactive.__linxOnSymphonyControlChange?.(true)
    return
  }

  if (command.action === 'disable') {
    interactive.__linxSymphonyModeEnabled = false
    interactive.__linxSymphonyModeGeneration = (Number(interactive.__linxSymphonyModeGeneration) || 0) + 1
    abortInteractiveSymphonyDispatches(interactive)
    if (interactive.runtime && typeof interactive.runtime === 'object') {
      interactive.runtime.symphonyEnabled = false
    }
    interactive.showStatus?.(formatSymphonyModeChangeStatus(false))
    interactive.ui?.requestRender?.()
    await interactive.__linxOnSymphonyControlChange?.(false)
    return
  }

  if (command.action === 'status') {
    interactive.showStatus?.(await formatSymphonyStatus(interactive))
    interactive.ui?.requestRender?.()
    return
  }

  interactive.showStatus?.(formatSymphonyUsage(command.input))
  interactive.ui?.requestRender?.()
}

function formatSymphonyModeChangeStatus(enabled: boolean): string {
  return enabled
    ? 'Symphony is on. I will keep ordinary chat ordinary and only plan or hand off real work.'
    : 'Symphony is off. Back to direct chat. Active handoffs from this window were stopped.'
}

function formatSymphonyUsage(input: string): string {
  return [
    `Unsupported /symphony argument: ${input}`,
    'Use /symphony on to chat with Secretary, /symphony off to chat with the worker/backend peer, or /symphony status to inspect workers.',
    'After enabling Symphony, send the objective as a normal chat message to Secretary; Secretary will decide whether it is an Issue, update existing work, split tasks, and dispatch workers.',
  ].join('\n')
}

function shouldProjectSymphonyInput(input: string): boolean {
  return Boolean(input)
    && !input.startsWith('/')
    && !input.startsWith('!')
}

function renderSymphonySecretaryProjection(input: string): string {
  return [
    '# AI Secretary Symphony request',
    '',
    'Symphony is on: the user is chatting with Secretary, not directly with the worker/backend peer.',
    'Treat the user message below as a Secretary-facing product message.',
    'Decide whether it is ordinary chat, an Idea, a change to existing work, or delegable work.',
    'Default response style: reply like normal chat.',
    'Do not print internal Symphony binding, Issue/Task routing, worker selection, or report-style sections unless a visible state change or blocker must be surfaced.',
    'If the message is ordinary chat or early exploration, answer directly and do not explain that it was not delegated.',
    'If real delegation is needed, summarize the visible handoff result briefly after updating control state.',
    'When you need to inspect or mutate Symphony Pod resources from the AI side, use the xpod CLI as the direct Pod tool surface.',
    'Prefer model-backed xpod obj commands for Idea, Issue, Task, Delivery, Run, RunStep, Report, Evidence, ApprovalRequest, InputRequest, and InboxNotification resources.',
    'xpod uses the same Solid authority as LinX inside the Agent Runtime; do not ask the model to handle tokens or client secrets.',
    'Before mutating Pod resources from tools, verify xpod auth status/whoami reports the same acting WebID/Pod root as the LinX session; stop on mismatch.',
    'Do not hand-patch TTL or guess Pod paths for modeled product resources; use xpod/model descriptors or inspect existing links first.',
    '',
    'User message:',
    input,
  ].join('\n')
}

async function dispatchSymphonyWorkerFromInteractive(
  interactive: any,
  objective: string,
  source: SymphonySourceContext | undefined,
): Promise<void> {
  const backend = resolveSymphonyWorkerBackend(interactive, objective)
  const agentRuntime = resolveSymphonyControlAgentRuntime(interactive)
  const workerModel = resolveSymphonyWorkerModel(interactive, objective, backend)
  const workerCredentialSource = resolveSymphonyWorkerCredentialSource(interactive, backend)
  const workerGoalMode = interactive.__autoEnabled === true
  const workerSupervisorIntervalMs = workerGoalMode ? resolveSymphonyWorkerSupervisorIntervalMs(interactive) : undefined
  const cwd = resolveInteractiveCwd(interactive, interactive.runtime)
  const dispatchGeneration = Number(interactive.__linxSymphonyModeGeneration) || 0
  const dispatches = Array.isArray(interactive.__linxSymphonyDispatches)
    ? interactive.__linxSymphonyDispatches
    : []
  interactive.__linxSymphonyDispatches = dispatches
  const controller = new AbortController()
  const controllers = getInteractiveSymphonyDispatchControllers(interactive)
  controllers.add(controller)

  interactive.showStatus?.(
    `Symphony handoff started: ${backend}${workerModel ? ` · ${workerModel}` : ''}`
    + `${workerGoalMode ? ` · supervised every ${formatSymphonySupervisorInterval(workerSupervisorIntervalMs)}` : ''}.`
    + ' Use /symphony status for details.',
  )
  interactive.ui?.requestRender?.()

  const run = typeof interactive.__linxRunSymphony === 'function'
    ? interactive.__linxRunSymphony
    : runSymphony
  const dispatchArgs = {
    objective: [objective],
    backend,
    auto: interactive.__autoEnabled === true,
    cwd,
    plain: true,
    print: false,
    quietProjectionErrors: true,
    quietWorkers: true,
    credentialSource: workerCredentialSource,
    agentRuntime,
    workerModel,
    workerGoalMode,
    workerSupervisorIntervalMs,
    signal: controller.signal,
    ...(source?.chat ? { chat: source.chat } : {}),
    ...(source?.thread ? { thread: source.thread } : {}),
    target: {
      source: 'active-session',
      backend,
      agent: `${backend}-worker`,
      label: `${backend} worker`,
      ...(source?.chat ? { chat: source.chat } : {}),
      ...(source?.thread ? { thread: source.thread } : {}),
    },
  }
  const runtime = createInteractiveSymphonyRuntime(interactive)
  const dispatch = run(dispatchArgs, runtime)
    .then((plan: Awaited<ReturnType<typeof runSymphony>>) => {
      if (!isCurrentSymphonyDispatch(interactive, dispatchGeneration)) {
        return
      }
      interactive.showStatus?.(formatSymphonyDispatchResult(plan))
    })
    .catch((error: unknown) => {
      if (!isCurrentSymphonyDispatch(interactive, dispatchGeneration)) {
        return
      }
      if (isSymphonyAbortError(error)) {
        interactive.showStatus?.('Symphony dispatch cancelled.')
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      interactive.showError?.(`Symphony dispatch failed: ${message}`)
    })
    .finally(() => {
      controllers.delete(controller)
      if (!isCurrentSymphonyDispatch(interactive, dispatchGeneration)) {
        return
      }
      interactive.ui?.requestRender?.()
    })

  dispatches.push(dispatch)
  await Promise.resolve()
}

function getInteractiveSymphonyDispatchControllers(interactive: any): Set<AbortController> {
  if (!(interactive.__linxSymphonyDispatchControllers instanceof Set)) {
    interactive.__linxSymphonyDispatchControllers = new Set<AbortController>()
  }
  return interactive.__linxSymphonyDispatchControllers
}

function abortInteractiveSymphonyDispatches(interactive: any): void {
  const controllers = getInteractiveSymphonyDispatchControllers(interactive)
  for (const controller of controllers) {
    if (!controller.signal.aborted) {
      controller.abort(new Error('Symphony dispatch aborted by /symphony off'))
    }
  }
  controllers.clear()
}

function isSymphonyAbortError(error: unknown): boolean {
  return error instanceof Error
    && (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'))
}

function isCurrentSymphonyDispatch(interactive: any, generation: number): boolean {
  return interactive.__linxSymphonyModeEnabled === true
    && (Number(interactive.__linxSymphonyModeGeneration) || 0) === generation
}

function createInteractiveSymphonyRuntime(interactive: any): SymphonyRuntime | undefined {
  const projectionRuntime = interactive?.__linxSymphonyPodProjectionRuntime
  if (!projectionRuntime) {
    return undefined
  }

  return {
    runAutoMode,
    listAutoModeSessions: listArchivedAutoModeSessions,
    persistSymphonyControlStateToPod(plan, options) {
      return persistSymphonyControlStateToPod(plan, {
        ...options,
        runtime: projectionRuntime,
      })
    },
    listOpenSymphonyIssuesFromPod() {
      return listOpenSymphonyIssuesFromPod({ runtime: projectionRuntime })
    },
    mirrorSymphonyProjectionJsonLdFromPod(result) {
      return mirrorSymphonyProjectionJsonLdFromPod(result, { runtime: projectionRuntime })
    },
  }
}

function resolveSymphonyWorkerBackend(interactive: any, objective?: string): AutoModeWorkerBackend {
  const candidates = [
    interactive?.__linxSymphonyWorkerBackend,
    interactive?.runtime?.symphonyWorkerBackend,
    extractSymphonyWorkerBackendFromText(objective),
    interactive?.runtime?.runtimeBackend,
    interactive?.runtime?.workerBackend,
    interactive?.runtime?.backendCommandRouter?.backend,
    interactive?.runtime?.backendSessionRef?.backend,
  ]
  for (const candidate of candidates) {
    if (candidate === 'cc') {
      return 'claude'
    }
    if (isSymphonyWorkerBackend(candidate)) {
      return candidate
    }
  }
  return 'codex'
}

function isSymphonyWorkerBackend(value: unknown): value is AutoModeWorkerBackend {
  return value === 'linx' || value === 'codex' || value === 'claude' || value === 'codebuddy'
}

function resolveSymphonyWorkerCredentialSource(interactive: any, backend: AutoModeWorkerBackend): AutoModeCredentialSource {
  const configured = normalizeSymphonyCredentialSource(
    interactive?.__linxSymphonyWorkerCredentialSource,
    interactive?.runtime?.symphonyWorkerCredentialSource,
    interactive?.runtime?.workerCredentialSource,
  )
  if (configured) {
    return configured
  }

  return backend === 'linx' ? 'cloud' : 'local'
}

function normalizeSymphonyCredentialSource(...values: unknown[]): AutoModeCredentialSource | undefined {
  for (const value of values) {
    if (value === 'local' || value === 'cloud') {
      return value
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (normalized === 'local' || normalized === 'cloud') {
        return normalized
      }
    }
  }
  return undefined
}

function extractSymphonyWorkerBackendFromText(input: string | undefined): AutoModeWorkerBackend | undefined {
  const normalized = input?.trim().toLowerCase()
  if (!normalized) {
    return undefined
  }

  if (/\b(?:linx|pi)\s*(?:runtime|backend|worker|agent)\b/u.test(normalized)
    || /\b(?:runtime|backend|worker|agent)\s*(?:=|:|：|是|用|使用|设为|指定为)\s*(?:linx|pi)\b/u.test(normalized)
    || /(用|使用|让|派)\s*(linx|pi)\s*(runtime|后端|worker|agent|模型)?/u.test(normalized)) {
    return 'linx'
  }

  if (/\b(?:claude|cc)\s*(?:code\s*)?(?:runtime|backend|worker|agent)\b/u.test(normalized)
    || /\b(?:runtime|backend|worker|agent)\s*(?:=|:|：|是|用|使用|设为|指定为)\s*(?:claude|cc)\b/u.test(normalized)
    || /(用|使用|让|派)\s*(?:claude|cc)\s*(?:code|runtime|后端|worker|agent|模型)?/u.test(normalized)) {
    return 'claude'
  }

  if (/\bcodex\s*(?:runtime|backend|worker|agent)?\b/u.test(normalized)) {
    return 'codex'
  }

  if (/\b(?:claude|cc)\s*(?:code|runtime|backend|worker|agent)?\b/u.test(normalized)) {
    return 'claude'
  }

  if (/\bcodebuddy\s*(?:runtime|backend|worker|agent)?\b/u.test(normalized)) {
    return 'codebuddy'
  }

  return undefined
}

function resolveSymphonyControlAgentRuntime(interactive: any): AgentRuntimeBackendConfig | undefined {
  const configured = normalizeSymphonyAgentRuntimeConfig(
    interactive?.__linxAgentRuntime,
    interactive?.__linxAgentRuntimeConfig,
    interactive?.runtime?.agentRuntime,
    interactive?.runtime?.agentRuntimeConfig,
  )
  const model = configured?.model ?? normalizeSymphonyConfigString(
    interactive?.session?.model?.id,
    interactive?.runtime?.model,
  )
  if (!configured && !model) {
    return undefined
  }

  return {
    backend: configured?.backend ?? 'linx',
    credentialSource: configured?.credentialSource ?? 'cloud',
    ...configured,
    ...(model ? { model } : {}),
  }
}

function normalizeSymphonyAgentRuntimeConfig(...values: unknown[]): AgentRuntimeBackendConfig | undefined {
  for (const value of values) {
    if (!isRecord(value)) {
      continue
    }
    const metadata = isRecord(value.metadata) ? { ...value.metadata } : undefined
    const resolved: AgentRuntimeBackendConfig = {
      ...(normalizeSymphonyConfigString(value.backend) ? { backend: normalizeSymphonyConfigString(value.backend) } : {}),
      ...(normalizeSymphonyConfigString(value.model) ? { model: normalizeSymphonyConfigString(value.model) } : {}),
      ...(normalizeSymphonyConfigString(value.credentialSource) ? { credentialSource: normalizeSymphonyConfigString(value.credentialSource) } : {}),
      ...(normalizeSymphonyConfigString(value.runtime) ? { runtime: normalizeSymphonyConfigString(value.runtime) } : {}),
      ...(normalizeSymphonyConfigString(value.transport) ? { transport: normalizeSymphonyConfigString(value.transport) } : {}),
      ...(normalizeSymphonyConfigString(value.endpoint) ? { endpoint: normalizeSymphonyConfigString(value.endpoint) } : {}),
      ...(metadata ? { metadata } : {}),
    }
    if (Object.keys(resolved).length > 0) {
      return resolved
    }
  }
  return undefined
}

function formatSymphonyControlRuntime(runtime: AgentRuntimeBackendConfig): string {
  return [
    runtime.backend ?? 'linx',
    runtime.model,
    runtime.credentialSource ? `credentials=${runtime.credentialSource}` : undefined,
  ].filter(Boolean).join(' · ')
}

function resolveSymphonyWorkerModel(interactive: any, objective: string, backend: AutoModeWorkerBackend): string | undefined {
  const configured = normalizeSymphonyConfigString(
    interactive?.__linxSymphonyWorkerModel,
    interactive?.runtime?.symphonyWorkerModel,
    interactive?.runtime?.workerModel,
    extractSymphonyWorkerModelFromText(objective),
  )
  if (backend === 'claude' && configured && isProviderRoutedModel(configured)) {
    return 'opus'
  }
  return configured
}

function resolveSymphonyWorkerSupervisorIntervalMs(interactive: any): number {
  const value = Number(
    interactive?.__linxSymphonyWorkerSupervisorIntervalMs
    ?? interactive?.runtime?.symphonyWorkerSupervisorIntervalMs
    ?? DEFAULT_SYMPHONY_WORKER_SUPERVISOR_INTERVAL_MS,
  )
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_SYMPHONY_WORKER_SUPERVISOR_INTERVAL_MS
  }
  return Math.trunc(value)
}

function formatSymphonySupervisorInterval(value: number | undefined): string {
  const intervalMs = Number(value)
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return `${DEFAULT_SYMPHONY_WORKER_SUPERVISOR_INTERVAL_MS / 60_000}m`
  }
  if (intervalMs % 60_000 === 0) {
    return `${intervalMs / 60_000}m`
  }
  if (intervalMs % 1000 === 0) {
    return `${intervalMs / 1000}s`
  }
  return `${intervalMs}ms`
}

function normalizeSymphonyConfigString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const normalized = typeof value === 'string' ? value.trim() : ''
    if (normalized) {
      return normalized
    }
  }
  return undefined
}

function extractSymphonyWorkerModelFromText(input: string): string | undefined {
  const patterns = [
    /(?:worker|agent|模型|model)\s*(?:=|:|：|是|用|使用|设为|指定为)\s*([A-Za-z0-9][A-Za-z0-9._/-]{1,80})/iu,
    /(?:用|使用|让|派)\s*([A-Za-z0-9][A-Za-z0-9._/-]{1,80})\s*(?:作为)?\s*(?:worker|agent|模型|model)/iu,
    /\b((?:deepseek|gpt|claude|qwen|gemini)[A-Za-z0-9._/-]{1,80})\s*(?:worker|agent)?/iu,
  ]

  for (const pattern of patterns) {
    const match = input.match(pattern)
    const normalized = normalizeSymphonyModelToken(match?.[1])
    if (normalized) {
      return normalized
    }
  }

  return undefined
}

function normalizeSymphonyModelToken(value: unknown): string | undefined {
  const normalized = typeof value === 'string'
    ? value.trim().replace(/[，。,.、;；:：!?！？)）\]}】]+$/u, '')
    : ''
  return normalized || undefined
}

function isProviderRoutedModel(model: string): boolean {
  return /(?:deepseek|qwen|gemini|kimi|moonshot|mistral|grok|glm|minimax)/iu.test(model)
}

function formatSymphonyDispatchResult(plan: Awaited<ReturnType<typeof runSymphony>>): string {
  const worker = plan.workers[0]
  const session = worker?.session ?? plan.session
  const delivery = worker?.delivery ?? plan.delivery
  const lines = [
    plan.issue.status === 'resolved' && delivery.status === 'completed'
      ? `Symphony handoff completed: ${plan.issue.title}.`
      : `Symphony handoff recorded: ${plan.issue.title}.`,
    'Use /symphony status for details.',
  ]
  if (session.error) {
    lines.push(`Error: ${session.error}`)
  }
  return lines.join('\n')
}

interface CapturedSymphonyIdeaContext {
  uri: string
  summary: string
  status: string
  commitment: string
}

async function captureSymphonyIdeaIfNeeded(
  input: string,
  source: SymphonySourceContext | undefined,
): Promise<CapturedSymphonyIdeaContext | undefined> {
  if (!shouldCaptureSymphonyIdeaInput(input)) {
    return undefined
  }

  try {
    const affectedArea = inferSymphonyIdeaAffectedArea(input)
    const captureInput: CaptureSymphonyIdeaInput = {
      input,
      commitment: 'thought',
      status: 'captured',
      currentUnderstanding: input.trim(),
      nextStep: 'Bind this Idea against existing control records before promoting it to work.',
      ...(source?.chat ? { chat: source.chat } : {}),
      ...(source?.thread ? { thread: source.thread } : {}),
      ...(affectedArea ? { affectedArea } : {}),
    }
    const idea = createSymphonyIdeaRecord(captureInput)
    const persisted = await persistSymphonyIdeaToPod(idea)
    if (!persisted) {
      throw new Error('No active Pod session; Symphony Idea records must be written to Pod in LinX runtime.')
    }
    return {
      uri: idea.uri,
      summary: idea.summary,
      status: idea.status,
      commitment: idea.commitment,
    }
  } catch (error) {
    process.emitWarning(
      error instanceof Error
        ? new Error(`LinX Symphony Idea Pod write failed: ${error.message}`)
        : new Error(`LinX Symphony Idea Pod write failed: ${String(error)}`),
    )
    return undefined
  }
}

function shouldCaptureSymphonyIdeaInput(input: string): boolean {
  const normalized = input.trim()
  if (normalized.length < 12) {
    return false
  }
  return /\b(idea|maybe|perhaps|could we|should we|what if|proposal|direction)\b/iu.test(normalized)
    || /(我觉得|感觉|也许|可能|考虑|想法|方向|要不要|能不能|是不是|是否|应该)/u.test(normalized)
}

function inferSymphonyIdeaAffectedArea(input: string): string | undefined {
  const normalized = input.toLowerCase()
  if (/symphony|secretary|auto|approval|grant|pod|xpod|skill|worker|agent/u.test(normalized)) {
    return normalized.match(/symphony|secretary|auto|approval|grant|pod|xpod|skill|worker|agent/u)?.[0]
  }
  if (/(建模|模型|数据|同步|权限|审批|托管|多端|工作流|指标|质检)/u.test(input)) {
    return input.match(/建模|模型|数据|同步|权限|审批|托管|多端|工作流|指标|质检/u)?.[0]
  }
  return undefined
}


async function formatSymphonyStatus(interactive: any): Promise<string> {
  const enabled = interactive.__linxSymphonyModeEnabled === true
  const [source, workersRead, issuesRead, reportsRead] = await Promise.all([
    resolveSymphonySourceContext(interactive),
    listRunningSymphonyWorkers(interactive),
    listOpenSymphonyIssues(interactive),
    listRecentSymphonyReports(interactive),
  ])
  const workers = workersRead.items
  const issues = issuesRead.items
  const reports = reportsRead.items
  const controlStateErrors = Array.from(new Set([
    workersRead.error,
    issuesRead.error,
    reportsRead.error,
  ].filter((item): item is string => Boolean(item))))
  const controlStateSources = new Set([workersRead.source, issuesRead.source, reportsRead.source])
  const lines = [
    `Symphony is ${enabled ? 'on' : 'off'}.`,
    `Current chat peer: ${enabled ? 'Secretary' : 'worker/backend peer'}.`,
    `Open issues: ${issues.length}`,
    `Running workers: ${workers.length}`,
    `Recent reports: ${reports.length}`,
    controlStateErrors.length > 0
      ? `Pod control state: unavailable (${formatSymphonyStatusError(controlStateErrors[0]!)})`
      : controlStateSources.has('pod')
        ? 'Pod control state: active.'
        : 'Pod control state: portable local archive mode.',
    'Skills: issue triage, existing issue lookup, create/update/ask decision, task split, worker dispatch, status/report tracking.',
    'Delegation target: AI Secretary must choose a Chat resource before dispatch.',
    'Allowed targets: personal AI contact chat or group chat.',
    'Thread role: concrete work timeline under the selected Chat.',
    'Session role: backend runtime lifecycle only.',
  ]
  for (const issue of issues.slice(0, 5)) {
    lines.push(`  - ${formatSymphonyIssueStatus(issue)}`)
  }
  if (issues.length > 5) {
    lines.push(`  ... ${issues.length - 5} more open issue(s)`)
  }

  for (const worker of workers.slice(0, 5)) {
    lines.push(`  - ${formatSymphonyWorkerStatus(worker)}`)
  }
  if (workers.length > 5) {
    lines.push(`  ... ${workers.length - 5} more running worker(s)`)
  }

  for (const report of reports.slice(0, 5)) {
    lines.push(`  - ${formatSymphonyReportStatus(report)}`)
  }
  if (reports.length > 5) {
    lines.push(`  ... ${reports.length - 5} more recent report(s)`)
  }

  if (source) {
    lines.push(
      'Source conversation:',
      `  Chat: ${source.chat}`,
      `  Thread: ${source.thread}`,
      ...(source.sessionId ? [`  Runtime session: ${source.sessionId}`] : []),
    )
  } else {
    lines.push('Source conversation: unavailable until LinX has WebID and session id.')
  }

  lines.push('Commands: /symphony on chat with Secretary, /symphony status inspect workers, /symphony off chat with worker/backend.')
  return lines.join('\n')
}

type SymphonyWorkerStatus = SymphonyPodWorkerStatus | ReturnType<typeof listSymphonySessions>[number]
type SymphonyIssueStatus = ReturnType<typeof listSymphonyIssues>[number]
type SymphonyReportStatus = SymphonyPodReportStatus | ReturnType<typeof listSymphonySessions>[number]

type SymphonyStatusReadSource = 'pod' | 'local' | 'none'

interface SymphonyStatusRead<T> {
  items: T[]
  source: SymphonyStatusReadSource
  error?: string
}

function formatSymphonyStatusError(message: string): string {
  return message.replace(/\s+/gu, ' ').trim().slice(0, 180)
}

function resolveSymphonyStatusPodTimeoutMs(interactive: any): number {
  const value = Number(interactive?.__linxSymphonyStatusPodTimeoutMs)
  return Number.isFinite(value) && value > 0 ? value : SYMPHONY_STATUS_POD_TIMEOUT_MS
}

async function withSymphonyStatusTimeout<T>(
  interactive: any,
  label: string,
  task: Promise<T>,
): Promise<T> {
  const timeoutMs = resolveSymphonyStatusPodTimeoutMs(interactive)
  let timer: NodeJS.Timeout | null = null
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

async function listOpenSymphonyIssues(interactive: any): Promise<SymphonyStatusRead<SymphonyIssueStatus>> {
  const controlRuntime = interactive?.__linxSymphonyPodProjectionRuntime
  try {
    if (controlRuntime?.issueResource) {
      const podIssues = await withSymphonyStatusTimeout(
        interactive,
        'Symphony Pod issue status',
        listOpenSymphonyIssuesFromPod({ runtime: controlRuntime }),
      )
      if (podIssues) {
        return { items: podIssues, source: 'pod' }
      }
    }
  } catch (error) {
    return { items: [], source: 'none', error: error instanceof Error ? error.message : String(error) }
  }

  if (controlRuntime?.issueResource) {
    return {
      items: [],
      source: 'none',
      error: 'No active Pod session; Symphony control-plane state is Pod-authoritative.',
    }
  }

  try {
    const issues = typeof interactive?.__linxListSymphonyIssues === 'function'
      ? interactive.__linxListSymphonyIssues()
      : listSymphonyIssues()
    return {
      items: issues.filter((issue: SymphonyIssueStatus) => issue.status !== 'closed' && issue.status !== 'resolved'),
      source: 'local',
    }
  } catch {
    return { items: [], source: 'none' }
  }
}

async function listRunningSymphonyWorkers(interactive: any): Promise<SymphonyStatusRead<SymphonyWorkerStatus>> {
  const controlRuntime = interactive?.__linxSymphonyPodProjectionRuntime
  try {
    if (controlRuntime?.sessionResource) {
      const podWorkers = await withSymphonyStatusTimeout(
        interactive,
        'Symphony Pod worker status',
        listRunningSymphonyWorkersFromPod({ runtime: controlRuntime }),
      )
      if (podWorkers) {
        return { items: podWorkers, source: 'pod' }
      }
    }
  } catch (error) {
    return { items: [], source: 'none', error: error instanceof Error ? error.message : String(error) }
  }

  if (controlRuntime?.sessionResource) {
    return {
      items: [],
      source: 'none',
      error: 'No active Pod session; Symphony control-plane state is Pod-authoritative.',
    }
  }

  try {
    if (typeof interactive?.__linxListSymphonySessions === 'function') {
      const sessions = interactive.__linxListSymphonySessions()
      return {
        items: sessions.filter((session: ReturnType<typeof listSymphonySessions>[number]) => session.status === 'running'),
        source: 'local',
      }
    }

    return {
      items: listSymphonySessions()
        .filter((session: ReturnType<typeof listSymphonySessions>[number]) => session.status === 'running'),
      source: 'local',
    }
  } catch {
    return { items: [], source: 'none' }
  }
}

async function listRecentSymphonyReports(interactive: any): Promise<SymphonyStatusRead<SymphonyReportStatus>> {
  const controlRuntime = interactive?.__linxSymphonyPodProjectionRuntime
  try {
    if (controlRuntime?.deliveryResource) {
      const podReports = await withSymphonyStatusTimeout(
        interactive,
        'Symphony Pod report status',
        listRecentSymphonyReportsFromPod({
          runtime: controlRuntime,
          limit: 5,
        }),
      )
      if (podReports) {
        return { items: podReports, source: 'pod' }
      }
    }
  } catch (error) {
    return { items: [], source: 'none', error: error instanceof Error ? error.message : String(error) }
  }

  if (controlRuntime?.deliveryResource) {
    return {
      items: [],
      source: 'none',
      error: 'No active Pod session; Symphony control-plane state is Pod-authoritative.',
    }
  }

  try {
    const sessions = typeof interactive?.__linxListSymphonySessions === 'function'
      ? interactive.__linxListSymphonySessions()
      : listSymphonySessions()
    return {
      items: sessions
        .filter((session: ReturnType<typeof listSymphonySessions>[number]) => session.status === 'completed' || session.status === 'failed')
        .slice(0, 5),
      source: 'local',
    }
  } catch {
    return { items: [], source: 'none' }
  }
}

function formatSymphonyWorkerStatus(session: SymphonyWorkerStatus): string {
  const target = session.target?.label
    ?? session.target?.agent
    ?? session.target?.chat
    ?? session.backend
  const suffix = [
    session.autoModeSessionId ? `runtime=${session.autoModeSessionId}` : undefined,
    session.target?.chat ? `chat=${session.target.chat}` : undefined,
    session.cwd ? `cwd=${session.cwd}` : undefined,
  ].filter(Boolean).join(' · ')
  return `${session.backend}/${session.mode} -> ${target}${suffix ? ` (${suffix})` : ''}`
}

function formatSymphonyReportStatus(report: SymphonyReportStatus): string {
  const status = report.status
  const reportRecord = report as Record<string, any>
  const target = reportRecord.agent
    ?? reportRecord.target?.label
    ?? reportRecord.target?.agent
    ?? report.backend
  const title = 'summary' in report && report.summary
    ? report.summary
    : 'title' in report && report.title
      ? report.title
      : 'task' in report && report.task
        ? formatSymphonyResourceTail(report.task)
        : undefined
  const suffix = [
    report.autoModeSessionId ? `runtime=${report.autoModeSessionId}` : undefined,
    'thread' in report && report.thread ? `thread=${report.thread}` : undefined,
    'completedAt' in report && report.completedAt ? `completed=${report.completedAt}` : undefined,
    report.error ? `error=${report.error}` : undefined,
  ].filter(Boolean).join(' · ')
  return `${status} ${report.backend} -> ${target}${title ? `: ${title}` : ''}${suffix ? ` (${suffix})` : ''}`
}

function formatSymphonyIssueStatus(issue: SymphonyIssueStatus): string {
  const taskCount = issue.tasks?.length ?? 0
  const suffix = [
    formatSymphonyResourceTail(issue.uri),
    taskCount > 0 ? `${taskCount} task${taskCount === 1 ? '' : 's'}` : undefined,
    issue.thread ? `thread=${issue.thread}` : undefined,
  ].filter(Boolean).join(' · ')
  return `${issue.status} ${issue.title}${suffix ? ` (${suffix})` : ''}`
}

function formatSymphonyResourceTail(uri: string | undefined): string | undefined {
  if (!uri) {
    return undefined
  }
  return uri.trim().match(/[:/#]([^:/#]+)$/u)?.[1] ?? uri
}

interface SymphonySourceContext {
  chat: string
  thread: string
  sessionId?: string
}

async function resolveSymphonySourceContext(interactive: any): Promise<SymphonySourceContext | undefined> {
  const sessionId = interactive?.sessionManager?.getSessionId?.()
    ?? interactive?.session?.sessionManager?.getSessionId?.()
    ?? interactive?.session?.sessionId
  const webId = await resolveSymphonyWebId(interactive)
  if (typeof sessionId !== 'string' || !sessionId.trim() || !webId) {
    return undefined
  }

  const trimmedSessionId = sessionId.trim()
  return {
    chat: secretaryChatUri(webId),
    thread: secretaryThreadUri(webId, trimmedSessionId, DEFAULT_SECRETARY_CHAT_ID),
    sessionId: trimmedSessionId,
  }
}

async function resolveSymphonyWebId(interactive: any): Promise<string | undefined> {
  const candidates = [
    interactive?.podSession?.webId,
    interactive?.runtime?.podSession?.webId,
    interactive?.session?.podSession?.webId,
    interactive?.session?.runtime?.podSession?.webId,
    interactive?.session?.state?.webId,
    interactive?.state?.webId,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }
  const podSession = await interactive?.runtime?.getPodDataSession?.().catch(() => null)
  if (typeof podSession?.webId === 'string' && podSession.webId.trim()) {
    interactive.runtime.podSession = podSession
    return podSession.webId.trim()
  }
  return undefined
}

async function promptForBackendCredential(interactive: any, details: BackendCredentialInput): Promise<BackendCredentialEntry | null | undefined> {
  const reason = details.reason ?? 'missing'
  const repairLabel = formatBackendCredentialRepairReason(reason)
  interactive.showStatus?.(
    `AI Secretary detected ${repairLabel} ${details.providerLabel} credentials before this backend can answer. ` +
    'Enter them here; LinX will save them to your Pod AI settings and retry the message.',
  )

  if (canRenderPiLoginDialog(interactive)) {
    return promptForApiCredentialWithPiDialog(interactive, {
      title: `Connect ${details.providerLabel}`,
      providerId: details.providerId,
      providerLabel: details.providerLabel,
      providerIdPrompt: details.providerIdPrompt,
      apiKeyPrompt: details.apiKeyPrompt,
      baseUrlPrompt: details.baseUrlPrompt,
      progress: [
        `AI Secretary detected ${repairLabel} credentials.`,
        'LinX will save this with `linx ai connect` semantics into your Pod AI settings.',
      ],
      errorPrefix: `Failed to collect ${details.providerLabel} credentials`,
    })
  }

  return promptForBackendCredentialWithExtensionInput(interactive, details, repairLabel)
}

async function handleInteractiveAiConnectCommand(
  interactive: any,
  runtime: any,
  command: Extract<LinxShellCommand, { action: 'ai-connect' }>,
): Promise<void> {
  const providerId = command.provider?.trim()
  if (!providerId) {
    interactive.showStatus?.('Usage: /ai connect <provider> [--base-url <url>] [--model <model>] - connect an AI provider key to LinX Pod AI settings.')
    interactive.ui?.requestRender?.()
    return
  }

  const metadata = getAIConfigProviderMetadata(providerId)
  const providerLabel = metadata.displayName ?? metadata.id
  const credential = canRenderPiLoginDialog(interactive)
    ? await promptForApiCredentialWithPiDialog(interactive, {
        title: `Connect ${providerLabel}`,
        providerId: metadata.id,
        providerLabel,
        apiKeyPrompt: `${providerLabel} API key`,
        baseUrlPrompt: command.baseUrl ? undefined : 'API base URL',
        progress: [
          `Connect ${providerLabel} with LinX AI connect.`,
          'LinX will save this provider key to your Pod AI settings, not Pi auth.json.',
          ...(command.model ? [`Default model: ${command.model}`] : []),
        ],
        errorPrefix: `Failed to connect ${providerLabel}`,
      })
    : await promptForApiCredentialWithExtensionInput(interactive, {
        providerId: metadata.id,
        providerLabel,
        apiKeyPrompt: `${providerLabel} API key`,
        baseUrlPrompt: command.baseUrl ? undefined : 'API base URL',
        repairLabel: 'connect',
      })

  const apiKey = credential?.apiKey?.trim()
  if (!apiKey) {
    interactive.showStatus?.(`${providerLabel} AI connect cancelled.`)
    interactive.ui?.requestRender?.()
    return
  }

  try {
    const saveCredential = resolveInteractiveAiConnectCredentialSaver(interactive, runtime)
    const credentialProviderId = credential?.providerId?.trim()
    const credentialBaseUrl = credential?.baseUrl?.trim() || command.baseUrl?.trim()
    const model = command.model?.trim()
    const result = await saveCredential({
      provider: credentialProviderId || metadata.id,
      apiKey,
      ...(credentialBaseUrl ? { baseUrl: credentialBaseUrl } : {}),
      ...(model ? { model } : {}),
    })
    interactive.showStatus?.(`Connected AI provider ${result.providerId} to LinX Pod AI settings. api-key: ${result.maskedApiKey}`)
    interactive.session?.modelRegistry?.refresh?.()
    await interactive.updateAvailableProviderCount?.()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    interactive.showError?.(`LinX AI connect failed: ${message}`)
  } finally {
    interactive.ui?.requestRender?.()
  }
}

function resolveInteractiveAiConnectCredentialSaver(interactive: any, runtime: any): typeof connectAiProviderCredential {
  const candidates = [
    runtime?.connectAiProviderCredential,
    interactive?.__linxConnectAiProviderCredential,
    interactive?.runtime?.connectAiProviderCredential,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'function') {
      return candidate
    }
  }
  return connectAiProviderCredential
}

async function promptForApiCredentialWithPiDialog(
  interactive: any,
  details: {
    title: string
    providerId: string
    providerLabel: string
    providerIdPrompt?: string
    apiKeyPrompt: string
    baseUrlPrompt?: string
    progress?: string[]
    errorPrefix: string
  },
): Promise<BackendCredentialEntry | null | undefined> {
  const dialog = new LoginDialogComponent(
    interactive.ui,
    details.providerId,
    () => undefined,
    details.providerLabel,
    details.title,
  )
  const restoreEditor = (): void => {
    interactive.editorContainer.clear()
    interactive.editorContainer.addChild(interactive.editor)
    interactive.ui?.setFocus?.(interactive.editor)
    interactive.ui?.requestRender?.()
  }

  interactive.editorContainer.clear()
  interactive.editorContainer.addChild(dialog)
  interactive.ui?.setFocus?.(dialog)
  interactive.ui?.requestRender?.()

  try {
    for (const line of details.progress ?? []) {
      dialog.showProgress(line)
    }

    let providerId = details.providerId
    if (details.providerIdPrompt) {
      const providerIdValue = await dialog.showPrompt(
        `Enter ${details.providerIdPrompt}:`,
        details.providerId,
      )
      providerId = typeof providerIdValue === 'string' && providerIdValue.trim()
        ? providerIdValue.trim()
        : details.providerId
    }

    const apiKeyValue = await dialog.showPrompt(`Enter ${details.apiKeyPrompt}:`)
    const apiKey = typeof apiKeyValue === 'string' ? apiKeyValue.trim() : ''
    if (!apiKey) {
      return null
    }

    let baseUrl: string | undefined
    if (details.baseUrlPrompt) {
      const baseUrlValue = await dialog.showPrompt(
        `Enter ${details.baseUrlPrompt} (optional):`,
      )
      baseUrl = typeof baseUrlValue === 'string' && baseUrlValue.trim()
        ? baseUrlValue.trim()
        : undefined
    }

    return { providerId, apiKey, ...(baseUrl ? { baseUrl } : {}) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message !== 'Login cancelled') {
      interactive.showError?.(`${details.errorPrefix}: ${message}`)
    }
    return null
  } finally {
    restoreEditor()
  }
}

function canRenderPiLoginDialog(interactive: any): boolean {
  return Boolean(
    interactive?.isInitialized === true
      && interactive?.ui
      && interactive?.editor
      && typeof interactive?.editorContainer?.clear === 'function'
      && typeof interactive?.editorContainer?.addChild === 'function'
      && typeof interactive?.ui?.setFocus === 'function'
      && typeof interactive?.ui?.requestRender === 'function',
  )
}

async function promptForBackendCredentialWithExtensionInput(
  interactive: any,
  details: BackendCredentialInput,
  repairLabel: string,
): Promise<BackendCredentialEntry | null | undefined> {
  return promptForApiCredentialWithExtensionInput(interactive, {
    providerId: details.providerId,
    providerLabel: details.providerLabel,
    providerIdPrompt: details.providerIdPrompt,
    apiKeyPrompt: details.apiKeyPrompt,
    baseUrlPrompt: details.baseUrlPrompt,
    repairLabel,
  })
}

async function promptForApiCredentialWithExtensionInput(
  interactive: any,
  details: {
    providerId: string
    providerLabel: string
    providerIdPrompt?: string
    apiKeyPrompt: string
    baseUrlPrompt?: string
    repairLabel: string
  },
): Promise<BackendCredentialEntry | null | undefined> {
  const repairLabel = details.repairLabel
  const apiKeyTitle = [
    `${details.providerLabel} ${repairLabel} credential`,
    `Paste an ${details.apiKeyPrompt}; LinX will save it to your Pod AI settings.`,
    'Press Escape to cancel.',
  ].join('\n')

  if (typeof interactive.showExtensionInput !== 'function') {
    interactive.showError?.(`This terminal cannot collect ${details.providerLabel} credentials inside the TUI. Run \`linx ai connect ${details.providerId}\` first.`)
    return null
  }

  let providerId = details.providerId
  if (details.providerIdPrompt) {
    const providerIdTitle = [
      `${details.providerLabel} ${repairLabel} provider`,
      'Enter the provider id to store under /settings/providers/{provider}.ttl.',
      `Default: ${details.providerId}`,
      'Press Escape to cancel.',
    ].join('\n')
    const providerIdValue = await interactive.showExtensionInput(providerIdTitle, details.providerIdPrompt)
    providerId = typeof providerIdValue === 'string' && providerIdValue.trim()
      ? providerIdValue.trim()
      : details.providerId
  }

  const apiKeyValue = await interactive.showExtensionInput(apiKeyTitle, details.apiKeyPrompt)
  const apiKey = typeof apiKeyValue === 'string' ? apiKeyValue.trim() : ''
  if (!apiKey) {
    return null
  }

  let baseUrl: string | undefined
  if (details.baseUrlPrompt) {
    const baseUrlTitle = [
      `${details.providerLabel} ${repairLabel} base URL`,
      'Optional. Leave empty to use the shared provider default.',
      'Press Escape to cancel.',
    ].join('\n')
    const baseUrlValue = await interactive.showExtensionInput(baseUrlTitle, details.baseUrlPrompt)
    baseUrl = typeof baseUrlValue === 'string' && baseUrlValue.trim()
      ? baseUrlValue.trim()
      : undefined
  }

  return { providerId, apiKey, ...(baseUrl ? { baseUrl } : {}) }
}

function formatBackendCredentialRepairReason(reason: BackendCredentialRepairReason): string {
  return reason === 'invalid' ? 'invalid' : 'missing'
}

export function installLinxEscapeInterrupt(interactive: any): void {
  installLinxInterruptControl(interactive, {
    disableAutoMode(target) {
      void handleInteractiveAutoCommand(target, target?.runtime, false)
    },
  })
}
export function patchPiAssistantMessageRendering(): void {
  if (assistantMessagePatched) {
    return
  }

  const originalUpdateContent = AssistantMessageComponent.prototype.updateContent
  AssistantMessageComponent.prototype.updateContent = function patchedUpdateContent(message: unknown): void {
    const sanitizedMessage = stripLinxHiddenAssistantContent(message) as Parameters<typeof originalUpdateContent>[0]
    return originalUpdateContent.call(this, sanitizedMessage)
  }
  assistantMessagePatched = true
}

function stripLinxHiddenAssistantContent(message: unknown): unknown {
  if (!isRecord(message) || !Array.isArray(message.content)) {
    return message
  }

  const content = message.content.filter((part) => !isLinxHiddenAssistantContentPart(part))
  if (content.length === message.content.length) {
    return message
  }

  return {
    ...message,
    content,
  }
}

function isLinxHiddenAssistantContentPart(part: unknown): boolean {
  return isRecord(part) && part.type === 'thinking'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
