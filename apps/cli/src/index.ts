#!/usr/bin/env node
import './lib/node-warning-filter.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import yargs, { type Argv, type CommandModule } from 'yargs'
import { hideBin } from 'yargs/helpers'
import { aiCommand } from './lib/ai-command.js'
import { resolveAccountBaseUrl } from './lib/account-api.js'
import { loadCredentials } from './lib/credentials-store.js'
import { loginCommand, logoutCommand, whoamiCommand } from './lib/login-command.js'
import { configCommand } from './lib/status-line-command.js'
import { DefaultPackageManager, SettingsManager, SessionSelectorComponent, initTheme, runPrintMode } from '@earendil-works/pi-coding-agent'
import { ProcessTerminal, TUI } from '@earendil-works/pi-tui'
import { promptText } from './lib/prompt.js'
import {
  buildAutoModeOptions,
  isAutoModeRequest,
  runAutoModeCommand,
  type AutoModeCommandArgs,
} from './lib/auto-mode-command.js'
import { resolveRuntimeTarget } from './lib/runtime-target.js'
import { createCodexNativeProxy, createSymphonyCodexMcpServer } from './lib/codex-plugin/index.js'
import {
  createLinxRuntimeAdapter,
  resolveLinxInteractiveLoginReason,
  resolveLinxStartupLoginPromptDecision,
  type LinxCompletionBackendResult,
} from './lib/pi-adapter/index.js'
import { bootstrapLinxInteractiveMode, type LinxLoginReason } from './lib/linx-interactive-bootstrap.js'
import { isOidcLoginExpiredError } from './lib/oidc-auth.js'
import { clearDefaultPodDataSession, createPodDataSession, getDefaultPodDataSession, type PodDataSession } from './lib/pod-data-session.js'
import { DEFAULT_LINX_CLOUD_MODEL_ID, FALLBACK_LINX_CLOUD_MODEL_IDS } from './lib/default-model.js'
import {
  createLinxPiSessionManager,
  listLinxPiSessions,
} from './lib/linx-session-manager.js'
import { LinxPiPodMirror } from './lib/linx-pod-mirror.js'
import { listPendingPiPodMirrorSync, retryPendingPiPodMirrorSync } from './lib/linx-pod-mirror-sync-recovery.js'
import type { RemoteChatMessage, RemoteChatTool } from './lib/chat-api.js'
import { LINX_AGENT_DIR } from './lib/linx-interactive-branding.js'
import { createFileSyncCheckpointStore } from './lib/sync-checkpoint-store.js'
import { deriveLinxPiStartupControlState, hydrateLinxPiControlState } from './lib/linx-startup-control-state.js'
import { drizzle, solidResources, type SolidDatabase } from './lib/models.js'
import type { RemoteAuthFetch } from './lib/chat-api.js'
import { formatLinxCliErrorMessage } from './lib/linx-cloud-errors.js'

type ChatRole = 'system' | 'user' | 'assistant'

interface ChatMessage {
  role: ChatRole
  content: string
  createdAt?: string
}

interface ThreadSummary {
  id: string
  title?: string
  workspace?: string
}

interface SessionLike {
  logout(): Promise<void>
}

interface ChatRuntime {
  createRemoteCompletion(options: {
    runtimeUrl: string
    authFetch: RemoteAuthFetch
    model?: string
    messages: RemoteChatMessage[]
    tools?: RemoteChatTool[]
  }): Promise<string | LinxCompletionBackendResult>
  listRemoteModels(authFetch: RemoteAuthFetch, runtimeUrl: string, options?: { fallback?: boolean; timeoutMs?: number }): Promise<Array<{
    id: string
    provider?: string
    ownedBy?: string
    contextWindow?: number
  }>>
  createThread(session: unknown, chatId: string, workspace: string, title: string): Promise<string>
  formatThreadLabel(thread: ThreadSummary): string
  getLatestThreadId(session: unknown, chatId: string): Promise<string | null>
  getOrCreateDefaultChat(session: unknown): Promise<string>
  initPodData(session: unknown): Promise<unknown>
  listThreads(session: unknown, chatId: string): Promise<ThreadSummary[]>
  loadMessages(session: unknown, threadId: string): Promise<ChatMessage[]>
  loadThread(session: unknown, threadId: string): Promise<ThreadSummary | null>
  saveAssistantMessage(session: unknown, chatId: string, threadId: string, reply: string): Promise<void>
  saveUserMessage(session: unknown, chatId: string, threadId: string, prompt: string): Promise<void>
  toOpenAiMessages(history: ChatMessage[]): Array<{ role: ChatRole; content: string }>
  authenticate(clientId: string, clientSecret: string, oidcIssuer: string): Promise<{
    session: SessionLike
  }>
  authenticatedFetch(url: string, token: string, init?: RequestInit): Promise<Response>
}

