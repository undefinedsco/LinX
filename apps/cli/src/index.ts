#!/usr/bin/env node
import './lib/node-warning-filter.js'
import { readFileSync } from 'node:fs'
import yargs, { type CommandModule } from 'yargs'
import { hideBin } from 'yargs/helpers'
import { aiCommand } from './lib/ai-command.js'
import { loginCommand, logoutCommand, whoamiCommand } from './lib/login-command.js'
import { configCommand } from './lib/status-line-command.js'
import { DefaultPackageManager, SettingsManager } from '@earendil-works/pi-coding-agent'
import { promptText } from './lib/prompt.js'
import { resolveRuntimeTarget } from './lib/runtime-target.js'
import { createCodexNativeProxy, createSymphonyCodexMcpServer } from './lib/codex-plugin/index.js'
import { createLinxPiCliCommands } from './lib/linx-pi-cli-command.js'
import { createLinxRuntimeAdapter } from './lib/pi-adapter/index.js'
import type { LinxCompletionBackendResult } from './lib/linx-completion-backend.js'
import type { PodDataSession } from './lib/pod-data-session.js'
import { createLinxPodDataSession } from './lib/linx-pod-data-session-factory.js'
import { DEFAULT_LINX_CLOUD_MODEL_ID, FALLBACK_LINX_CLOUD_MODEL_IDS } from './lib/default-model.js'
import type { RemoteChatMessage, RemoteChatTool } from './lib/chat-api.js'
import { LINX_AGENT_DIR } from './lib/linx-interactive-branding.js'
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

const { defaultPiCommand, execCommand, hiddenPiAliasCommand, hiddenPiFrontendAliasCommand } = createLinxPiCliCommands({
  createRuntimeAdapter: createLinxRuntimeAdapter,
})

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
