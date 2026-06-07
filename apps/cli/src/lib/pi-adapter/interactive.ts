import { InteractiveMode } from '@earendil-works/pi-coding-agent'
import { AssistantMessageComponent, FooterComponent, LoginDialogComponent } from '@earendil-works/pi-coding-agent'
import { Container, getKeybindings, Spacer, Text, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { connectAiProviderCredential } from '../ai-command.js'
import { listArchivedAutoModeSessions, runAutoMode } from '../auto-mode/runner.js'
import type { AutoModeCredentialSource, AutoModeWorkerBackend } from '../auto-mode/types.js'
import {
  resolveAutoModeCommandRoute,
  type AutoModeControlCommandRoute,
  type AutoModePeerCommandRoute,
} from '@linx/agent-runtime/auto-mode'
import type { AgentRuntimeBackendConfig } from '@linx/agent-runtime'
import { getAIConfigProviderCatalog, getAIConfigProviderMetadata } from '../models.js'
import { runSymphony, type SymphonyRuntime } from '../symphony-command.js'
import { applyLinxInteractiveBranding, requestLinxCloudLogin } from './branding.js'
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
  writeSymphonyIdea,
} from '../symphony/archive.js'
import {
  listOpenSymphonyIssuesFromPod,
  listRecentSymphonyReportsFromPod,
  listRunningSymphonyWorkersFromPod,
  mirrorSymphonyProjectionJsonLdFromPod,
  persistSymphonyIdeaToPod,
  persistSymphonyProjectionToPod,
  type SymphonyPodReportStatus,
  type SymphonyPodWorkerStatus,
} from '../symphony/pod-projection.js'
import {
  getSessionControlManager,
  installSessionControlRuntimeEventBridge,
} from './session-control.js'

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

let footerPatched = false
let assistantMessagePatched = false
let linxResumeOutputStyleRestore: (() => void) | null = null
const BACKEND_OWNED_SLASH_COMMANDS = new Set([
  'commands',
  'models',
  'rollback',
  'status',
])
const SYMPHONY_STATUS_POD_TIMEOUT_MS = 1_200
const DEFAULT_SYMPHONY_WORKER_SUPERVISOR_INTERVAL_MS = 10 * 60 * 1000

export function bootstrapLinxInteractiveMode(
  runtime: any,
  options: LinxInteractiveBootstrapOptions = {},
): LinxInteractiveBootstrap {
  installLinxResumeOutputStyle()
  patchPiFooter()
  patchPiAssistantMessageRendering()
  const sessionCwd = runtime?.cwd || process.cwd()
  ensureInteractiveRuntimeHost(runtime)
  const interactive = new InteractiveMode(runtime, options)
  ;(interactive as any).runtime = runtime
  ;(interactive as any).__autoEnabled = runtime?.autoEnabled === true
  ;(interactive as any).__linxSymphonyModeEnabled = runtime?.symphonyEnabled === true
  if (options.onSymphonyControlChange) {
    ;(interactive as any).__linxOnSymphonyControlChange = options.onSymphonyControlChange
  }
  const sessionControlManager = getSessionControlManager(interactive as any, runtime, sessionCwd)
  runtime?.backendCommandRouter?.setSessionControl?.(sessionControlManager)
  const restorePodStatusOutputFilter = installPodStatusOutputFilter()
  applyLinxInteractiveBranding(interactive as any)
  patchInteractiveExitMessage(interactive as any)
  patchInteractivePodStatusFilterCleanup(interactive as any, restorePodStatusOutputFilter)
  installPodBackedExtensionUi(interactive as any, runtime, sessionControlManager)
  installSymphonyAutocomplete(interactive as any)
  // Register /cd slash command; workspace follows terminal while session stays.
  installLinxGlobalCommands(interactive as any, runtime, sessionCwd, options)
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
        '托管中 · Secretary 自动输入 · Ctrl+C 接管 · /auto off',
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

function shouldRouteToBackendCommand(command: string): boolean {
  if (!command.startsWith('/')) {
    return false
  }

  const name = command.slice(1).split(/\s+/, 1)[0]?.toLowerCase()
  if (!name) {
    return false
  }

  return BACKEND_OWNED_SLASH_COMMANDS.has(name)
}

type LinxGlobalCommand =
  | { action: 'auto'; route: AutoModeControlCommandRoute }
  | { action: 'peer-command'; route: AutoModePeerCommandRoute }
  | { action: 'cd'; target?: string }
  | { action: 'ai-connect'; provider?: string; baseUrl?: string; model?: string }
  | { action: 'rewind-select' }
  | { action: 'rewind-turns'; turns: number }

export function installLinxGlobalCommands(
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
  installLinxGlobalCommandHandler(interactive, runtime)
}

export function installLinxAutoEditorIndicator(interactive: any): void {
  if (!interactive || interactive.__linxAutoEditorIndicatorInstalled) {
    return
  }

  decorateLinxAutoEditorRender(interactive.defaultEditor, interactive)
  if (interactive.editor && interactive.editor !== interactive.defaultEditor) {
    decorateLinxAutoEditorRender(interactive.editor, interactive)
  }

  const originalSetCustomEditorComponent = interactive.setCustomEditorComponent?.bind(interactive)
  if (typeof originalSetCustomEditorComponent === 'function') {
    interactive.setCustomEditorComponent = function patchedSetCustomEditorComponent(...args: unknown[]): unknown {
      const result = originalSetCustomEditorComponent(...args)
      decorateLinxAutoEditorRender(this.defaultEditor, this)
      if (this.editor && this.editor !== this.defaultEditor) {
        decorateLinxAutoEditorRender(this.editor, this)
      }
      return result
    }
  }

  interactive.__linxAutoEditorIndicatorInstalled = true
}

function decorateLinxAutoEditorRender(editor: any, interactive: any): void {
  if (!editor || editor.__linxAutoEditorIndicatorRenderInstalled || typeof editor.render !== 'function') {
    return
  }

  const originalRender = editor.render.bind(editor)
  editor.render = function linxAutoEditorIndicatorRender(width: number): string[] {
    const lines = originalRender(width)
    if (interactive.__autoEnabled !== true) {
      return lines
    }
    return decorateLinxAutoEditorLines(lines, width)
  }
  editor.__linxAutoEditorIndicatorRenderInstalled = true
}

function decorateLinxAutoEditorLines(lines: string[], width: number): string[] {
  const rendered = Array.isArray(lines) ? [...lines] : []
  const indicator = buildLinxAutoEditorIndicatorLine(width)
  if (rendered.length === 0) {
    return [indicator]
  }
  rendered[0] = indicator
  return rendered
}

export function buildLinxAutoEditorIndicatorLine(width: number): string {
  if (width <= 0) {
    return ''
  }

  const label = ' 托管中 · Secretary 自动输入 · Ctrl+C 接管 · /auto off '
  const fitted = truncateToWidth(label, width)
  const padded = fitted + ' '.repeat(Math.max(0, width - visibleWidth(fitted)))
  return `\x1b[1m\x1b[38;5;230m\x1b[48;5;58m${padded}\x1b[0m`
}

function installLinxGlobalCommandHandler(interactive: any, runtime: any): void {
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
      const command = parseLinxGlobalCommand(text.trim())
      if (!command) {
        recordSubmittedUserMessage(this, runtime, text)
        await originalSubmit(text)
        return
      }

      this.editor?.setText?.('')
      await handleLinxGlobalCommand(this, runtime, command)
    }

    return result
  }

  interactive.__linxGlobalCommandHandlerInstalled = true
  interactive.__linxHandleProjectedGlobalCommand = async (text: string): Promise<boolean | 'peer-command'> => {
    const command = parseLinxGlobalCommand(text.trim())
    if (!command) {
      return false
    }
    await handleLinxGlobalCommand(interactive, runtime, command)
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

      const command = parseLinxGlobalCommand(input.trim())
      if (!command) {
        return input
      }

      this.editor?.setText?.('')
      await handleLinxGlobalCommand(this, runtime, command)
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
      const command = parseLinxGlobalCommand(String(text ?? '').trim())
      if (!command) {
        await originalSubmit(text)
        return
      }

      interactive.editor?.setText?.('')
      await handleLinxGlobalCommand(interactive, runtime, command)
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

  const command = parseLinxGlobalCommand(text.trim())
  if (!command) {
    return false
  }

  interactive.editor?.setText?.('')
  await handleLinxGlobalCommand(interactive, runtime, command)
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

function parseLinxGlobalCommand(input: string): LinxGlobalCommand | null {
  const autoModeRoute = resolveAutoModeCommandRoute(input)
  if (autoModeRoute?.kind === 'control-command') {
    return { action: 'auto', route: autoModeRoute }
  }
  if (autoModeRoute?.kind === 'peer-command') {
    return { action: 'peer-command', route: autoModeRoute }
  }

  if (input === '/cd') {
    return { action: 'cd' }
  }

  if (input.startsWith('/cd ')) {
    return { action: 'cd', target: input.slice('/cd'.length).trim() }
  }

  if (input === '/ai connect') {
    return { action: 'ai-connect' }
  }

  if (input.startsWith('/ai connect ')) {
    return { action: 'ai-connect', ...parseInteractiveAiConnectArgs(input.slice('/ai connect'.length).trim()) }
  }

  if (input === '/rewind') {
    return { action: 'rewind-select' }
  }

  if (input.startsWith('/rewind ')) {
    const turns = parseRewindTurnCount(input.slice('/rewind'.length).trim())
    return { action: 'rewind-turns', turns: turns ?? 0 }
  }

  return null
}

function parseRewindTurnCount(input: string): number | null {
  if (!/^\d+$/.test(input)) {
    return null
  }
  const value = Number.parseInt(input, 10)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function parseInteractiveAiConnectArgs(input: string): Pick<Extract<LinxGlobalCommand, { action: 'ai-connect' }>, 'provider' | 'baseUrl' | 'model'> {
  const tokens = splitInteractiveCommandArgs(input)
  let provider: string | undefined
  let baseUrl: string | undefined
  let model: string | undefined

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token) {
      continue
    }

    if (token === '--base-url') {
      baseUrl = tokens[index + 1]
      index += 1
      continue
    }
    if (token.startsWith('--base-url=')) {
      baseUrl = token.slice('--base-url='.length)
      continue
    }
    if (token === '--model') {
      model = tokens[index + 1]
      index += 1
      continue
    }
    if (token.startsWith('--model=')) {
      model = token.slice('--model='.length)
      continue
    }
    if (!token.startsWith('-') && !provider) {
      provider = token
    }
  }

  return {
    ...(provider?.trim() ? { provider: provider.trim() } : {}),
    ...(baseUrl?.trim() ? { baseUrl: baseUrl.trim() } : {}),
    ...(model?.trim() ? { model: model.trim() } : {}),
  }
}

