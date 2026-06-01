import { InteractiveMode } from '@earendil-works/pi-coding-agent'
import { AssistantMessageComponent, FooterComponent, LoginDialogComponent } from '@earendil-works/pi-coding-agent'
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { connectAiProviderCredential } from '../ai-command.js'
import { getAIConfigProviderCatalog, getAIConfigProviderMetadata } from '../models.js'
import { applyLinxInteractiveBranding, requestLinxCloudLogin } from './branding.js'
import type { BackendCredentialEntry, BackendCredentialInput, BackendCredentialRepairReason } from './backend-credentials.js'
import type { BackendCommandRouter } from './backend-command.js'
import { installPodStatusOutputFilter } from './pod-status-output.js'
import { createPodBackedExtensionUiContext } from './pod-approval.js'
import { buildChatUri, buildThreadUri, DEFAULT_SECRETARY_CHAT_ID } from './pod-mirror-mapping.js'
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
  persistSymphonyIdeaToPod,
  type SymphonyPodReportStatus,
  type SymphonyPodWorkerStatus,
} from '../symphony/pod-projection.js'
import {
  getSessionControlManager,
  installSessionControlRuntimeEventBridge,
} from './session-control.js'

export interface PiInteractiveBootstrap {
  init(): Promise<void>
  run(): Promise<void>
  requestLogin(reason?: LinxLoginReason): void
  requestBackendCredential(details: BackendCredentialInput): Promise<BackendCredentialEntry | null | undefined>
  readonly __unsafeInteractiveForTests?: unknown
  stop(): void
}

export type LinxLoginReason = 'startup' | 'expired' | 'manual'

export interface PiInteractiveBootstrapOptions {
  initialMessage?: string
  initialMessages?: string[]
  restoredAuto?: boolean
  onAutoControlChange?: (enabled: boolean) => void | Promise<void>
  onSymphonyControlChange?: (enabled: boolean) => void | Promise<void>
}

let footerPatched = false
let assistantMessagePatched = false
const BACKEND_OWNED_SLASH_COMMANDS = new Set([
  'commands',
  'models',
  'rollback',
  'status',
])