interface RuntimeContext {
  runtimeUrl: string
  authFetch: RemoteAuthFetch
  session: SessionLike
  podSession: PodDataSession
  chatId: string
  runtime: ChatRuntime
}

interface RuntimeAuthContext {
  runtimeUrl: string
  authFetch: RemoteAuthFetch
  session: SessionLike
  podSession: PodDataSession
  runtime: ChatRuntime
}

type LinxPackageCommand = 'install' | 'remove' | 'update' | 'list'

function readPackageVersion(): string {
  try {
    const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
    const pkg = JSON.parse(raw) as { version?: string }
    return typeof pkg.version === 'string' && pkg.version.trim() ? pkg.version.trim() : 'unknown'
  } catch {
    return 'unknown'
  }
}

function formatRemoteModelMetadata(model: { id: string; provider?: string; ownedBy?: string; contextWindow?: number }): string {
  const provider = resolveRemoteModelProviderLabel(model)
  return [provider, model.contextWindow ? `${model.contextWindow}` : '']
    .filter(Boolean)
    .join(' · ')
}

function resolveRemoteModelProviderLabel(model: { id: string; provider?: string; ownedBy?: string }): string | undefined {
  if (FALLBACK_LINX_CLOUD_MODEL_IDS.includes(model.id as typeof FALLBACK_LINX_CLOUD_MODEL_IDS[number])) {
    return 'undefineds'
  }

  return model.provider || model.ownedBy
}

let chatRuntimePromise: Promise<ChatRuntime> | null = null

const RESERVED_NON_TOP_LEVEL_COMMANDS = new Set([
  'automode',
  'footer',
  'resume',
  'status-line',
  'statusline',
  'watch',
])

async function loadChatRuntime(): Promise<ChatRuntime> {
  if (!chatRuntimePromise) {
    chatRuntimePromise = Promise.all([
      import('./lib/chat-api.js'),
      import('./lib/pod-chat-store.js'),
      import('./lib/solid-auth.js'),
    ]).then(([chatApi, podChatStore, solidAuth]) => ({
      createRemoteCompletion: chatApi.createRemoteCompletion,
      listRemoteModels: chatApi.listRemoteModels,
      createThread: podChatStore.createThread,
      formatThreadLabel: podChatStore.formatThreadLabel,
      getLatestThreadId: podChatStore.getLatestThreadId,
      getOrCreateDefaultChat: podChatStore.getOrCreateDefaultChat,
      initPodData: podChatStore.initPodData,
      listThreads: podChatStore.listThreads,
      loadMessages: podChatStore.loadMessages,
      loadThread: podChatStore.loadThread,
      saveAssistantMessage: podChatStore.saveAssistantMessage,
      saveUserMessage: podChatStore.saveUserMessage,
      toOpenAiMessages: podChatStore.toOpenAiMessages,
      authenticate: solidAuth.authenticate,
      authenticatedFetch: solidAuth.authenticatedFetch,
    }))
  }

  return chatRuntimePromise!
}

async function resolveContext(urlOverride?: string): Promise<RuntimeContext> {
  const runtime = await loadChatRuntime()
  const podSession = await createLinxPodDataSession()
  const target = resolveRuntimeTarget({
    issuerUrl: podSession.credentials.url,
    runtimeUrlOverride: urlOverride,
  })
  const session = podSession.solidSession

  await runtime.initPodData(session)
  const chatId = await runtime.getOrCreateDefaultChat(session)

  return { runtimeUrl: target.runtimeUrl, authFetch: podSession.runtimeFetch, session, podSession, chatId, runtime }
}

async function resolveRuntimeAuthContext(urlOverride?: string): Promise<RuntimeAuthContext> {
  const runtime = await loadChatRuntime()
  const podSession = await createLinxPodDataSession()
  const target = resolveRuntimeTarget({
    issuerUrl: podSession.credentials.url,
    runtimeUrlOverride: urlOverride,
  })

  return {
    runtimeUrl: target.runtimeUrl,
    authFetch: podSession.runtimeFetch,
    session: podSession.solidSession,
    podSession,
    runtime,
  }
}

async function createLinxPodDataSession(): Promise<PodDataSession> {
  if (!loadCredentials()) {
    throw new Error('No credentials found. Run `linx login` first.')
  }

  const podSession = await createPodDataSession()
  if (!podSession) {
    throw new Error('Unsupported LinX auth type. Run `linx login` again.')
  }

  return podSession
}

async function resolveStartupLinxPodDataSession(): Promise<PodDataSession | null> {
  if (!loadCredentials()) {
    return null
  }

  return createLinxPodDataSession()
}