function splitInteractiveCommandArgs(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaping = false

  for (const char of input) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }

    if (char === '\\') {
      escaping = true
      continue
    }

    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (escaping) {
    current += '\\'
  }
  if (current) {
    tokens.push(current)
  }

  return tokens
}

async function handleLinxGlobalCommand(
  interactive: any,
  runtime: any,
  command: LinxGlobalCommand,
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

async function handleInteractiveRewindSelector(interactive: any, runtime: any): Promise<void> {
  const session = resolveInteractiveSession(interactive, runtime)
  const sessionManager = resolveInteractiveSessionManager(interactive, runtime)
  if (!sessionManager) {
    interactive.showError?.('Cannot rewind: no active LinX session history.')
    interactive.ui?.requestRender?.()
    return
  }

  if (typeof interactive.showSelector !== 'function') {
    await handleInteractiveRewindTurnsCommand(interactive, runtime, 1)
    return
  }

  const userMessages = collectRewindUserMessages(session, sessionManager)
  if (userMessages.length === 0) {
    interactive.showStatus?.('Nothing to rewind: no user turns in the active branch.')
    interactive.ui?.requestRender?.()
    return
  }

  const initialSelectedId = userMessages[userMessages.length - 1]?.id
  interactive.showSelector((done: () => void) => {
    const selector = new LinxRewindMessageSelectorComponent(
      userMessages,
      async (entryId) => {
        try {
          await rewindSessionManagerBeforeUserEntry(interactive, runtime, session, sessionManager, entryId)
          done()
        } catch (error) {
          done()
          interactive.showError?.(error instanceof Error ? error.message : String(error))
        }
      },
      () => {
        done()
        interactive.ui?.requestRender?.()
      },
      initialSelectedId,
    )
    return { component: selector, focus: selector.getMessageList() }
  })
}

async function handleInteractiveRewindTurnsCommand(
  interactive: any,
  runtime: any,
  turns: number,
): Promise<void> {
  if (!Number.isSafeInteger(turns) || turns <= 0) {
    interactive.showStatus?.('Usage: /rewind [turns] where turns is a positive integer.')
    interactive.ui?.requestRender?.()
    return
  }

  const session = resolveInteractiveSession(interactive, runtime)
  const sessionManager = resolveInteractiveSessionManager(interactive, runtime)
  if (!sessionManager) {
    interactive.showError?.('Cannot rewind: no active LinX session history.')
    interactive.ui?.requestRender?.()
    return
  }

  await stopActiveSessionWorkForRewind(session)
  resetPendingAutoInputForRewind(interactive, runtime)

  const previousState = captureRewindSessionState(sessionManager)
  const previousBranch = getActiveSessionBranch(sessionManager)
  const result = rewindSessionManagerByTurns(sessionManager, turns)
  if (result.rewound === 0) {
    interactive.showStatus?.('Nothing to rewind: no user turns in the active branch.')
    interactive.ui?.requestRender?.()
    return
  }

  const cleanResult = materializeCleanRewindSession(sessionManager, result.targetLeafId, previousState)
  syncAgentStateFromSessionManager(session, sessionManager)
  await syncRewindProjection(interactive, runtime, {
    previousState,
    cleanResult,
    abandonedEntries: collectAbandonedRewindEntries(previousBranch, result.targetLeafId),
  })
  const remainingMessages = Array.isArray(session?.agent?.state?.messages)
    ? session.agent.state.messages.length
    : undefined
  const target = describeRewindTarget(result.targetLeafId, cleanResult)
  const suffix = remainingMessages === undefined ? '' : ` Active context now has ${remainingMessages} message${remainingMessages === 1 ? '' : 's'}.`
  interactive.showStatus?.(`Rewound ${result.rewound} turn${result.rewound === 1 ? '' : 's'} to ${target}.${suffix}`)
  interactive.ui?.requestRender?.()
}

async function rewindSessionManagerBeforeUserEntry(
  interactive: any,
  runtime: any,
  session: any,
  sessionManager: any,
  entryId: string,
): Promise<void> {
  const entry = typeof sessionManager?.getEntry === 'function'
    ? sessionManager.getEntry(entryId)
    : getActiveSessionBranch(sessionManager).find((candidate) => candidate?.id === entryId)
  if (!entry || entry.type !== 'message' || entry.message?.role !== 'user') {
    throw new Error('Cannot rewind: selected message is not a user turn in the active branch.')
  }

  const previousState = captureRewindSessionState(sessionManager)
  const previousBranch = getActiveSessionBranch(sessionManager)

  await stopActiveSessionWorkForRewind(session)
  resetPendingAutoInputForRewind(interactive, runtime)

  const targetLeafId = typeof entry.parentId === 'string' && entry.parentId ? entry.parentId : null
  moveSessionManagerLeaf(sessionManager, targetLeafId)
  const cleanResult = materializeCleanRewindSession(sessionManager, targetLeafId, previousState)
  syncAgentStateFromSessionManager(session, sessionManager)
  await syncRewindProjection(interactive, runtime, {
    previousState,
    cleanResult,
    abandonedEntries: collectAbandonedRewindEntries(previousBranch, targetLeafId),
  })
  const remainingMessages = Array.isArray(session?.agent?.state?.messages)
    ? session.agent.state.messages.length
    : undefined
  const target = describeRewindTarget(targetLeafId, cleanResult)
  const suffix = remainingMessages === undefined ? '' : ` Active context now has ${remainingMessages} message${remainingMessages === 1 ? '' : 's'}.`
  interactive.showStatus?.(`Rewound to before selected message at ${target}.${suffix}`)
  interactive.ui?.requestRender?.()
}

function resolveInteractiveSession(interactive: any, runtime: any): any {
  return interactive?.session ?? runtime?.session
}

function resolveInteractiveSessionManager(interactive: any, runtime: any): any {
  return interactive?.session?.sessionManager
    ?? interactive?.sessionManager
    ?? runtime?.session?.sessionManager
    ?? runtime?.sessionManager
}

async function stopActiveSessionWorkForRewind(session: any): Promise<void> {
  if (!session) {
    return
  }

  const shouldWait = session.isStreaming === true || session.isBashRunning === true
  try {
    if (session.isBashRunning === true && typeof session.abortBash === 'function') {
      session.abortBash()
    }
    if (session.isStreaming === true && typeof session.abort === 'function') {
      session.abort()
    }
  } catch {
    // Rewind should still repair the active branch even if abort reporting fails.
  }

  if (!shouldWait || typeof session.agent?.waitForIdle !== 'function') {
    return
  }
  await Promise.race([
    Promise.resolve(session.agent.waitForIdle()).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 1_500)),
  ])
}

