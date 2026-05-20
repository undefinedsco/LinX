#!/usr/bin/env node
import './lib/node-warning-filter.js'
import { readFileSync } from 'node:fs'
import yargs, { type Argv, type CommandModule } from 'yargs'
import { hideBin } from 'yargs/helpers'
import { aiCommand } from './lib/ai-command.js'
import { resolveAccountBaseUrl } from './lib/account-api.js'
import { loadCredentials } from './lib/credentials-store.js'
import { loginCommand, logoutCommand, whoamiCommand } from './lib/login-command.js'
import { DefaultPackageManager, SettingsManager, runPrintMode } from '@mariozechner/pi-coding-agent'
import { promptText } from './lib/prompt.js'
import {
  buildAutoModeOptions,
  isAutoModeRequest,
  runAutoModeCommand,
  type AutoModeCommandArgs,
} from './lib/auto-mode-command.js'
import {
  formatAutoModeSessionSummary,
  listArchivedAutoModeSessions,
  loadArchivedAutoModeSession,
  resumeAutoModeSession,
} from './lib/auto-mode/index.js'
import { symphonyCommand } from './lib/symphony-command.js'
import { resolveRuntimeTarget } from './lib/runtime-target.js'
import { createCodexNativeProxy } from './lib/codex-plugin/index.js'
import { bootstrapPiInteractiveMode, createPiRuntimeAdapter, resolveLinxInteractiveLoginReason, resolveLinxStartupLoginPromptDecision, type LinxLoginReason } from './lib/pi-adapter/index.js'
import { isOidcLoginExpiredError } from './lib/oidc-auth.js'
import { createPodDataSession, type PodDataSession } from './lib/pod-data-session.js'
import { DEFAULT_LINX_CLOUD_MODEL_ID, FALLBACK_LINX_CLOUD_MODEL_IDS } from './lib/default-model.js'
import type { PiCompletionBackendResult } from './lib/pi-adapter/stream.js'
import {
  createLinxPiSessionManager,
  formatLinxPiSessionSummary,
  listLinxPiSessions,
  resolveLinxPiSession,
} from './lib/pi-adapter/session.js'
import { LinxPiPodMirror } from './lib/pi-adapter/pod-mirror.js'
import type { RemoteChatMessage, RemoteChatTool } from './lib/chat-api.js'
import { LINX_AGENT_DIR } from './lib/pi-adapter/branding.js'

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
    apiKey: string
    model?: string
    messages: RemoteChatMessage[]
    tools?: RemoteChatTool[]
  }): Promise<string | PiCompletionBackendResult>
  listRemoteModels(session: unknown, runtimeUrl: string, apiKey: string, options?: { fallback?: boolean; timeoutMs?: number }): Promise<Array<{
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
    apiKey: string
  }>
  authenticatedFetch(url: string, token: string, init?: RequestInit): Promise<Response>
}

interface RuntimeContext {
  runtimeUrl: string
  apiKey: string
  session: SessionLike
  podSession: PodDataSession
  chatId: string
  runtime: ChatRuntime
}

interface RuntimeAuthContext {
  runtimeUrl: string
  apiKey: string
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
  const apiKey = await resolvePodRuntimeAuthToken(podSession)
  const session = podSession.solidSession

  await runtime.initPodData(session)
  const chatId = await runtime.getOrCreateDefaultChat(session)

  return { runtimeUrl: target.runtimeUrl, apiKey, session, podSession, chatId, runtime }
}