async function runSingleTurn(options: {
  ctx: RuntimeContext
  threadId: string
  model?: string
  prompt: string
}): Promise<void> {
  const { ctx, threadId, model, prompt } = options
  const history = await tryLoadMessages(ctx, threadId)

  const reply = await ctx.runtime.createRemoteCompletion({
    runtimeUrl: ctx.runtimeUrl,
    authFetch: ctx.authFetch,
    model,
    messages: [...ctx.runtime.toOpenAiMessages(history), { role: 'user', content: prompt }],
  })

  const replyText = typeof reply === 'string' ? reply : reply.content ?? ''
  process.stdout.write(`\n${replyText}\n\n`)
  await persistSingleTurnBestEffort(ctx, threadId, prompt, replyText)
}

async function tryLoadMessages(ctx: RuntimeContext, threadId: string): Promise<ChatMessage[]> {
  try {
    return await ctx.runtime.loadMessages(ctx.session, threadId)
  } catch (error) {
    process.stderr.write(`Warning: failed to load Pod chat history; continuing without history: ${formatLinxCliErrorMessage(error)}\n`)
    return []
  }
}

async function persistSingleTurnBestEffort(
  ctx: RuntimeContext,
  threadId: string,
  prompt: string,
  replyText: string,
): Promise<void> {
  try {
    await ctx.runtime.saveUserMessage(ctx.session, ctx.chatId, threadId, prompt)
    await ctx.runtime.saveAssistantMessage(ctx.session, ctx.chatId, threadId, replyText)
  } catch (error) {
    process.stderr.write(`Warning: failed to persist Pod chat turn: ${formatLinxCliErrorMessage(error)}\n`)
  }
}

async function resolveThreadId(options: {
  ctx: RuntimeContext
  continueMode?: boolean
  explicitThreadId?: string
  workspace?: string
  bestEffort?: boolean
}): Promise<string> {
  const { ctx, continueMode, explicitThreadId, workspace, bestEffort } = options

  if (explicitThreadId) {
    return explicitThreadId
  }

  if (continueMode) {
    const latest = bestEffort
      ? await tryGetLatestThreadId(ctx)
      : await ctx.runtime.getLatestThreadId(ctx.session, ctx.chatId)
    if (latest) {
      return latest
    }
  }

  if (!bestEffort) {
    return ctx.runtime.createThread(ctx.session, ctx.chatId, workspace || process.cwd(), 'CLI Session')
  }

  try {
    return await ctx.runtime.createThread(ctx.session, ctx.chatId, workspace || process.cwd(), 'CLI Session')
  } catch (error) {
    const fallbackThreadId = `local-${Date.now().toString(36)}`
    process.stderr.write(`Warning: failed to create Pod chat thread; using temporary thread ${fallbackThreadId}: ${formatLinxCliErrorMessage(error)}\n`)
    return fallbackThreadId
  }
}

async function tryGetLatestThreadId(ctx: RuntimeContext): Promise<string | null> {
  try {
    return await ctx.runtime.getLatestThreadId(ctx.session, ctx.chatId)
  } catch (error) {
    process.stderr.write(`Warning: failed to load latest Pod chat thread: ${formatLinxCliErrorMessage(error)}\n`)
    return null
  }
}

async function runInteractive(options: {
  ctx: RuntimeContext
  initialThreadId: string
  initialModel?: string
  initialPrompt?: string
}): Promise<void> {
  const { ctx, initialThreadId, initialModel, initialPrompt } = options
  let threadId = initialThreadId
  let model = initialModel

  process.stdout.write(`LinX CLI ready\nthread: ${threadId}\nmodel: ${model || DEFAULT_LINX_CLOUD_MODEL_ID}\n输入 /hotkeys 查看快捷键。\n\n`)

  if (initialPrompt) {
    await runSingleTurn({ ctx, threadId, model, prompt: initialPrompt })
  }

  while (true) {
    const input = (await promptText('you> ')).trim()
    if (!input) continue

    if (input === '/exit' || input === '/quit') {
      break
    }

    if (input === '/help') {
      process.stdout.write(
        '/hotkeys 查看快捷键\n/threads 列出 threads\n/new 新建 thread\n/use <threadId> 切换 thread\n/model <modelId> 切换模型\n/exit 退出\n\n',
      )
      continue
    }

    if (input === '/threads') {
      const threads = await ctx.runtime.listThreads(ctx.session, ctx.chatId)
      if (threads.length === 0) {
        process.stdout.write('暂无 threads\n\n')
        continue
      }

      process.stdout.write(`${threads.map((thread) => `- ${ctx.runtime.formatThreadLabel(thread)}`).join('\n')}\n\n`)
      continue
    }

    if (input === '/new') {
      threadId = await ctx.runtime.createThread(ctx.session, ctx.chatId, process.cwd(), 'CLI Session')
      process.stdout.write(`已创建 thread: ${threadId}\n\n`)
      continue
    }

    if (input.startsWith('/use ')) {
      const nextThreadId = input.slice(5).trim()
      const thread = await ctx.runtime.loadThread(ctx.session, nextThreadId)
      if (!thread) {
        process.stdout.write(`未找到 thread: ${nextThreadId}\n\n`)
        continue
      }
      threadId = nextThreadId
      process.stdout.write(`已切换到 thread: ${threadId}\n\n`)
      continue
    }

    if (input.startsWith('/model ')) {
      model = input.slice(7).trim() || undefined
      process.stdout.write(`当前模型: ${model || DEFAULT_LINX_CLOUD_MODEL_ID}\n\n`)
      continue
    }

    await runSingleTurn({ ctx, threadId, model, prompt: input })
  }
}