export function bootstrapPiInteractiveMode(runtime: any, options: PiInteractiveBootstrapOptions = {}): PiInteractiveBootstrap {
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
  if (options.restoredAuto === true && runtime?.autoEnabled === true) {
    installLinxRestoredAutoStartup(interactive as any, runtime, sessionControlManager)
  }

  const bootstrap = {
    async init(): Promise<void> {
      await interactive.init()
      installLinxEscapeInterrupt(interactive as any)
    },
    async run(): Promise<void> {
      await bootstrap.init()
      await interactive.run()
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
  | { action: 'auto'; enabled?: boolean; initialInput?: string }
  | { action: 'cd'; target?: string }
  | { action: 'ai-connect'; provider?: string }

export function installLinxGlobalCommands(
  interactive: any,
  runtime: any,
  sessionCwd: string,
  options: Pick<PiInteractiveBootstrapOptions, 'onAutoControlChange'> = {},
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
      await handleLinxGlobalCommand(this, runtime, command, originalSubmit)
    }

    return result
  }

  interactive.__linxGlobalCommandHandlerInstalled = true
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
  if (input === '/auto' || input === '/auto status') {
    return { action: 'auto' }
  }

  if (input === '/auto on') {
    return { action: 'auto', enabled: true }
  }

  if (input === '/auto off') {
    return { action: 'auto', enabled: false }
  }

  if (input.startsWith('/auto ')) {
    const initialInput = input.slice('/auto'.length).trim()
    if (initialInput && initialInput !== 'on' && initialInput !== 'off' && initialInput !== 'status') {
      return { action: 'auto', enabled: true, initialInput }
    }
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
    return { action: 'ai-connect', provider: input.slice('/ai connect'.length).trim() }
  }

  return null
}

async function handleLinxGlobalCommand(
  interactive: any,
  runtime: any,
  command: LinxGlobalCommand,
  originalSubmit?: (text: string) => Promise<void>,
): Promise<void> {
  if (command.action === 'auto') {
    await handleInteractiveAutoCommand(interactive, runtime, command.enabled, {
      scheduleImmediately: command.initialInput === undefined,
    })
    if (command.initialInput && typeof originalSubmit === 'function') {
      recordSubmittedUserMessage(interactive, runtime, command.initialInput)
      await originalSubmit(command.initialInput)
    }
    return
  }

  if (command.action === 'ai-connect') {
    await handleInteractiveAiConnectCommand(interactive, runtime, command.provider)
    return
  }

  await changeInteractiveCwd(interactive, runtime, command.target)
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
      'Secretary keeps normal chat/status behavior but no longer auto-fills user input.',
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
    name: 'ai',
    argumentHint: 'connect <provider>',
    description: 'connect AI provider credentials to LinX Pod settings',
    getArgumentCompletions: completeAiArguments,
  },
  {
    name: 'symphony',
    argumentHint: 'on|off|status',
    description: 'toggle AI Secretary Symphony delegation for following chat',
    getArgumentCompletions: (prefix: string) => completeStaticArguments(prefix, [
      { value: 'on', description: 'Analyze following chat with Symphony delegation skills' },
      { value: 'off', description: 'Return following messages to normal AI Secretary chat' },
      { value: 'status', description: 'Show Symphony delegation state and source conversation' },
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
      'Symphony delegation enabled.',
      'What changed: following normal messages are analyzed by Secretary with Symphony skills before backend routing.',
      'Skills: issue triage, existing Issue lookup, create/update/ask decision, task split, worker dispatch, status/report tracking.',
      'Ordinary chat stays ordinary Message; only trackable work becomes Issue/Task/Delivery/Session.',
      'Use /symphony status to inspect workers, /symphony off for normal chat.',
    ].join('\n')
    : [
      'Symphony delegation disabled.',
      'What changed: following messages use normal AI Secretary chat instead of Symphony issue triage and worker dispatch.',
      'Existing Symphony workers continue in their own sessions; use /symphony status to inspect them.',
      'Use /symphony on to enable delegation again.',
    ].join('\n')
}

function formatSymphonyUsage(input: string): string {
  return [
    `Unsupported /symphony argument: ${input}`,
    'Use /symphony on to enable chat-driven delegation, /symphony off to disable, or /symphony status to inspect workers.',
    'After enabling Symphony, send the objective as a normal chat message; Secretary will decide whether it is an Issue, update existing work, split tasks, and dispatch workers.',
  ].join('\n')
}

function shouldProjectSymphonyInput(input: string): boolean {
  return Boolean(input)
    && !input.startsWith('/')
    && !input.startsWith('!')
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
    ? 'Symphony delegation mode is currently enabled for this LinX TUI session.'
    : 'This is a chat-driven Symphony delegation request from the LinX TUI.'
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
  const status = interactive.__linxSymphonyModeEnabled ? 'enabled' : 'disabled'
  const [source, workers, issues, reports] = await Promise.all([
    resolveSymphonySourceContext(interactive),
    listRunningSymphonyWorkers(interactive),
    listOpenSymphonyIssues(interactive),
    listRecentSymphonyReports(interactive),
  ])
  const lines = [
    `Symphony delegation is ${status}.`,
    `Open issues: ${issues.length}`,
    `Running workers: ${workers.length}`,
    `Recent reports: ${reports.length}`,
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

  lines.push('Commands: /symphony on enable, /symphony status inspect workers, /symphony off disable.')
  return lines.join('\n')
}

type SymphonyWorkerStatus = SymphonyPodWorkerStatus | ReturnType<typeof listSymphonySessions>[number]
type SymphonyIssueStatus = ReturnType<typeof listSymphonyIssues>[number]
type SymphonyReportStatus = SymphonyPodReportStatus | ReturnType<typeof listSymphonySessions>[number]

async function listOpenSymphonyIssues(interactive: any): Promise<SymphonyIssueStatus[]> {
  const projectionRuntime = interactive?.__linxSymphonyPodProjectionRuntime
  try {
    if (projectionRuntime?.issueResource) {
      const podIssues = await listOpenSymphonyIssuesFromPod({ runtime: projectionRuntime })
      if (podIssues) {
        return podIssues
      }
    }
  } catch {
    // Fall back to local no-Pod archive below.
  }

  try {
    const issues = typeof interactive?.__linxListSymphonyIssues === 'function'
      ? interactive.__linxListSymphonyIssues()
      : listSymphonyIssues()
    return issues.filter((issue: SymphonyIssueStatus) => issue.status !== 'closed' && issue.status !== 'resolved')
  } catch {
    return []
  }
}

async function listRunningSymphonyWorkers(interactive: any): Promise<SymphonyWorkerStatus[]> {
  try {
    const podWorkers = await listRunningSymphonyWorkersFromPod({
      ...(interactive?.__linxSymphonyPodProjectionRuntime ? { runtime: interactive.__linxSymphonyPodProjectionRuntime } : {}),
    })
    if (podWorkers) {
      return podWorkers
    }

    if (typeof interactive?.__linxListSymphonySessions === 'function') {
      const sessions = interactive.__linxListSymphonySessions()
      return sessions.filter((session: ReturnType<typeof listSymphonySessions>[number]) => session.status === 'running')
    }

    return listSymphonySessions()
      .filter((session: ReturnType<typeof listSymphonySessions>[number]) => session.status === 'running')
  } catch {
    return []
  }
}

async function listRecentSymphonyReports(interactive: any): Promise<SymphonyReportStatus[]> {
  const projectionRuntime = interactive?.__linxSymphonyPodProjectionRuntime
  try {
    if (projectionRuntime?.deliveryResource) {
      const podReports = await listRecentSymphonyReportsFromPod({
        runtime: projectionRuntime,
        limit: 5,
      })
      if (podReports) {
        return podReports
      }
    }
  } catch {
    // Fall back to local no-Pod archive below.
  }

  try {
    const sessions = typeof interactive?.__linxListSymphonySessions === 'function'
      ? interactive.__linxListSymphonySessions()
      : listSymphonySessions()
    return sessions
      .filter((session: ReturnType<typeof listSymphonySessions>[number]) => session.status === 'completed' || session.status === 'failed')
      .slice(0, 5)
  } catch {
    return []
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
    chat: buildChatUri(webId),
    thread: buildThreadUri(webId, DEFAULT_SECRETARY_CHAT_ID, trimmedSessionId),
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

async function handleInteractiveAiConnectCommand(interactive: any, runtime: any, providerArg: string | undefined): Promise<void> {
  const providerId = providerArg?.trim()
  if (!providerId) {
    interactive.showStatus?.('Usage: /ai connect <provider> - connect an AI provider key to LinX Pod AI settings.')
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
        baseUrlPrompt: 'API base URL',
        progress: [
          `Connect ${providerLabel} with LinX AI connect.`,
          'LinX will save this provider key to your Pod AI settings, not Pi auth.json.',
        ],
        errorPrefix: `Failed to connect ${providerLabel}`,
      })
    : await promptForApiCredentialWithExtensionInput(interactive, {
        providerId: metadata.id,
        providerLabel,
        apiKeyPrompt: `${providerLabel} API key`,
        baseUrlPrompt: 'API base URL',
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
    const credentialBaseUrl = credential?.baseUrl?.trim()
    const result = await saveCredential({
      provider: credentialProviderId || metadata.id,
      apiKey,
      ...(credentialBaseUrl ? { baseUrl: credentialBaseUrl } : {}),
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

  let currentOnEscape = typeof editor.onEscape === 'function'
    ? editor.onEscape
    : undefined

  Object.defineProperty(editor, 'onEscape', {
    configurable: true,
    get() {
      return function linxEscapeInterrupt(): void {
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
    },
    set(next: unknown) {
      currentOnEscape = typeof next === 'function' ? next : undefined
    },
  })

  installLinxClearInterrupt(interactive, editor)
  editor.__linxEscapeInterruptInstalled = true
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
    lines.push(`Resume: linx resume ${sessionId}`)
  }

  return lines.join('\n')
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