function resetPendingAutoInputForRewind(interactive: any, runtime: any): void {
  if (interactive?.__autoEnabled !== true || !interactive?.__linxAutoInputController) {
    return
  }

  try {
    interactive.__linxAutoInputController.stop()
    interactive.__linxAutoInputController.start({ scheduleImmediately: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    interactive.showWarning?.(`Auto input reset after rewind failed: ${message}`)
  }

  if (runtime && typeof runtime === 'object') {
    runtime.autoEnabled = true
  }
}

function rewindSessionManagerByTurns(
  sessionManager: any,
  turns: number,
): { rewound: number; targetLeafId: string | null } {
  let rewound = 0
  let targetLeafId = resolveSessionManagerLeafId(sessionManager)

  for (; rewound < turns; rewound += 1) {
    const branch = getActiveSessionBranch(sessionManager)
    const latestUserEntry = findLatestUserMessageEntry(branch)
    if (!latestUserEntry) {
      break
    }

    targetLeafId = typeof latestUserEntry.parentId === 'string' && latestUserEntry.parentId
      ? latestUserEntry.parentId
      : null
    moveSessionManagerLeaf(sessionManager, targetLeafId)
  }

  return { rewound, targetLeafId }
}

function resolveSessionManagerLeafId(sessionManager: any): string | null {
  return typeof sessionManager?.getLeafId === 'function'
    ? sessionManager.getLeafId()
    : null
}

function getActiveSessionBranch(sessionManager: any): any[] {
  const hasLeafApi = typeof sessionManager?.getLeafId === 'function'
  const leafId = hasLeafApi ? sessionManager.getLeafId() : undefined
  if (hasLeafApi && leafId === null) {
    return []
  }
  if (typeof sessionManager?.getBranch === 'function') {
    const branch = hasLeafApi ? sessionManager.getBranch(leafId) : sessionManager.getBranch()
    return Array.isArray(branch) ? branch : []
  }
  const entries = typeof sessionManager?.getEntries === 'function' ? sessionManager.getEntries() : []
  return Array.isArray(entries) ? entries : []
}

function findLatestUserMessageEntry(branch: any[]): any | null {
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index]
    if (entry?.type === 'message' && entry.message?.role === 'user') {
      return entry
    }
  }
  return null
}

function moveSessionManagerLeaf(sessionManager: any, leafId: string | null): void {
  if (leafId) {
    sessionManager.branch?.(leafId)
    return
  }
  sessionManager.resetLeaf?.()
}

interface RewindSessionState {
  id?: string
  file?: string
  createdAt?: Date
}

interface CleanRewindResult {
  materialized: boolean
  sessionChanged: boolean
  id?: string
  file?: string
  warning?: string
}

function captureRewindSessionState(sessionManager: any): RewindSessionState {
  return {
    id: normalizeRewindString(sessionManager?.getSessionId?.()),
    file: normalizeRewindString(sessionManager?.getSessionFile?.()),
    createdAt: resolveRewindSessionCreatedAt(sessionManager),
  }
}

function materializeCleanRewindSession(
  sessionManager: any,
  targetLeafId: string | null,
  previousState: RewindSessionState,
): CleanRewindResult {
  const beforeId = previousState.id
  let materialized = false
  let warning: string | undefined

  try {
    if (targetLeafId && typeof sessionManager?.createBranchedSession === 'function') {
      sessionManager.createBranchedSession(targetLeafId)
      materialized = true
    } else if (!targetLeafId && typeof sessionManager?.newSession === 'function') {
      sessionManager.newSession(previousState.file ? { parentSession: previousState.file } : undefined)
      materialized = true
    }
  } catch (error) {
    warning = error instanceof Error ? error.message : String(error)
  }

  const id = normalizeRewindString(sessionManager?.getSessionId?.())
  const file = normalizeRewindString(sessionManager?.getSessionFile?.())
  return {
    materialized,
    sessionChanged: Boolean(beforeId && id && beforeId !== id),
    id,
    file,
    ...(warning ? { warning } : {}),
  }
}

function describeRewindTarget(targetLeafId: string | null, cleanResult: CleanRewindResult): string {
  const target = targetLeafId ? `leaf ${targetLeafId}` : 'session root'
  if (!cleanResult.materialized) {
    return target
  }
  if (cleanResult.sessionChanged && cleanResult.id) {
    return `${target} in clean session ${cleanResult.id}`
  }
  return `${target} in clean session`
}

function collectAbandonedRewindEntries(previousBranch: any[], targetLeafId: string | null): any[] {
  if (!Array.isArray(previousBranch) || previousBranch.length === 0) {
    return []
  }
  if (!targetLeafId) {
    return previousBranch
  }
  const targetIndex = previousBranch.findIndex((entry) => entry?.id === targetLeafId)
  return targetIndex >= 0 ? previousBranch.slice(targetIndex + 1) : previousBranch
}