async function runLinxPackageCommand(command: LinxPackageCommand, options: {
  source?: string
  local?: boolean
} = {}): Promise<void> {
  if ((command === 'install' || command === 'remove') && !options.source) {
    throw new Error(`Missing ${command} source. Usage: linx ${command} <source> [-l]`)
  }

  const cwd = process.cwd()
  const settingsManager = SettingsManager.create(cwd, LINX_AGENT_DIR)
  const packageManager = new DefaultPackageManager({
    cwd,
    agentDir: LINX_AGENT_DIR,
    settingsManager,
  })
  packageManager.setProgressCallback((event: { type?: string; message?: string }) => {
    if (event.type === 'start' && event.message) {
      process.stdout.write(`${event.message}\n`)
    }
  })

  switch (command) {
    case 'install':
      await packageManager.installAndPersist(options.source!, { local: Boolean(options.local) })
      process.stdout.write(`Installed ${options.source}\n`)
      return
    case 'remove': {
      const removed = await packageManager.removeAndPersist(options.source!, { local: Boolean(options.local) })
      if (!removed) {
        throw new Error(`No matching package found for ${options.source}`)
      }
      process.stdout.write(`Removed ${options.source}\n`)
      return
    }
    case 'update':
      await packageManager.update(options.source)
      process.stdout.write(options.source ? `Updated ${options.source}\n` : 'Updated packages\n')
      return
    case 'list':
      printConfiguredLinxPackages(packageManager)
      return
  }
}

function printConfiguredLinxPackages(packageManager: {
  listConfiguredPackages(): Array<{ scope?: string; source: string; filtered?: boolean; installedPath?: string }>
}): void {
  const configuredPackages = packageManager.listConfiguredPackages()
  if (configuredPackages.length === 0) {
    process.stdout.write('No packages installed.\n')
    return
  }

  const printGroup = (title: string, packages: typeof configuredPackages): void => {
    if (packages.length === 0) {
      return
    }
    process.stdout.write(`${title}:\n`)
    for (const pkg of packages) {
      const display = pkg.filtered ? `${pkg.source} (filtered)` : pkg.source
      process.stdout.write(`  ${display}\n`)
      if (pkg.installedPath) {
        process.stdout.write(`    ${pkg.installedPath}\n`)
      }
    }
  }

  printGroup('User packages', configuredPackages.filter((pkg) => pkg.scope === 'user'))
  printGroup('Project packages', configuredPackages.filter((pkg) => pkg.scope === 'project'))
}