async function resolveRuntimeAuthContext(urlOverride?: string): Promise<RuntimeAuthContext> {
  const runtime = await loadChatRuntime()
  const podSession = await createLinxPodDataSession()
  const target = resolveRuntimeTarget({
    issuerUrl: podSession.credentials.url,
    runtimeUrlOverride: urlOverride,
  })
  const apiKey = await resolvePodRuntimeAuthToken(podSession)

  return {
    runtimeUrl: target.runtimeUrl,
    apiKey,
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

async function resolvePodRuntimeAuthToken(podSession: PodDataSession): Promise<string> {
  try {
    return await podSession.getRuntimeAuthToken()
  } catch (error) {
    if (isOidcLoginExpiredError(error)) {
      throw new Error('LinX Cloud login expired. Run `linx login` to re-authorize.')
    }
    throw error
  }
}

async function runSingleTurn(options: {
  ctx: RuntimeContext
  threadId: string
  model?: string
  prompt: string
}): Promise<void> {
  const { ctx, threadId, model, prompt } = options
  const history = await ctx.runtime.loadMessages(ctx.session, threadId)

  await ctx.runtime.saveUserMessage(ctx.session, ctx.chatId, threadId, prompt)

  const reply = await ctx.runtime.createRemoteCompletion({
    runtimeUrl: ctx.runtimeUrl,
    apiKey: ctx.apiKey,
    model,
    messages: [...ctx.runtime.toOpenAiMessages(history), { role: 'user', content: prompt }],
  })

  const replyText = typeof reply === 'string' ? reply : reply.content ?? ''
  await ctx.runtime.saveAssistantMessage(ctx.session, ctx.chatId, threadId, replyText)
  process.stdout.write(`\n${replyText}\n\n`)
}

async function resolveThreadId(options: {
  ctx: RuntimeContext
  continueMode?: boolean
  explicitThreadId?: string
  workspace?: string
}): Promise<string> {
  const { ctx, continueMode, explicitThreadId, workspace } = options

  if (explicitThreadId) {
    return explicitThreadId
  }

  if (continueMode) {
    const latest = await ctx.runtime.getLatestThreadId(ctx.session, ctx.chatId)
    if (latest) {
      return latest
    }
  }

  return ctx.runtime.createThread(ctx.session, ctx.chatId, workspace || process.cwd(), 'CLI Session')
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
  last?: boolean
  prompt?: string[]
} & AutoModeCommandArgs): Promise<void> {
  const firstPromptToken = Array.isArray(argv.prompt) ? argv.prompt[0] : undefined
  // Reject old command aliases explicitly; auto-mode is only selected through flags.
  if (firstPromptToken === 'automode' || firstPromptToken === 'watch') {
    throw new Error(`Unknown command: ${firstPromptToken}`)
  }

  if (isAutoModeRequest(argv)) {
    await runAutoModeCommand(argv)
    return
  }

  const backend = 'cloud'
  const startupLoginPrompt = await resolveLinxStartupLoginPromptDecision({
    backend,
    print: argv.print,
    issuerUrl: resolveAccountBaseUrl(),
  })

  const adapter = createPiRuntimeAdapter({
    createNativeProxy(options) {
      return createCodexNativeProxy({
        cwd: options?.cwd,
        model: options?.model,
        listenPort: options?.listenPort,
      })
    },
    async createRemoteCompletion(options) {
      const chatApi = await import('./lib/chat-api.js')
      return chatApi.createRemoteCompletionResult(options)
    },
    async listRemoteModels(session, runtimeUrl, apiKey) {
      const chatApi = await import('./lib/chat-api.js')
      return chatApi.listRemoteModels(session, runtimeUrl, apiKey, { fallback: false, timeoutMs: 5000 })
    },
  }, {
    cwd: argv.cwd || process.cwd(),
    model: argv.model,
    backend,
    port: argv.port,
    providerConfig: {
      baseUrl: String(argv['runtime-url'] ?? 'https://api.undefineds.co/v1'),
      issuerUrl: resolveAccountBaseUrl(),
    },
  })

  await adapter.start()

  const sessionManager = await createLinxPiSessionManager({
    cwd: adapter.cwd,
    agentDir: LINX_AGENT_DIR,
    session: argv.session,
    last: argv.last,
  })
  const runtime = await adapter.createRuntime({
    cwd: adapter.cwd,
    agentDir: LINX_AGENT_DIR,
    sessionManager,
  })
  const podMirror = new LinxPiPodMirror({
    cwd: adapter.cwd,
    sessionManager,
    onError(error) {
      if (process.env.LINX_DEBUG === '1') {
        const message = error instanceof Error ? error.stack || error.message : String(error)
        process.stderr.write(`[linx pod mirror] ${message}\n`)
      }
    },
  })
  const unsubscribePodMirror = runtime.session.subscribe((event: unknown) => {
    podMirror.handleEvent(event)
  })

  const interactive = bootstrapPiInteractiveMode(runtime)
  const bridge = runtime as unknown as { linxAuthBridge?: { shouldPromptLoginOnStart?: boolean } }
  const loginPromptReason: LinxLoginReason | null = resolveLinxInteractiveLoginReason({
    startupDecision: startupLoginPrompt,
    runtimePromptOnStart: bridge.linxAuthBridge?.shouldPromptLoginOnStart,
  })
  if (loginPromptReason) {
    interactive.requestLogin?.(loginPromptReason)
  }
  try {
    if (argv.print) {
      const prompt = ((argv.prompt as string[] | undefined) ?? []).join(' ').trim()
      const exitCode = await runPrintMode(runtime, {
        mode: 'text',
        initialMessage: prompt || undefined,
      })
      if (exitCode !== 0) {
        process.exitCode = exitCode
      }
      return
    }

    await interactive.run()
  } finally {
    unsubscribePodMirror()
    await podMirror.close().catch(() => undefined)
    interactive.stop()
    await adapter.close()
  }
}

async function runResumeCommand(argv: {
  session?: string
  last?: boolean
  cwd?: string
  model?: string
  'runtime-url'?: string
}): Promise<void> {
  const cwd = typeof argv.cwd === 'string' ? argv.cwd : process.cwd()
  const session = typeof argv.session === 'string' ? argv.session : undefined
  const piSessions = await listLinxPiSessions(cwd, LINX_AGENT_DIR)
  const autoModeSessions = listArchivedAutoModeSessions()

  if (!session && !argv.last) {
    if (piSessions.length === 0 && autoModeSessions.length === 0) {
      process.stdout.write('No LinX sessions found.\n')
      return
    }
    if (piSessions.length > 0) {
      process.stdout.write('LinX sessions:\n')
      process.stdout.write(`${piSessions.map((item) => `  ${formatLinxPiSessionSummary(item)}`).join('\n')}\n`)
    }
    if (autoModeSessions.length > 0) {
      process.stdout.write('Auto-mode sessions:\n')
      process.stdout.write(`${autoModeSessions.map((item) => `  ${formatAutoModeSessionSummary(item)}`).join('\n')}\n`)
    }
    return
  }

  if (argv.last && !session) {
    const latestPi = piSessions[0]
    const latestAutoMode = autoModeSessions[0]
    const latestPiTime = latestPi?.modified.getTime() ?? 0
    const latestAutoModeTime = latestAutoMode ? Date.parse(latestAutoMode.endedAt ?? latestAutoMode.startedAt) : 0
    if (latestAutoMode && latestAutoModeTime > latestPiTime) {
      const exitCode = await resumeAutoModeSession(latestAutoMode, {
        cwd,
        model: argv.model,
      })
      if (exitCode !== 0) {
        process.exitCode = exitCode
      }
      return
    }
  }

  if (session) {
    try {
      await resolveLinxPiSession(session, cwd, undefined)
      await runPiCommand({
        cwd,
        model: typeof argv.model === 'string' ? argv.model : undefined,
        'runtime-url': typeof argv['runtime-url'] === 'string' ? argv['runtime-url'] : undefined,
        session,
        last: false,
      })
      return
    } catch {
      const autoModeSession = loadArchivedAutoModeSession(session)
      if (autoModeSession) {
        const exitCode = await resumeAutoModeSession(autoModeSession, {
          cwd,
          model: argv.model,
        })
        if (exitCode !== 0) {
          process.exitCode = exitCode
        }
        return
      }
    }
  }

  await runPiCommand({
    cwd,
    model: typeof argv.model === 'string' ? argv.model : undefined,
    'runtime-url': typeof argv['runtime-url'] === 'string' ? argv['runtime-url'] : undefined,
    session,
    last: Boolean(argv.last) || !session,
  })
}

interface PiCommandArgs {
  cwd?: string
  model?: string
  port?: number
  'runtime-url'?: string
  print?: boolean
  session?: string
  last?: boolean
  prompt?: string[]
}

type LinxDefaultCommandArgs = PiCommandArgs & AutoModeCommandArgs

function buildPiCommand(command: Argv<object>): Argv<LinxDefaultCommandArgs> {
  const configured = buildAutoModeOptions(command)
    .option('cwd', {
      type: 'string',
      describe: 'Workspace path for the Pi session',
    })
    .option('model', {
      type: 'string',
      describe: 'Model id to expose through the Pi runtime adapter; defaults to the last LinX selection',
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
      describe: 'Resume a specific LinX/Pi session id or JSONL file',
    })
    .option('last', {
      type: 'boolean',
      default: false,
      describe: 'Continue the most recent local LinX/Pi session for this workspace',
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
  describe: 'Run LinX, or control an external agent backend with --backend',
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
  .command(symphonyCommand)
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
        models = await ctx.runtime.listRemoteModels(ctx.session, ctx.runtimeUrl, ctx.apiKey, { fallback: false })
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
    'resume [session]',
    'Resume a previous LinX or auto-mode session',
    (command) => command
      .positional('session', { type: 'string', describe: 'Session id/prefix or JSONL file to resume' })
      .option('last', { type: 'boolean', default: false, describe: 'Resume the most recent LinX or auto-mode session' })
      .option('cwd', { type: 'string', describe: 'Workspace path for the resumed session' })
      .option('model', { type: 'string', describe: 'Model id to expose through the Pi runtime adapter' })
      .option('runtime-url', { type: 'string', default: 'https://api.undefineds.co/v1', describe: 'Cloud runtime API base URL' }),
    async (argv) => {
      await runResumeCommand({
        cwd: typeof argv.cwd === 'string' ? argv.cwd : undefined,
        model: typeof argv.model === 'string' ? argv.model : undefined,
        'runtime-url': typeof argv['runtime-url'] === 'string' ? argv['runtime-url'] : undefined,
        session: typeof argv.session === 'string' ? argv.session : undefined,
        last: Boolean(argv.last),
      })
    },
  )
  .command(
    'fork [thread]',
    'Fork a previous interactive session',
    (command) => command
      .positional('thread', { type: 'string', describe: 'Thread ID to fork' })
      .option('last', { type: 'boolean', default: false, describe: 'Fork the most recent thread' }),
    () => {
      throw new Error('Fork is not implemented yet for LinX Pod-backed Pi sessions.')
    },
  )
  .command(hiddenPiAliasCommand)
  .command(hiddenPiFrontendAliasCommand)
  .command(
    'codex-native-proxy',
    'Start a local app-server websocket proxy for native Codex TUI',
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
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
    if (message) {
      console.error(message)
      process.exit(1)
    }
    yargsInstance.showHelp()
    process.exit(1)
  })

process.on('unhandledRejection', (error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

cli.parse()