async function syncRewindProjection(
  interactive: any,
  runtime: any,
  input: {
    previousState: RewindSessionState
    cleanResult: CleanRewindResult
    abandonedEntries: any[]
  },
): Promise<void> {
  if (input.cleanResult.warning) {
    interactive.showWarning?.(`Clean rewind history materialization skipped: ${input.cleanResult.warning}`)
  }

  const mirror = runtime?.__linxPodMirror ?? interactive?.__linxPodMirror
  if (!mirror || typeof mirror.syncRewindProjection !== 'function') {
    return
  }

  try {
    await mirror.syncRewindProjection({
      previousSessionId: input.previousState.id,
      previousSessionFile: input.previousState.file,
      previousCreatedAt: input.previousState.createdAt,
      cleanSessionId: input.cleanResult.id,
      cleanSessionFile: input.cleanResult.file,
      abandonedEntries: input.abandonedEntries,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    interactive.showWarning?.(`Pod rewind projection unavailable: ${message}`)
  }
}

function resolveRewindSessionCreatedAt(sessionManager: any): Date | undefined {
  const headerTimestamp = normalizeRewindString(sessionManager?.getHeader?.()?.timestamp)
  const headerDate = toValidRewindDate(headerTimestamp)
  if (headerDate) {
    return headerDate
  }

  const entries = Array.isArray(sessionManager?.getEntries?.()) ? sessionManager.getEntries() : []
  for (const entry of entries) {
    const timestamp = normalizeRewindString(entry?.timestamp)
    const date = toValidRewindDate(timestamp)
    if (date) {
      return date
    }
  }

  const sessionId = normalizeRewindString(sessionManager?.getSessionId?.())
  return sessionId ? parseRewindDateFromSessionId(sessionId) ?? undefined : undefined
}

function parseRewindDateFromSessionId(sessionId: string): Date | null {
  const prefix = sessionId.replace(/-/g, '').slice(0, 12)
  if (!/^[\da-f]{12}$/i.test(prefix)) {
    return null
  }
  const millis = Number.parseInt(prefix, 16)
  if (!Number.isFinite(millis) || millis <= 0) {
    return null
  }
  return toValidRewindDate(millis)
}

function toValidRewindDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

function normalizeRewindString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function syncAgentStateFromSessionManager(session: any, sessionManager: any): void {
  const context = sessionManager.buildSessionContext?.()
  if (!context || !session?.agent?.state) {
    return
  }
  if (Array.isArray(context.messages)) {
    session.agent.state.messages = context.messages
  }
}

interface LinxRewindMessageItem {
  id: string
  text: string
}

function collectRewindUserMessages(_session: any, sessionManager: any): LinxRewindMessageItem[] {
  return getActiveSessionBranch(sessionManager)
    .filter((entry) => entry?.type === 'message' && entry.message?.role === 'user')
    .map((entry) => ({
      id: String(entry.id),
      text: extractRewindMessageText(entry.message?.content) || '(empty user message)',
    }))
}

function extractRewindMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .filter((part): part is { type: string; text?: unknown } => typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'text')
    .map((part) => typeof part.text === 'string' ? part.text : '')
    .join('')
}

class LinxRewindMessageList {
  private selectedIndex: number
  onSelect?: (entryId: string) => void
  onCancel?: () => void
  private readonly maxVisible = 10

  constructor(
    private readonly messages: LinxRewindMessageItem[],
    initialSelectedId?: string,
  ) {
    const initialIndex = initialSelectedId
      ? messages.findIndex((message) => message.id === initialSelectedId)
      : -1
    this.selectedIndex = initialIndex >= 0 ? initialIndex : Math.max(0, messages.length - 1)
  }

  invalidate(): void {
    // No cached render state.
  }

  render(width: number): string[] {
    const lines: string[] = []
    if (this.messages.length === 0) {
      return ['  No user messages found']
    }

    const startIndex = Math.max(0, Math.min(
      this.selectedIndex - Math.floor(this.maxVisible / 2),
      this.messages.length - this.maxVisible,
    ))
    const endIndex = Math.min(startIndex + this.maxVisible, this.messages.length)

    for (let index = startIndex; index < endIndex; index += 1) {
      const message = this.messages[index]
      const isSelected = index === this.selectedIndex
      const cursor = isSelected ? '> ' : '  '
      const normalized = message.text.replace(/\n/g, ' ').trim()
      lines.push(`${cursor}${truncateToWidth(normalized, Math.max(1, width - 2))}`)
      lines.push(`  Rewind before message ${index + 1} of ${this.messages.length}`)
      lines.push('')
    }

    if (startIndex > 0 || endIndex < this.messages.length) {
      lines.push(`  (${this.selectedIndex + 1}/${this.messages.length})`)
    }
    return lines
  }

  handleInput(keyData: string): void {
    const keybindings = getKeybindings()
    if (keybindings.matches(keyData, 'tui.select.up')) {
      this.selectedIndex = this.selectedIndex === 0 ? this.messages.length - 1 : this.selectedIndex - 1
      return
    }
    if (keybindings.matches(keyData, 'tui.select.down')) {
      this.selectedIndex = this.selectedIndex === this.messages.length - 1 ? 0 : this.selectedIndex + 1
      return
    }
    if (keybindings.matches(keyData, 'tui.select.confirm')) {
      const selected = this.messages[this.selectedIndex]
      if (selected) {
        this.onSelect?.(selected.id)
      }
      return
    }
    if (keybindings.matches(keyData, 'tui.select.cancel')) {
      this.onCancel?.()
    }
  }
}

class LinxRewindMessageSelectorComponent extends Container {
  private readonly messageList: LinxRewindMessageList

  constructor(
    messages: LinxRewindMessageItem[],
    onSelect: (entryId: string) => void,
    onCancel: () => void,
    initialSelectedId?: string,
  ) {
    super()
    this.addChild(new Spacer(1))
    this.addChild(new Text('Rewind to Message', 1, 0))
    this.addChild(new Text('Select the first user message to remove from the active branch.', 1, 0))
    this.addChild(new Text('The selected message and everything after it stay in history but leave the active context.', 1, 0))
    this.addChild(new Spacer(1))
    this.messageList = new LinxRewindMessageList(messages, initialSelectedId)
    this.messageList.onSelect = onSelect
    this.messageList.onCancel = onCancel
    this.addChild(this.messageList)
    this.addChild(new Spacer(1))

    if (messages.length === 0) {
      setTimeout(() => onCancel(), 100)
    }
  }

  getMessageList(): LinxRewindMessageList {
    return this.messageList
  }
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
      'User-visible state: the input bar shows托管中; Ctrl+C or /auto off hands control back to you.',
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

async function changeInteractiveCwd(interactive: any, runtime: any, target: string | undefined): Promise<void> {
  if (!target) {
    interactive.showStatus?.(`Current workspace: ${resolveInteractiveCwd(interactive, runtime)}`)
    interactive.ui?.requestRender?.()
    return
  }

  const nextCwd = resolve(resolveInteractiveCwd(interactive, runtime), target)
  if (!existsSync(nextCwd)) {
    interactive.showError?.(`Workspace not found: ${nextCwd}`)
    interactive.ui?.requestRender?.()
    return
  }
  if (!statSync(nextCwd).isDirectory()) {
    interactive.showError?.(`Workspace is not a directory: ${nextCwd}`)
    interactive.ui?.requestRender?.()
    return
  }

  process.chdir(nextCwd)
  setRuntimeCwd(interactive, runtime, nextCwd)
  await runtime?.backendCommandRouter?.setCwd?.(nextCwd)
  interactive.showStatus?.(`Workspace changed to ${nextCwd}. Session history stays in the current thread.`)
  interactive.ui?.requestRender?.()
}

function resolveInteractiveCwd(interactive: any, runtime: any): string {
  const candidates = [
    interactive?.session?.cwd,
    runtime?.cwd,
    interactive?.sessionManager?.getCwd?.(),
    interactive?.session?.sessionManager?.getCwd?.(),
    process.cwd(),
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }
  return process.cwd()
}

function setRuntimeCwd(interactive: any, runtime: any, cwd: string): void {
  if (interactive?.session && typeof interactive.session === 'object') {
    interactive.session.cwd = cwd
  }
  if (runtime && typeof runtime === 'object') {
    runtime.cwd = cwd
  }
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
        const source = await resolveSymphonySourceContext(this)
        const idea = await captureSymphonyIdeaIfNeeded(input, source)
        getSessionControlManager(this, this.runtime).recordUserMessage({ text: input })
        if (shouldDispatchSymphonyWorkerInput(input)) {
          await dispatchSymphonyWorkerFromInteractive(this, input, source)
          return
        }
        await originalSubmit(buildSymphonyDelegationPrompt(input, {
          persistentMode: true,
          ...(source ? { source } : {}),
          ...(idea ? { idea } : {}),
        }))
        return
      }

      await originalSubmit(text)
    }

    return result
  }

  interactive.__linxSymphonyCommandInstalled = true
}