async function runPiCommand(argv: {
  cwd?: string
  model?: string
  port?: number
  'runtime-url'?: string
  print?: boolean
  session?: string
  continue?: boolean
  resume?: boolean
  last?: boolean
  'pi-sync-status'?: boolean
  'pi-sync-retry'?: string
  prompt?: string[]
} & AutoModeCommandArgs): Promise<void> {
  const firstPromptToken = Array.isArray(argv.prompt) ? argv.prompt[0] : undefined
  // Reject command-shaped aliases that should not fall through to the default TUI prompt.
  if (firstPromptToken && RESERVED_NON_TOP_LEVEL_COMMANDS.has(firstPromptToken)) {
    throw new Error(`Unknown command: ${firstPromptToken}`)
  }
  if (argv.resume) {
    const selectedSession = await selectLinxSession(cwdFromArg(argv.cwd))
    if (!selectedSession) {
      process.stdout.write('No session selected\n')
      return
    }
    await runPiCommand({
      ...argv,
      resume: false,
      session: selectedSession,
    })
    return
  }

  if (isAutoModeRequest(argv)) {
    await runAutoModeCommand(argv)
    return
  }

  if (argv['pi-sync-status']) {
    await runPiSyncStatusCommand()
    return
  }

  if (argv['pi-sync-retry']) {
    await runPiSyncRetryCommand({
      cwd: argv.cwd || process.cwd(),
      sessionId: argv['pi-sync-retry'],
    })
    return
  }

  if (argv.backend) {
    await runAutoModeCommand({
      ...argv,
      plain: Boolean(argv.plain || argv.print),
    })
    return
  }

  const cwd = argv.cwd || process.cwd()
  const startupLoginPrompt = await resolveLinxStartupLoginPromptDecision({
    backend: 'cloud',
    print: argv.print,
    issuerUrl: resolveAccountBaseUrl(),
    resolveSession: resolveStartupLinxPodDataSession,
  })

  const sessionManager = await createLinxPiSessionManager({
    cwd,
    agentDir: LINX_AGENT_DIR,
    session: argv.session,
    last: Boolean(argv.continue || argv.last),
  })
  const restoreAutoFromHydration = Boolean(argv.session || argv.continue || argv.last)
  const controlState = await resolvePiStartupControlState({
    requestedAuto: typeof argv.auto === 'boolean' ? argv.auto : undefined,
    hydrateFromPod: !argv.print && !startupLoginPrompt.shouldPrompt,
    restoreAutoFromHydration,
    sessionManager,
  })
  const autoEnabled = controlState.autoEnabled
  const symphonyEnabled = controlState.symphonyEnabled

  const adapter = createLinxRuntimeAdapter({
    async createRemoteCompletion(options) {
      const chatApi = await import('./lib/chat-api.js')
      return chatApi.createRemoteCompletionResult(options)
    },
    async listRemoteModels(authFetch, runtimeUrl, options) {
      const chatApi = await import('./lib/chat-api.js')
      return chatApi.listRemoteModels(authFetch, runtimeUrl, options ?? { fallback: false, timeoutMs: 5000 })
    },
  }, {
    cwd,
    model: argv.model,
    backend: 'cloud',
    autoEnabled,
    symphonyEnabled,
    getPodDataSession: getDefaultPodDataSession,
    port: argv.port,
    providerConfig: {
      baseUrl: String(argv['runtime-url'] ?? 'https://api.undefineds.co/v1'),
      issuerUrl: resolveAccountBaseUrl(),
    },
  })

  await adapter.start()

  const runtime = await adapter.createRuntime({
    cwd: adapter.cwd,
    agentDir: LINX_AGENT_DIR,
    sessionManager,
  })
  const prompt = ((argv.prompt as string[] | undefined) ?? []).join(' ').trim()
  try {
    if (argv.print) {
      const exitCode = await runPrintMode(runtime, {
        mode: 'text',
        initialMessage: prompt || undefined,
      })
      if (exitCode !== 0) {
        process.exitCode = exitCode
      }
      return
    }

    const podMirror = new LinxPiPodMirror({
      cwd: adapter.cwd,
      sessionManager,
      autoEnabled,
      symphonyEnabled,
      checkpointStore: createFileSyncCheckpointStore({
        dir: join(LINX_AGENT_DIR, 'sync', 'pi-pod-mirror', sessionManager.getSessionId()),
      }),
      onError(error) {
        if (process.env.LINX_DEBUG === '1') {
          const message = error instanceof Error ? error.stack || error.message : String(error)
          process.stderr.write(`[linx pod mirror] ${message}\n`)
        }
      },
    })
    ;(runtime as unknown as { __linxPodMirror?: LinxPiPodMirror }).__linxPodMirror = podMirror
    const unsubscribePodMirror = runtime.session.subscribe((event: unknown) => {
      podMirror.handleEvent(event)
    })
    const interactive = bootstrapLinxInteractiveMode(runtime, {
      initialMessage: prompt || undefined,
      restoredAuto: autoEnabled && restoreAutoFromHydration,
      onAutoControlChange(enabled) {
        void podMirror.syncAutoControlState(enabled)
      },
      onSymphonyControlChange(enabled) {
        void podMirror.syncSymphonyControlState(enabled)
      },
    })
    const bridge = runtime as unknown as { linxAuthBridge?: { shouldPromptLoginOnStart?: boolean } }
    const loginPromptReason: LinxLoginReason | null = resolveLinxInteractiveLoginReason({
      startupDecision: startupLoginPrompt,
      runtimePromptOnStart: bridge.linxAuthBridge?.shouldPromptLoginOnStart,
    })
    if (loginPromptReason) {
      interactive.requestLogin?.(loginPromptReason)
    }

    try {
      await interactive.run()
    } finally {
      unsubscribePodMirror()
      await podMirror.close().catch(() => undefined)
      interactive.stop()
    }
  } finally {
    await adapter.close()
    clearDefaultPodDataSession()
  }
}