export function installSymphonyAutocomplete(interactive: any): void {
  installLinxCommandAutocomplete(interactive)
}

export function installLinxCommandAutocomplete(interactive: any): void {
  if (interactive.__linxCommandAutocompleteInstalled || interactive.__linxSymphonyAutocompleteInstalled) {
    return
  }

  const setupName = typeof interactive.setupAutocompleteProvider === 'function'
    ? 'setupAutocompleteProvider'
    : 'setupAutocomplete'
  const originalSetup = interactive[setupName]?.bind(interactive)
  if (typeof originalSetup !== 'function') {
    return
  }

  interactive[setupName] = function patchedLinxSetupAutocompleteProvider(...args: unknown[]): unknown {
    const result = originalSetup(...args)
    installLinxAutocompleteCommands(this.autocompleteProvider)
    return result
  }

  interactive.__linxCommandAutocompleteInstalled = true
  interactive.__linxSymphonyAutocompleteInstalled = true
}

function installLinxAutocompleteCommands(provider: { commands?: unknown[] } | undefined): void {
  if (!Array.isArray(provider?.commands)) {
    return
  }

  for (const command of LINX_INTERACTIVE_SLASH_COMMANDS) {
    if (!provider.commands.some((existing) => getAutocompleteCommandName(existing) === command.name)) {
      provider.commands.push(command)
    }
  }
}

const LINX_INTERACTIVE_SLASH_COMMANDS = [
  {
    name: 'auto',
    argumentHint: 'on|off|status',
    description: 'toggle AI Secretary driving for this session',
    getArgumentCompletions: (prefix: string) => completeStaticArguments(prefix, [
      { value: 'on', description: 'Secretary drives the session and asks when blocked' },
      { value: 'off', description: 'User drives the session directly' },
      { value: 'status', description: 'Show whether Secretary driving is enabled' },
    ]),
  },
  {
    name: 'cd',
    argumentHint: '<dir>',
    description: 'change workspace for this LinX session',
  },
  {
    name: 'goal',
    argumentHint: '<peer-command>',
    description: 'send a goal command to the current chat peer',
  },
  {
    name: 'rewind',
    description: 'select a user message and rewind the active branch before it',
  },
  {
    name: 'ai',
    argumentHint: 'connect <provider>',
    description: 'connect AI provider credentials to LinX Pod settings',
    getArgumentCompletions: completeAiArguments,
  },
  {
    name: 'symphony',
    argumentHint: 'on|off|status',
    description: 'switch chat peer between Secretary and backend worker',
    getArgumentCompletions: (prefix: string) => completeStaticArguments(prefix, [
      { value: 'on', description: 'Chat with Secretary using Symphony orchestration skills' },
      { value: 'off', description: 'Chat directly with the current worker/backend peer' },
      { value: 'status', description: 'Show Symphony state and source conversation' },
    ]),
  },
] as const

function completeStaticArguments(prefix: string, options: Array<{ value: string; description: string }>): Array<{ value: string; label: string; description: string }> | null {
  const normalized = prefix.trimStart().toLowerCase()
  const matches = options.filter((option) => option.value.startsWith(normalized))
  if (matches.length === 0) {
    return null
  }
  return matches.map((option) => ({
    value: option.value,
    label: option.value,
    description: option.description,
  }))
}

function completeAiArguments(prefix: string): Array<{ value: string; label: string; description: string }> | null {
  const input = prefix.trimStart().toLowerCase()
  if (!input || 'connect'.startsWith(input)) {
    return [{
      value: 'connect ',
      label: 'connect',
      description: 'Connect an AI provider key to LinX Pod AI settings',
    }]
  }

  const connectPrefix = 'connect '
  if (!input.startsWith(connectPrefix)) {
    return null
  }

  const providerPrefix = input.slice(connectPrefix.length)
  const providers = getAiConnectCompletionProviders()
  const matches = providers.filter((provider) => provider.startsWith(providerPrefix))
  if (matches.length === 0) {
    return null
  }

  return matches.map((provider) => ({
    value: `connect ${provider}`,
    label: provider,
    description: `Connect ${provider} credentials`,
  }))
}

function getAiConnectCompletionProviders(): string[] {
  const providerIds: string[] = []
  const aliases: string[] = []
  for (const entry of getAIConfigProviderCatalog()) {
    providerIds.push(entry.id)
    aliases.push(...(entry.aliases ?? []))
  }
  return Array.from(new Set([...providerIds, ...aliases]))
}

function getAutocompleteCommandName(command: unknown): string | undefined {
  if (!command || typeof command !== 'object') {
    return undefined
  }
  const value = 'name' in command
    ? (command as { name?: unknown }).name
    : 'value' in command
      ? (command as { value?: unknown }).value
      : undefined
  return typeof value === 'string' ? value : undefined
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
    ? [
      'Symphony on: you are now chatting with Secretary.',
      'What changed: following normal messages enter the Secretary control lane before worker/backend routing.',
      'Skills: issue triage, existing Issue lookup, create/update/ask decision, task split, worker dispatch, status/report tracking.',
      'Ordinary chat stays ordinary Message; only trackable work becomes Issue/Task/Delivery/Session.',
      'Use /symphony status to inspect workers, /symphony off to chat with the current worker/backend peer.',
    ].join('\n')
    : [
      'Symphony off: you are now chatting with the current worker/backend peer.',
      'What changed: following messages bypass Secretary Symphony triage and dispatch.',
      'Current Symphony dispatches started from this TUI were cancelled; archived workers remain inspectable with /symphony status.',
      'Use /symphony on to chat with Secretary again.',
    ].join('\n')
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

function shouldDispatchSymphonyWorkerInput(input: string): boolean {
  const normalized = input.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  return /\b(delegate|dispatch|assign|worker|agent|task)\b/u.test(normalized)
    || /(派工|派活|派发|委派|分派|交给.*(worker|agent|codex|claude|codebuddy|ai)|让.*(worker|agent|codex|claude|codebuddy|ai).*做|发一个任务|派出一个任务)/u.test(input)
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

  interactive.showStatus?.([
    'Symphony dispatch started.',
    `Worker backend: ${backend}`,
    `Worker credentials: ${workerCredentialSource}`,
    ...(agentRuntime ? [`Control runtime: ${formatSymphonyControlRuntime(agentRuntime)}`] : []),
    ...(workerModel ? [`Worker model: ${workerModel}`] : []),
    workerGoalMode
      ? `Worker goal: on · supervisor interval=${formatSymphonySupervisorInterval(workerSupervisorIntervalMs)}`
      : 'Worker goal: off',
    'Status: creating Issue / Task / Delivery and starting a quiet worker session.',
    'Use /symphony status to inspect running workers and reports.',
  ].join('\n'))
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
    persistSymphonyProjectionToPod(plan, options) {
      return persistSymphonyProjectionToPod(plan, {
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
      ? 'Symphony dispatch completed.'
      : 'Symphony dispatch recorded.',
    `Issue: ${plan.issue.title} (${formatSymphonyResourceTail(plan.issue.uri) ?? plan.issue.uri})`,
    `Task: ${formatSymphonyResourceTail(worker?.task ?? plan.task) ?? worker?.task ?? plan.task}`,
    `Delivery: ${delivery.status}${delivery.autoModeSessionId ? ` · runtime=${delivery.autoModeSessionId}` : ''}`,
    `Worker session: ${session.status}${session.autoModeSessionId ? ` · runtime=${session.autoModeSessionId}` : ''}`,
    'Use /symphony status to inspect the Pod-projected worker report.',
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
      .catch(() => null)
    if (!persisted) {
      writeSymphonyIdea(idea)
    }
    return {
      uri: idea.uri,
      summary: idea.summary,
      status: idea.status,
      commitment: idea.commitment,
    }
  } catch {
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

function buildSymphonyDelegationPrompt(
  objective: string,
  options: {
    persistentMode: boolean
    source?: SymphonySourceContext
    idea?: CapturedSymphonyIdeaContext
  },
): string {
  const modeLine = options.persistentMode
    ? 'Symphony is on: the user is chatting with Secretary in this LinX TUI session.'
    : 'This is a chat-driven Symphony request from the LinX TUI.'
  const sourceLines = options.source
    ? [
      '',
      'Source conversation resources:',
      `Chat: ${options.source.chat}`,
      `Thread: ${options.source.thread}`,
      ...(options.source.sessionId ? [`Runtime session: ${options.source.sessionId}`] : []),
    ]
    : []
  const ideaLines = options.idea
    ? [
      '',
      'Captured Idea:',
      `Idea: ${options.idea.uri}`,
      `Summary: ${options.idea.summary}`,
      `Commitment: ${options.idea.commitment}`,
      `Status: ${options.idea.status}`,
    ]
    : []
  return [
    'AI Secretary Symphony request.',
    modeLine,
    ...sourceLines,
    ...ideaLines,
    '',
    'User objective:',
    objective.trim(),
    '',
    'Act as AI Secretary with Symphony skills enabled: issue triage, existing issue lookup, create/update/ask decision, task split, worker dispatch, and status/report tracking.',
    'Decide whether this objective should be delegated to backend workers through Symphony.',
    'Do not create an Issue for ordinary chat. Create or update an Issue only when the objective is a trackable work item.',
    'If this is an uncommitted fragment, keep or merge it as an Idea first; do not dispatch a worker until promotion gates are met.',
    'Before creating a new Issue, compare against existing open Issues. Update the existing Issue when it is clearly the same work item, and ask the user only when new-vs-existing is ambiguous.',
    'Every delegation must target a Chat resource. Use a personal AI contact chat when assigning to one worker, or a group chat when the work belongs in a shared room.',
    'Use the Source conversation resources only as provenance unless they are also the correct target chat.',
    'If delegation is appropriate, create or update the normal LinX work context, derive issue/task acceptance criteria from the objective and source context, and project the task to the selected backend worker.',
    'Ask the user only when acceptance, authority, credentials, or target selection cannot be safely inferred.',
    'If delegation is not appropriate, explain the reason and continue in this conversation.',
    'Keep the user-facing answer concise and show the next observable step.',
  ].join('\n')
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
  const projectionErrors = Array.from(new Set([
    workersRead.error,
    issuesRead.error,
    reportsRead.error,
  ].filter((item): item is string => Boolean(item))))
  const projectionSources = new Set([workersRead.source, issuesRead.source, reportsRead.source])
  const lines = [
    `Symphony is ${enabled ? 'on' : 'off'}.`,
    `Current chat peer: ${enabled ? 'Secretary' : 'worker/backend peer'}.`,
    `Open issues: ${issues.length}`,
    `Running workers: ${workers.length}`,
    `Recent reports: ${reports.length}`,
    projectionErrors.length > 0
      ? `Pod projection: unavailable (${formatSymphonyStatusError(projectionErrors[0]!)})`
      : projectionSources.has('pod')
        ? 'Pod projection: active.'
        : 'Pod projection: local archive only.',
    'Skills: issue triage, existing issue lookup, create/update/ask decision, task split, worker dispatch, status/report tracking.',
    'Delegation target: AI Secretary must choose a Chat resource before dispatch.',
    'Allowed targets: personal AI contact chat or group chat.',
    'Thread role: concrete work timeline under the selected Chat.',
    'Session role: backend runtime lifecycle only.',
  ]
  if (projectionErrors.length > 0) {
    lines.push('Fallback: showing local Symphony archive while Pod projection is unavailable.')
  }

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
  const projectionRuntime = interactive?.__linxSymphonyPodProjectionRuntime
  let projectionError: string | undefined
  try {
    if (projectionRuntime?.issueResource) {
      const podIssues = await withSymphonyStatusTimeout(
        interactive,
        'Symphony Pod issue status',
        listOpenSymphonyIssuesFromPod({ runtime: projectionRuntime }),
      )
      if (podIssues) {
        return { items: podIssues, source: 'pod' }
      }
    }
  } catch (error) {
    projectionError = error instanceof Error ? error.message : String(error)
    // Fall back to local no-Pod archive below.
  }

  try {
    const issues = typeof interactive?.__linxListSymphonyIssues === 'function'
      ? interactive.__linxListSymphonyIssues()
      : listSymphonyIssues()
    return {
      items: issues.filter((issue: SymphonyIssueStatus) => issue.status !== 'closed' && issue.status !== 'resolved'),
      source: 'local',
      ...(projectionError ? { error: projectionError } : {}),
    }
  } catch {
    return { items: [], source: 'none', ...(projectionError ? { error: projectionError } : {}) }
  }
}

async function listRunningSymphonyWorkers(interactive: any): Promise<SymphonyStatusRead<SymphonyWorkerStatus>> {
  const projectionRuntime = interactive?.__linxSymphonyPodProjectionRuntime
  let projectionError: string | undefined
  try {
    if (projectionRuntime?.sessionResource) {
      const podWorkers = await withSymphonyStatusTimeout(
        interactive,
        'Symphony Pod worker status',
        listRunningSymphonyWorkersFromPod({ runtime: projectionRuntime }),
      )
      if (podWorkers) {
        return { items: podWorkers, source: 'pod' }
      }
    }
  } catch (error) {
    projectionError = error instanceof Error ? error.message : String(error)
  }

  try {
    if (typeof interactive?.__linxListSymphonySessions === 'function') {
      const sessions = interactive.__linxListSymphonySessions()
      return {
        items: sessions.filter((session: ReturnType<typeof listSymphonySessions>[number]) => session.status === 'running'),
        source: 'local',
        ...(projectionError ? { error: projectionError } : {}),
      }
    }

    return {
      items: listSymphonySessions()
        .filter((session: ReturnType<typeof listSymphonySessions>[number]) => session.status === 'running'),
      source: 'local',
      ...(projectionError ? { error: projectionError } : {}),
    }
  } catch {
    return { items: [], source: 'none', ...(projectionError ? { error: projectionError } : {}) }
  }
}

async function listRecentSymphonyReports(interactive: any): Promise<SymphonyStatusRead<SymphonyReportStatus>> {
  const projectionRuntime = interactive?.__linxSymphonyPodProjectionRuntime
  let projectionError: string | undefined
  try {
    if (projectionRuntime?.deliveryResource) {
      const podReports = await withSymphonyStatusTimeout(
        interactive,
        'Symphony Pod report status',
        listRecentSymphonyReportsFromPod({
          runtime: projectionRuntime,
          limit: 5,
        }),
      )
      if (podReports) {
        return { items: podReports, source: 'pod' }
      }
    }
  } catch (error) {
    projectionError = error instanceof Error ? error.message : String(error)
    // Fall back to local no-Pod archive below.
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
      ...(projectionError ? { error: projectionError } : {}),
    }
  } catch {
    return { items: [], source: 'none', ...(projectionError ? { error: projectionError } : {}) }
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
  command: Extract<LinxGlobalCommand, { action: 'ai-connect' }>,
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

function installLinxCwdStartupNotice(interactive: any, sessionCwd: string): void {
  const originalInit = interactive.init?.bind(interactive)
  if (typeof originalInit !== 'function') return

  interactive.init = async function patchedInit(...args: unknown[]): Promise<unknown> {
    const result = await originalInit(...args)

    const storedCwd = interactive?.session?.cwd ?? sessionCwd
    const currentCwd = process.cwd()

    if (currentCwd !== storedCwd) {
      setTimeout(() => {
        process.stdout.write(
          `\n\x1b[33m  Session was at ${storedCwd}\x1b[0m\n` +
          `\x1b[33m  You're now at  ${currentCwd}\x1b[0m\n`
        )
      }, 300)
    }

    return result
  }
}

export function installLinxEscapeInterrupt(interactive: any): void {
  const editor = interactive?.defaultEditor
  if (!editor || editor.__linxEscapeInterruptInstalled) {
    return
  }

  const initialOnEscape = typeof editor.onEscape === 'function'
    ? editor.onEscape
    : undefined
  let currentOnEscape = isLinxEscapeInterruptWrapper(initialOnEscape)
    ? undefined
    : initialOnEscape

  const linxEscapeInterrupt = function linxEscapeInterrupt(): void {
    const session = interactive?.session

    if (handBackAutoControlOnInterrupt(interactive)) {
      return
    }

    if (session?.isBashRunning && typeof session.abortBash === 'function') {
      void session.abortBash()
      return
    }

    if (isLinxSessionRunning(interactive) && typeof session?.abort === 'function') {
      void session.abort()
      return
    }

    currentOnEscape?.call(editor)
  }
  Object.defineProperty(linxEscapeInterrupt, '__linxEscapeInterruptWrapper', {
    value: true,
  })

  Object.defineProperty(editor, 'onEscape', {
    configurable: true,
    get() {
      return linxEscapeInterrupt
    },
    set(next: unknown) {
      if (isLinxEscapeInterruptWrapper(next)) {
        return
      }
      currentOnEscape = typeof next === 'function' ? next : undefined
    },
  })

  installLinxClearInterrupt(interactive, editor)
  editor.__linxEscapeInterruptInstalled = true
}

function isLinxEscapeInterruptWrapper(value: unknown): boolean {
  return typeof value === 'function'
    && (value as { __linxEscapeInterruptWrapper?: unknown }).__linxEscapeInterruptWrapper === true
}

function installLinxClearInterrupt(interactive: any, editor: any): void {
  const handlers = editor?.actionHandlers
  if (!(handlers instanceof Map) || editor.__linxClearInterruptInstalled) {
    return
  }

  const originalClear = handlers.get('app.clear')
  handlers.set('app.clear', () => {
    if (handBackAutoControlOnInterrupt(interactive)) {
      return
    }
    originalClear?.call(editor)
  })
  editor.__linxClearInterruptInstalled = true
}

function handBackAutoControlOnInterrupt(interactive: any): boolean {
  if (interactive?.__autoEnabled !== true) {
    return false
  }

  const session = interactive?.session
  if (session?.isBashRunning && typeof session.abortBash === 'function') {
    void session.abortBash()
  } else if (isLinxSessionRunning(interactive) && typeof session?.abort === 'function') {
    void session.abort()
  }

  void handleInteractiveAutoCommand(interactive, interactive?.runtime, false)
  return true
}

function isLinxSessionRunning(interactive: any): boolean {
  return interactive?.session?.isStreaming === true
    || Boolean(interactive?.loadingAnimation)
    || Boolean(interactive?.autoCompactionEscapeHandler)
    || Boolean(interactive?.retryEscapeHandler)
}

function patchInteractiveExitMessage(interactive: any): void {
  const originalInit = interactive.init?.bind(interactive)
  const originalStop = interactive.stop?.bind(interactive)
  let initialized = false
  let exitMessageWritten = false

  if (typeof originalInit === 'function') {
    interactive.init = async function patchedInit(...args: unknown[]): Promise<unknown> {
      const result = await originalInit(...args)
      initialized = true
      return result
    }
  }

  if (typeof originalStop !== 'function') {
    return
  }

  interactive.stop = function patchedStop(...args: unknown[]): void {
    originalStop(...args)
    if (!initialized || exitMessageWritten || process.env.LINX_TUI_NO_EXIT_MESSAGE === '1') {
      return
    }
    exitMessageWritten = true
    if (process.stdout.isTTY) {
      process.stdout.write(`\n${buildLinxExitMessage(this)}\n`)
    }
  }
}

export function buildLinxExitMessage(interactive: any): string {
  const sessionId = interactive?.session?.sessionId
    ?? interactive?.sessionManager?.getSessionId?.()
    ?? interactive?.session?.sessionManager?.getSessionId?.()
  const usage = calculateSessionUsage(interactive?.session)
  const lines = ['LinX session closed.']

  if (usage.input > 0 || usage.output > 0 || usage.cacheRead > 0 || usage.cacheWrite > 0) {
    const usageParts = [
      `input ${formatTokenCount(usage.input)}`,
      `output ${formatTokenCount(usage.output)}`,
    ]
    if (usage.cacheRead > 0 || usage.cacheWrite > 0) {
      usageParts.push(`cache ${usage.cacheRate ?? 0}%`)
    }
    lines.push(`Token usage: ${usageParts.join(' · ')}`)
  }

  if (typeof sessionId === 'string' && sessionId.trim()) {
    lines.push(`Resume: linx --session ${sessionId}`)
  }

  return lines.join('\n')
}

export function installLinxResumeOutputStyle(): () => void {
  if (linxResumeOutputStyleRestore) {
    return linxResumeOutputStyleRestore
  }

  const originalWrite = process.stdout.write
  const originalErrorWrite = process.stderr.write
  const stdoutFilter = createPiResumeOutputFilter()
  const stderrFilter = createPiResumeOutputFilter()
  const patchedStdoutWrite = function patchedPersistentLinxStdoutWrite(
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error) => void),
    callback?: (error?: Error) => void,
  ): boolean {
    return writeWithPiResumeFilter(process.stdout, originalWrite, stdoutFilter, chunk, encodingOrCallback, callback)
  } as typeof process.stdout.write
  const patchedStderrWrite = function patchedPersistentLinxStderrWrite(
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error) => void),
    callback?: (error?: Error) => void,
  ): boolean {
    return writeWithPiResumeFilter(process.stderr, originalErrorWrite, stderrFilter, chunk, encodingOrCallback, callback)
  } as typeof process.stderr.write

  process.stdout.write = patchedStdoutWrite
  process.stderr.write = patchedStderrWrite

  linxResumeOutputStyleRestore = () => {
    flushPiResumeOutputFilter(process.stdout, originalWrite, stdoutFilter)
    flushPiResumeOutputFilter(process.stderr, originalErrorWrite, stderrFilter)
    if (process.stdout.write === patchedStdoutWrite) {
      process.stdout.write = originalWrite
    }
    if (process.stderr.write === patchedStderrWrite) {
      process.stderr.write = originalErrorWrite
    }
    linxResumeOutputStyleRestore = null
  }

  return linxResumeOutputStyleRestore
}

export async function withLinxResumeOutputStyle<T>(run: () => Promise<T>): Promise<T> {
  const originalWrite = process.stdout.write
  const originalErrorWrite = process.stderr.write
  const stdoutFilter = createPiResumeOutputFilter()
  const stderrFilter = createPiResumeOutputFilter()
  process.stdout.write = function patchedLinxStdoutWrite(
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error) => void),
    callback?: (error?: Error) => void,
  ): boolean {
    return writeWithPiResumeFilter(process.stdout, originalWrite, stdoutFilter, chunk, encodingOrCallback, callback)
  } as typeof process.stdout.write
  process.stderr.write = function patchedLinxStderrWrite(
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error) => void),
    callback?: (error?: Error) => void,
  ): boolean {
    return writeWithPiResumeFilter(process.stderr, originalErrorWrite, stderrFilter, chunk, encodingOrCallback, callback)
  } as typeof process.stderr.write

  try {
    const result = await run()
    await new Promise((resolve) => setImmediate(resolve))
    return result
  } finally {
    flushPiResumeOutputFilter(process.stdout, originalWrite, stdoutFilter)
    flushPiResumeOutputFilter(process.stderr, originalErrorWrite, stderrFilter)
    process.stdout.write = originalWrite
    process.stderr.write = originalErrorWrite
  }
}