async function resolvePiStartupControlState(options: {
  requestedAuto?: boolean
  hydrateFromPod: boolean
  restoreAutoFromHydration?: boolean
  sessionManager: { getSessionId(): string; getEntries(): Array<{ timestamp?: unknown }> }
}): Promise<{ autoEnabled: boolean; symphonyEnabled: boolean }> {
  if (!options.hydrateFromPod) {
    return {
      autoEnabled: options.requestedAuto === true,
      symphonyEnabled: false,
    }
  }

  const session = await createLinxPodDataSession().catch(() => null)
  if (!session) {
    return {
      autoEnabled: options.requestedAuto === true,
      symphonyEnabled: false,
    }
  }

  try {
    const db = drizzle(session.solidSession, {
      logger: false,
      disableInteropDiscovery: true,
      podUrl: session.podUrl,
      resourcePreparation: 'off' as never,
      schema: solidResources,
    }) as unknown as SolidDatabase
    const hydration = await hydrateLinxPiControlState({
      db,
      sessionId: options.sessionManager.getSessionId(),
      createdAt: getPiSessionCreatedAt(options.sessionManager),
      onError(error) {
        if (process.env.LINX_DEBUG === '1') {
          const message = error instanceof Error ? error.stack || error.message : String(error)
          process.stderr.write(`[linx control state] ${message}\n`)
        }
      },
    })
    return {
      ...deriveLinxPiStartupControlState({
        requestedAuto: options.requestedAuto,
        hydration,
        restoreAutoFromHydration: options.restoreAutoFromHydration,
      }),
    }
  } finally {
    await session.close().catch(() => undefined)
  }
}

function getPiSessionCreatedAt(sessionManager: { getSessionId(): string; getEntries(): Array<{ timestamp?: unknown }> }): Date {
  const entryDate = sessionManager.getEntries()
    .map((entry) => toDate(entry.timestamp))
    .find((date): date is Date => date instanceof Date)
  return entryDate ?? parseTimestampFromUuidLikeId(sessionManager.getSessionId()) ?? new Date()
}

function parseTimestampFromUuidLikeId(id: string): Date | null {
  const prefix = id.replace(/-/g, '').slice(0, 12)
  if (!/^[\da-f]{12}$/i.test(prefix)) {
    return null
  }
  const millis = Number.parseInt(prefix, 16)
  if (!Number.isFinite(millis) || millis <= 0) {
    return null
  }
  const date = new Date(millis)
  return Number.isNaN(date.getTime()) ? null : date
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

function cwdFromArg(cwd: unknown): string {
  return typeof cwd === 'string' && cwd.trim() ? cwd : process.cwd()
}

async function selectLinxSession(cwd: string): Promise<string | null> {
  const settingsManager = SettingsManager.create(cwd, LINX_AGENT_DIR)
  initTheme(settingsManager.getTheme())

  return new Promise((resolve) => {
    const ui = new TUI(new ProcessTerminal())
    let resolved = false
    const finish = (sessionPath: string | null): void => {
      if (resolved) {
        return
      }
      resolved = true
      ui.stop()
      resolve(sessionPath)
    }
    const loadSessions = () => listLinxPiSessions(cwd, LINX_AGENT_DIR, { podSessionSource: null })
    const selector = new SessionSelectorComponent(
      loadSessions,
      loadSessions,
      (sessionPath) => finish(sessionPath),
      () => finish(null),
      () => {
        ui.stop()
        process.exit(0)
      },
      () => ui.requestRender(),
      { showRenameHint: false },
    )
    ui.addChild(selector)
    ui.setFocus(selector.getSessionList())
    ui.start()
  })
}

async function runPiSyncStatusCommand(): Promise<void> {
  const sessions = await listPendingPiPodMirrorSync(LINX_AGENT_DIR)
  if (sessions.length === 0) {
    process.stdout.write('No pending LinX Pod sync sessions.\n')
    return
  }

  process.stdout.write(`${sessions.map((session) => {
    const failed = session.checkpoints.filter((checkpoint) => checkpoint.status === 'failed').length
    const partial = session.checkpoints.filter((checkpoint) => checkpoint.status === 'partial').length
    const latest = session.checkpoints.at(-1)?.completedAt ?? 'unknown'
    return `${session.sessionId} · failed=${failed} partial=${partial} latest=${latest}`
  }).join('\n')}\n`)
}

async function runPiSyncRetryCommand(options: {
  cwd: string
  sessionId: string
}): Promise<void> {
  const result = await retryPendingPiPodMirrorSync({
    cwd: options.cwd,
    agentDir: LINX_AGENT_DIR,
    sessionId: options.sessionId,
  })
  if (!result.attempted) {
    process.stdout.write(`LinX Pod sync skipped: ${options.sessionId}\n`)
    return
  }

  const status = result.results.map((item) => item.status).join(', ') || 'none'
  process.stdout.write(
    status === 'none'
      ? `LinX Pod sync has no replayable local projections: ${options.sessionId}\n`
      : `Retried LinX Pod sync: ${options.sessionId} (${status})\n`,
  )
}

interface PiCommandArgs {
  cwd?: string
  model?: string
  port?: number
  'runtime-url'?: string
  print?: boolean
  session?: string
  continue?: boolean
  resume?: boolean
  last?: boolean
  'pi-sync-status'?: boolean
  'pi-sync-retry'?: string
  prompt?: string[]
}

type LinxDefaultCommandArgs = PiCommandArgs & AutoModeCommandArgs

function buildPiCommand(command: Argv<object>): Argv<LinxDefaultCommandArgs> {
  const configured = buildAutoModeOptions(command)
    .option('cwd', {
      type: 'string',
      describe: 'Workspace path for the LinX session',
    })
    .option('model', {
      type: 'string',
      describe: 'Model id to expose through the LinX runtime adapter; defaults to the last LinX selection',
    })
    .option('runtime-url', {
      type: 'string',
      default: 'https://api.undefineds.co/v1',
      describe: 'Cloud runtime API base URL',
    })
    .option('print', {
      type: 'boolean',
      default: false,
      describe: 'Run a single prompt without entering interactive mode',
    })
    .option('session', {
      type: 'string',
      describe: 'Resume a specific LinX session id or JSONL file',
    })
    .option('continue', {
      alias: 'c',
      type: 'boolean',
      default: false,
      describe: 'Continue previous LinX session',
    })
    .option('resume', {
      alias: 'r',
      type: 'boolean',
      default: false,
      describe: 'Select a LinX session to resume',
    })
    .option('last', {
      type: 'boolean',
      default: false,
      hidden: true,
    })
    .option('pi-sync-status', {
      type: 'boolean',
      hidden: true,
    })
    .option('pi-sync-retry', {
      type: 'string',
      hidden: true,
    })
    .positional('prompt', {
      array: true,
      type: 'string',
      describe: 'Single-shot prompt when --print is enabled',
    })
  return configured as Argv<LinxDefaultCommandArgs>
}

const defaultPiCommand: CommandModule<object, LinxDefaultCommandArgs> = {
  command: '$0 [prompt..]',
  describe: 'Run LinX with the selected runtime backend',
  builder: buildPiCommand,
  handler: runPiCommand,
}

const hiddenPiAliasCommand: CommandModule<object, LinxDefaultCommandArgs> = {
  command: 'pi [prompt..]',
  describe: false,
  builder: buildPiCommand,
  handler: runPiCommand,
}

const hiddenPiFrontendAliasCommand: CommandModule<object, LinxDefaultCommandArgs> = {
  command: 'pi-frontend [prompt..]',
  describe: false,
  builder: buildPiCommand,
  handler: runPiCommand,
}

const execCommand: CommandModule<object, LinxDefaultCommandArgs> = {
  command: 'exec [prompt..]',
  aliases: ['e'],
  describe: 'Run LinX non-interactively',
  builder: buildPiCommand,
  async handler(argv): Promise<void> {
    await runPiCommand({ ...argv, print: true })
  },
}

const retiredSymphonyCommand: CommandModule<object, { args?: string[] }> = {
  command: 'symphony [args..]',
  describe: false,
  builder(command) {
    return command
      .help(false)
      .version(false)
      .positional('args', {
        array: true,
        type: 'string',
        describe: 'Retired Symphony CLI arguments',
      })
  },
  handler(): void {
    throw new Error('`linx symphony` is not a product command. Enter the TUI, run `/symphony on`, then send the objective as normal chat to Secretary.')
  },
}

const cli = yargs(hideBin(process.argv))
  .scriptName('linx')
  .version(readPackageVersion())
  .parserConfiguration({
    'populate--': true,
  })
  .command(loginCommand)
  .command(logoutCommand)
  .command(whoamiCommand)
  .command(aiCommand)
  .command(configCommand)
  .command(retiredSymphonyCommand)
  .command(
    'install [source]',
    'Install a LinX package or extension',
    (command) => command
      .positional('source', { type: 'string', describe: 'Package source to install' })
      .option('local', { alias: 'l', type: 'boolean', default: false, describe: 'Install project-locally (.pi/settings.json)' }),
    async (argv) => {
      await runLinxPackageCommand('install', {
        source: typeof argv.source === 'string' ? argv.source : undefined,
        local: Boolean(argv.local),
      })
    },
  )
  .command(
    'remove [source]',
    'Remove a LinX package or extension',
    (command) => command
      .positional('source', { type: 'string', describe: 'Package source to remove' })
      .option('local', { alias: 'l', type: 'boolean', default: false, describe: 'Remove from project settings (.pi/settings.json)' }),
    async (argv) => {
      await runLinxPackageCommand('remove', {
        source: typeof argv.source === 'string' ? argv.source : undefined,
        local: Boolean(argv.local),
      })
    },
  )
  .command(
    'update [source]',
    'Update installed LinX packages',
    (command) => command.positional('source', { type: 'string', describe: 'Package source to update' }),
    async (argv) => {
      await runLinxPackageCommand('update', {
        source: typeof argv.source === 'string' ? argv.source : undefined,
      })
    },
  )
  .command(
    'list',
    'List installed LinX packages',
    () => undefined,
    async () => {
      await runLinxPackageCommand('list')
    },
  )
  .command(execCommand)
  .command(defaultPiCommand)
  .command(
    'chat [prompt..]',
    false,
    (command) =>
      command
        .option('model', { type: 'string', describe: 'Model ID override' })
        .option('continue', { type: 'boolean', default: false, describe: 'Continue latest thread' })
        .option('thread', { type: 'string', describe: 'Use an existing thread ID' })
        .option('url', { type: 'string', describe: 'Runtime API base URL override' })
        .option('workspace', { type: 'string', describe: 'Workspace/worktree path metadata' }),
    async (argv) => {
      const ctx = await resolveContext(argv.url)
      const threadId = await resolveThreadId({
        ctx,
        continueMode: argv.continue,
        explicitThreadId: argv.thread,
        workspace: argv.workspace,
        bestEffort: Boolean((argv.prompt as string[] | undefined)?.join(' ').trim()),
      })

      const prompt = (argv.prompt as string[] | undefined)?.join(' ').trim() || undefined
      if (prompt) {
        await runSingleTurn({ ctx, threadId, model: argv.model, prompt })
        await ctx.podSession.close()
        return
      }

      await runInteractive({ ctx, initialThreadId: threadId, initialModel: argv.model })
      await ctx.podSession.close()
    },
  )
  .command(
    'models',
    'List available remote models',
    (command) => command.option('url', { type: 'string', describe: 'Runtime API base URL override' }),
    async (argv) => {
      const ctx = await resolveRuntimeAuthContext(argv.url)
      let models
      try {
        models = await ctx.runtime.listRemoteModels(ctx.authFetch, ctx.runtimeUrl, { fallback: false })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to load cloud models from ${ctx.runtimeUrl}: ${message}`)
      }

      if (models.length === 0) {
        process.stdout.write(`Cloud runtime returned an empty model list.\n`)
      } else {
        for (const model of models) {
          const meta = formatRemoteModelMetadata(model)
          process.stdout.write(`- ${model.id}${meta ? ` (${meta})` : ''}\n`)
        }
      }

      await ctx.podSession.close()
    },
  )
  .command(
    'fork [thread]',
    'Fork a previous interactive session',
    (command) => command
      .positional('thread', { type: 'string', describe: 'Thread ID to fork' })
      .option('last', { type: 'boolean', default: false, describe: 'Fork the most recent thread' }),
    () => {
      throw new Error('Fork is not implemented yet for LinX Pod-backed sessions.')
    },
  )
  .command(hiddenPiAliasCommand)
  .command(hiddenPiFrontendAliasCommand)
  .command(
    'symphony-codex-mcp',
    false,
    (command) => command,
    async () => {
      const server = createSymphonyCodexMcpServer()
      const exitCode = await server.run()
      process.exit(exitCode)
    },
  )
  .command(
    'codex-native-proxy',
    false,
    (command) =>
      command
        .option('cwd', {
          type: 'string',
          describe: 'Workspace path exposed to the native Codex shell',
        })
        .option('model', {
          type: 'string',
          describe: 'Model override forwarded to the native proxy session metadata',
        })
        .option('port', {
          type: 'number',
          default: 8787,
          describe: 'Local websocket listen port for codex --remote',
        }),
    async (argv) => {
      const proxy = createCodexNativeProxy({
        cwd: argv.cwd || process.cwd(),
        model: argv.model,
        listenPort: argv.port,
      })

      await proxy.start()
      process.stdout.write(`[linx] native codex proxy ready\n`)
      process.stdout.write(`[linx] connect with: codex --remote ${proxy.remoteUrl} -C ${proxy.record.cwd}\n`)

      const shutdown = async () => {
        await proxy.close()
        process.exit(0)
      }

      process.on('SIGINT', () => {
        void shutdown()
      })
      process.on('SIGTERM', () => {
        void shutdown()
      })

      await new Promise(() => {})
    },
  )
  .strict()
  .help()
  .fail((message, error, yargsInstance) => {
    if (error) {
      console.error(formatLinxCliErrorMessage(error))
      process.exit(1)
    }
    if (message) {
      console.error(formatLinxCliErrorMessage(message))
      process.exit(1)
    }
    yargsInstance.showHelp()
    process.exit(1)
  })

process.on('unhandledRejection', (error: unknown) => {
  console.error(formatLinxCliErrorMessage(error))
  process.exit(1)
})

cli.parse()