/** @deprecated Use withLinxResumeOutputStyle. */
export const withSuppressedPiResumeOutput = withLinxResumeOutputStyle

interface PiResumeOutputFilter {
  pending: string
  suppressing: boolean
}

function createPiResumeOutputFilter(): PiResumeOutputFilter {
  return { pending: '', suppressing: false }
}

function writeWithPiResumeFilter(
  stream: NodeJS.WriteStream,
  originalWrite: typeof process.stdout.write,
  filter: PiResumeOutputFilter,
  chunk: string | Uint8Array,
  encodingOrCallback?: BufferEncoding | ((error?: Error) => void),
  callback?: (error?: Error) => void,
): boolean {
  const text = typeof chunk === 'string'
    ? chunk
    : Buffer.isBuffer(chunk) || chunk instanceof Uint8Array
      ? Buffer.from(chunk).toString('utf8')
      : ''
  if (!text) {
    return originalWrite.call(stream, chunk as never, encodingOrCallback as never, callback as never)
  }

  const output = filterPiResumeOutputText(text, filter)
  if (!output) {
    const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback
    done?.()
    return true
  }
  if (output === text && !filter.pending) {
    return originalWrite.call(stream, chunk as never, encodingOrCallback as never, callback as never)
  }
  return originalWrite.call(stream, output, encodingOrCallback as never, callback as never)
}

function flushPiResumeOutputFilter(
  stream: NodeJS.WriteStream,
  originalWrite: typeof process.stdout.write,
  filter: PiResumeOutputFilter,
): void {
  const pending = filter.pending
  filter.pending = ''
  if (filter.suppressing) {
    filter.suppressing = false
    return
  }
  if (!pending || isPotentialPiResumeOutput(pending)) {
    return
  }
  originalWrite.call(stream, pending)
}

function filterPiResumeOutputText(text: string, filter: PiResumeOutputFilter): string {
  let input = filter.pending + text
  filter.pending = ''
  let output = ''

  while (input) {
    const newlineIndex = input.indexOf('\n')
    if (newlineIndex >= 0) {
      const line = input.slice(0, newlineIndex + 1)
      if (filter.suppressing) {
        filter.suppressing = false
      } else if (!isPiResumeOutput(line)) {
        output += line
      }
      input = input.slice(newlineIndex + 1)
      continue
    }

    if (filter.suppressing) {
      return output
    }

    if (isPiResumeOutput(input)) {
      filter.suppressing = true
      return output
    }

    if (isPotentialPiResumeOutput(input)) {
      filter.pending = input
      return output
    }

    output += input
    return output
  }

  return output
}

function isPiResumeOutput(text: string): boolean {
  if (!text) {
    return false
  }
  const plain = stripAnsi(text)
  return /To resume this session:\s*pi\s+--session(?:-dir|\s)/u.test(plain)
    || /To resume this session:\s*pi\s+/u.test(plain)
}

function isPotentialPiResumeOutput(text: string): boolean {
  const plain = stripAnsi(text).trimStart()
  if (!plain || plain.length >= 512) {
    return false
  }

  const marker = 'To resume this session:'
  if (marker.startsWith(plain)) {
    return true
  }
  if (!plain.startsWith(marker)) {
    return false
  }

  const commandPrefix = plain.slice(marker.length).trimStart()
  return !commandPrefix
    || 'pi --session-dir'.startsWith(commandPrefix)
    || 'pi --session'.startsWith(commandPrefix)
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/gu, '')
}

function patchPiFooter(): void {
  if (footerPatched) {
    return
  }

  const originalRender = FooterComponent.prototype.render
  FooterComponent.prototype.render = function patchedRender(width: number): string[] {
    const lines = originalRender.call(this, width)
    if (Array.isArray(lines) && lines.length > 1 && typeof lines[1] === 'string') {
      const session = (this as unknown as { session?: unknown }).session
      const autoCompactEnabled = (this as unknown as { autoCompactEnabled?: boolean }).autoCompactEnabled !== false
      lines[1] = buildLinxFooterStatusLine(session, width, autoCompactEnabled)
    }
    return lines
  }
  footerPatched = true
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

function buildLinxFooterStatusLine(session: any, width: number, autoCompactEnabled: boolean): string {
  const usage = calculateSessionUsage(session)
  const state = session?.state ?? {}
  const model = state.model ?? {}
  const parts: string[] = []

  if (usage.input > 0) {
    parts.push(`↑${formatTokenCount(usage.input)}`)
  }
  if (usage.output > 0) {
    parts.push(`↓${formatTokenCount(usage.output)}`)
  }

  parts.push(formatContextUsage(session, model, autoCompactEnabled))

  if (usage.cacheRate !== null) {
    parts.push(`cache ${usage.cacheRate}%`)
  }

  parts.push(typeof model.id === 'string' && model.id ? model.id : 'no-model')
  if (model.reasoning) {
    const thinkingLevel = typeof state.thinkingLevel === 'string' && state.thinkingLevel
      ? state.thinkingLevel
      : 'off'
    parts.push(thinkingLevel === 'off' ? 'thinking off' : thinkingLevel)
  }

  return fitFooterLine(parts.join(' • '), width)
}

function fitFooterLine(line: string, width: number): string {
  const truncated = truncateToWidth(line, width)
  const visible = visibleWidth(truncated)
  const padded = visible < width ? `${truncated}${' '.repeat(width - visible)}` : truncated

  return `\x1b[2m${padded}\x1b[22m`
}

function calculateSessionUsage(session: any): {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cacheRate: number | null
} {
  const entries = session?.sessionManager?.getEntries?.()
  if (!Array.isArray(entries)) {
    return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cacheRate: null }
  }

  let input = 0
  let output = 0
  let cacheRead = 0
  let cacheWrite = 0
  for (const entry of entries) {
    const message = entry?.type === 'message' ? entry.message : undefined
    if (message?.role !== 'assistant' || !message.usage) {
      continue
    }
    input += safeTokenCount(message.usage.input)
    output += safeTokenCount(message.usage.output)
    cacheRead += safeTokenCount(message.usage.cacheRead)
    cacheWrite += safeTokenCount(message.usage.cacheWrite)
  }

  const totalPromptTokens = input + cacheRead + cacheWrite
  if (totalPromptTokens <= 0) {
    return { input, output, cacheRead, cacheWrite, cacheRate: null }
  }

  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    cacheRate: Math.round((cacheRead / totalPromptTokens) * 100),
  }
}

function formatContextUsage(session: any, model: any, autoCompactEnabled: boolean): string {
  const contextUsage = session?.getContextUsage?.()
  const contextWindow = safeTokenCount(contextUsage?.contextWindow) || safeTokenCount(model.contextWindow)
  const percent = typeof contextUsage?.percent === 'number' && Number.isFinite(contextUsage.percent)
    ? `${contextUsage.percent.toFixed(1)}%`
    : '?'
  return `${percent}/${formatTokenCount(contextWindow)}${autoCompactEnabled ? ' (auto)' : ''}`
}

function formatTokenCount(count: number): string {
  if (count < 1000) {
    return count.toString()
  }
  if (count < 10000) {
    return `${(count / 1000).toFixed(1)}k`
  }
  if (count < 1000000) {
    return `${Math.round(count / 1000)}k`
  }
  if (count < 10000000) {
    return `${(count / 1000000).toFixed(1)}M`
  }
  return `${Math.round(count / 1000000)}M`
}

function safeTokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}
