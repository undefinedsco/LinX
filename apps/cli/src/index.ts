#!/usr/bin/env node
import { join } from 'node:path'
import yargs, { type Argv, type CommandModule } from 'yargs'
import { hideBin } from 'yargs/helpers'
import { aiCommand } from './lib/ai-command.js'
import { resolveAccountBaseUrl } from './lib/account-api.js'
import { getClientCredentials, loadCredentials } from './lib/credentials-store.js'
import { loadAccountSession } from './lib/account-session.js'
import { loginCommand, logoutCommand, whoamiCommand } from './lib/login-command.js'
import { runPrintMode } from '@mariozechner/pi-coding-agent'
import { promptText } from './lib/prompt.js'
import { resolveRuntimeTarget } from './lib/runtime-target.js'
import { createCodexNativeProxy } from './lib/codex-plugin/index.js'
import { bootstrapPiInteractiveMode, createPiRuntimeAdapter } from './lib/pi-adapter/index.js'
import { getOidcAccessToken } from './lib/oidc-auth.js'
import { DEFAULT_LINX_CLOUD_MODEL_ID } from './lib/default-model.js'
import type { PiCompletionBackendResult } from './lib/pi-adapter/stream.js'
import type { RemoteChatMessage, RemoteChatTool } from './lib/chat-api.js'
import { LINX_AGENT_DIR } from './lib/pi-adapter/branding.js'
import {
  formatRemoteWatchApprovalSummary,
  formatArchivedWatchSession,
  formatWatchSessionSummary,
  loadArchivedWatchEvents,
  listArchivedWatchSessions,
  listRemoteWatchApprovals,
  listSupportedWatchBackends,
  loadArchivedWatchSession,
  resolveRemoteWatchApproval,
  runWatch,
  type WatchBackend,
  type WatchCredentialSource,
  type WatchMode,
} from './lib/watch/index.js'

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
  chatId: string
  runtime: ChatRuntime
}

interface RuntimeAuthContext {
  runtimeUrl: string
  apiKey: string
  session: SessionLike
  runtime: ChatRuntime
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
  const creds = loadCredentials()
  if (!creds) {
    throw new Error('No credentials found. Run `linx login` first.')
  }

  const target = resolveRuntimeTarget({
    issuerUrl: creds.url,
    runtimeUrlOverride: urlOverride,
  })
  const clientCreds = getClientCredentials(creds)

  if (clientCreds) {
    const { session, apiKey } = await runtime.authenticate(clientCreds.clientId, clientCreds.clientSecret, target.oidcIssuer)
    await runtime.initPodData(session)
    const chatId = await runtime.getOrCreateDefaultChat(session)

    return { runtimeUrl: target.runtimeUrl, apiKey, session, chatId, runtime }
  }

  if (creds.authType === 'oidc_oauth') {
    const accessToken = await getOidcAccessToken(creds)
    if (!accessToken) {
      throw new Error('Failed to restore OIDC access token. Run `linx login` again.')
    }

    const pseudoSession: SessionLike = {
      async logout(): Promise<void> {},
    }
    const podUrl = loadAccountSession()?.podUrl || creds.webId.replace('/card#me', '').replace(/\/?$/, '/')
    const session = {
      ...pseudoSession,
      info: {
        isLoggedIn: true,
        webId: creds.webId,
        podUrl,
      },
      fetch: (url: string, init?: RequestInit) => runtime.authenticatedFetch(url, accessToken, init),
    }
    await runtime.initPodData(session)
    const chatId = await runtime.getOrCreateDefaultChat(session)

    return { runtimeUrl: target.runtimeUrl, apiKey: accessToken, session, chatId, runtime }
  }

  throw new Error('Unsupported LinX auth type. Run `linx login` again.')
}

async function resolveRuntimeAuthContext(urlOverride?: string): Promise<RuntimeAuthContext> {
  const runtime = await loadChatRuntime()
  const creds = loadCredentials()
  if (!creds) {
    throw new Error('No credentials found. Run `linx login` first.')
  }

  const target = resolveRuntimeTarget({
    issuerUrl: creds.url,
    runtimeUrlOverride: urlOverride,
  })
  const clientCreds = getClientCredentials(creds)

  if (clientCreds) {
    const { session, apiKey } = await runtime.authenticate(clientCreds.clientId, clientCreds.clientSecret, target.oidcIssuer)
    return { runtimeUrl: target.runtimeUrl, apiKey, session, runtime }
  }

  if (creds.authType === 'oidc_oauth') {
    const accessToken = await getOidcAccessToken(creds)
    if (!accessToken) {
      throw new Error('Failed to restore OIDC access token. Run `linx login` again.')
    }

    const pseudoSession: SessionLike = {
      async logout(): Promise<void> {},
    }
    return { runtimeUrl: target.runtimeUrl, apiKey: accessToken, session: pseudoSession, runtime }
  }

  throw new Error('Unsupported LinX auth type. Run `linx login` again.')
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

  process.stdout.write(`LinX CLI ready\nthread: ${threadId}\nmodel: ${model || DEFAULT_LINX_CLOUD_MODEL_ID}\n输入 /help 查看命令。\n\n`)

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
        '/help 查看帮助\n/threads 列出 threads\n/new 新建 thread\n/use <threadId> 切换 thread\n/model <modelId> 切换模型\n/exit 退出\n\n',
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

async function runPiCommand(argv: {
  cwd?: string
  model?: string
  backend?: string
  port?: number
  'runtime-url'?: string
  print?: boolean
  prompt?: string[]
}): Promise<void> {
  const backend = (argv.backend as 'cloud' | 'native' | undefined) ?? 'cloud'
  if (!argv.print && backend === 'cloud') {
    const { resolveLinxPiCloudOAuthCredential } = await import('./lib/pi-adapter/auth.js')
    const existingCredential = await resolveLinxPiCloudOAuthCredential(undefined)

    if (!existingCredential) {
      const answer = (await promptText('LinX Cloud not connected. Open browser login now? [Y/n] ')).trim().toLowerCase()
      const shouldLoginNow = answer === '' || answer === 'y' || answer === 'yes'

      if (shouldLoginNow) {
        const { ensureBrowserConsentLogin } = await import('./lib/oidc-auth.js')
        process.stdout.write('Opening LinX Cloud login in your browser...\n')
        try {
          const result = await ensureBrowserConsentLogin({
            issuerUrl: resolveAccountBaseUrl(),
          })
          if (result.reusedExistingSession) {
            process.stdout.write('Reused existing LinX Cloud session.\n')
          }
        } catch (error) {
          process.stdout.write(
            'LinX Cloud login was not completed. Continuing into TUI without auth.\n',
          )
          if (error instanceof Error && error.message.trim()) {
            process.stdout.write(`${error.message}\n`)
          }
        }
      }
    }
  }

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
      return chatApi.listRemoteModels(session, runtimeUrl, apiKey)
    },
  }, {
    cwd: argv.cwd || process.cwd(),
    model: argv.model || DEFAULT_LINX_CLOUD_MODEL_ID,
    backend,
    port: argv.port,
    providerConfig: {
      baseUrl: String(argv['runtime-url'] ?? 'https://api.undefineds.co/v1'),
      issuerUrl: resolveAccountBaseUrl(),
    },
  })

  await adapter.start()

  const { SessionManager } = await import('@mariozechner/pi-coding-agent')
  const runtime = await adapter.createRuntime({
    cwd: adapter.cwd,
    agentDir: LINX_AGENT_DIR,
    sessionManager: SessionManager.inMemory(adapter.cwd),
  })

  const interactive = bootstrapPiInteractiveMode(runtime)
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
    interactive.stop()
    await adapter.close()
  }
}

interface PiCommandArgs {
  cwd?: string
  model?: string
  backend?: 'cloud' | 'native'
  port?: number
  'runtime-url'?: string
  print?: boolean
  prompt?: string[]
}

function buildPiCommand(command: Argv<object>): Argv<PiCommandArgs> {
  const configured = command
    .option('cwd', {
      type: 'string',
      describe: 'Workspace path for the Pi session',
    })
    .option('model', {
      type: 'string',
      describe: 'Model id to expose through the Pi runtime adapter',
    })
    .option('backend', {
      type: 'string',
      default: 'cloud',
      choices: ['cloud', 'native'] as const,
      describe: 'Backend mode. Default is cloud; native keeps the local Codex proxy for debugging only.',
    })
    .option('port', {
      type: 'number',
      default: 8787,
      describe: 'Local websocket port used only when --backend native',
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
    .positional('prompt', {
      array: true,
      type: 'string',
      describe: 'Single-shot prompt when --print is enabled',
    })
  return configured as Argv<PiCommandArgs>
}

const defaultPiCommand: CommandModule<object, PiCommandArgs> = {
  command: '$0 [prompt..]',
  describe: 'Run the native Pi TUI on top of the LinX cloud auth + Pod storage backend',
  builder: buildPiCommand,
  handler: runPiCommand,
}

const hiddenPiAliasCommand: CommandModule<object, PiCommandArgs> = {
  command: 'pi [prompt..]',
  describe: false,
  builder: buildPiCommand,
  handler: runPiCommand,
}

const hiddenPiFrontendAliasCommand: CommandModule<object, PiCommandArgs> = {
  command: 'pi-frontend [prompt..]',
  describe: false,
  builder: buildPiCommand,
  handler: runPiCommand,
}

const execCommand: CommandModule<object, PiCommandArgs> = {
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
  .parserConfiguration({
    'populate--': true,
  })
  .command(loginCommand)
  .command(logoutCommand)
  .command(whoamiCommand)
  .command(aiCommand)
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
        await ctx.session.logout()
        return
      }

      await runInteractive({ ctx, initialThreadId: threadId, initialModel: argv.model })
      await ctx.session.logout()
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
          const meta = [model.provider || model.ownedBy, model.contextWindow ? `${model.contextWindow}` : '']
            .filter(Boolean)
            .join(' · ')
          process.stdout.write(`- ${model.id}${meta ? ` (${meta})` : ''}\n`)
        }
      }

      await ctx.session.logout()
    },
  )
  .command(
    'resume',
    'List resumable CLI threads',
    (command) => command.option('url', { type: 'string', describe: 'Runtime API base URL override' }),
    async (argv) => {
      const ctx = await resolveContext(argv.url)
      const threads = await ctx.runtime.listThreads(ctx.session, ctx.chatId)

      if (threads.length === 0) {
        process.stdout.write('No threads found.\n')
      } else {
        process.stdout.write(`${threads.map((thread) => `- ${ctx.runtime.formatThreadLabel(thread)}`).join('\n')}\n`)
      }

      await ctx.session.logout()
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
  .command(
    'watch <action> [backend] [prompt..]',
    'Run or inspect local watch backends',
    (command) =>
      command
        .positional('action', {
          type: 'string',
          choices: ['run', 'backends', 'sessions', 'show', 'approvals', 'approve', 'reject', 'codex', 'claude', 'codebuddy'] as const,
        })
        .positional('backend', {
          type: 'string',
          describe: 'Watch backend for `run`, session id for `show`, or approval id for `approve|reject`',
        })
        .option('mode', {
          type: 'string',
          default: 'smart',
          choices: ['manual', 'smart', 'auto'] as const,
          describe: 'Unified autonomy mode',
        })
        .option('model', {
          type: 'string',
          describe: 'Backend-native model override',
        })
        .option('cwd', {
          type: 'string',
          describe: 'Working directory for local backend execution',
        })
        .option('plain', {
          type: 'boolean',
          default: false,
          describe: 'Disable full-screen TUI and use plain streaming output',
        })
        .option('credential-source', {
          type: 'string',
          default: 'auto',
          choices: ['auto', 'local', 'cloud'] as const,
          describe: 'Resolve credentials only: local CLI login, LinX cloud config, or auto fallback. Runtime still runs locally.',
        })
        .option('session', {
          type: 'boolean',
          default: false,
          describe: 'Approve for the current watch session instead of only once.',
        })
        .option('reason', {
          type: 'string',
          describe: 'Optional note recorded with an approval decision.',
        }),
    async (argv) => {
      const rawAction = String(argv.action)
      const directBackend = ['codex', 'claude', 'codebuddy'].includes(rawAction)
      const action = directBackend ? 'run' : rawAction

      if (action === 'backends') {
        const backends = listSupportedWatchBackends()
        for (const backend of backends) {
          process.stdout.write(`- ${backend.backend} (${backend.label})\n`)
          process.stdout.write(`  ${backend.description}\n`)
          process.stdout.write(`  manual: ${backend.modes.manual}\n`)
          process.stdout.write(`  smart: ${backend.modes.smart}\n`)
          process.stdout.write(`  auto: ${backend.modes.auto}\n`)
        }
        return
      }

      if (action === 'sessions') {
        const sessions = listArchivedWatchSessions()
        if (sessions.length === 0) {
          process.stdout.write('No watch sessions found.\n')
          return
        }

        process.stdout.write(`${sessions.map(formatWatchSessionSummary).join('\n')}\n`)
        return
      }

      if (action === 'show') {
        const sessionId = argv.backend ? String(argv.backend) : ''
        if (!sessionId) {
          throw new Error('Usage: linx watch show <sessionId>')
        }

        const session = loadArchivedWatchSession(sessionId)
        if (!session) {
          throw new Error(`Watch session not found: ${sessionId}`)
        }

        process.stdout.write(formatArchivedWatchSession(session, loadArchivedWatchEvents(sessionId)))
        return
      }

      if (action === 'approvals') {
        const approvals = await listRemoteWatchApprovals()
        if (approvals.length === 0) {
          process.stdout.write('No pending remote approvals in the approval inbox.\n')
          return
        }

        process.stdout.write(`${approvals.map(formatRemoteWatchApprovalSummary).join('\n')}\n`)
        return
      }

      if (action === 'approve' || action === 'reject') {
        const approvalId = argv.backend ? String(argv.backend) : ''
        if (!approvalId) {
          throw new Error(`Usage: linx watch ${action} <approvalId>`)
        }

        const summary = await resolveRemoteWatchApproval({
          approvalId,
          decision: action === 'approve'
            ? (argv.session ? 'accept_for_session' : 'accept')
            : 'decline',
          note: argv.reason ? String(argv.reason) : undefined,
        })
        process.stdout.write(`${formatRemoteWatchApprovalSummary(summary)}\n`)
        return
      }

      const backend = (directBackend ? rawAction : argv.backend) as WatchBackend | undefined
      if (!backend || !['codex', 'claude', 'codebuddy'].includes(backend)) {
        throw new Error('Usage: linx watch run <codex|claude|codebuddy> <prompt> [-- backend args]\n   or: linx watch <codex|claude|codebuddy> <prompt>')
      }

      const plain = Boolean(argv.plain)
      const prompt = ((directBackend ? [argv.backend, ...(argv.prompt as string[] | undefined ?? [])] : (argv.prompt as string[] | undefined)) ?? [])
        .filter((item): item is string => typeof item === 'string')
        .join(' ')
        .trim() || undefined
      const exitCode = await runWatch({
        backend,
        mode: argv.mode as WatchMode,
        cwd: argv.cwd || process.cwd(),
        plain,
        model: argv.model,
        prompt,
        passthroughArgs: ((argv['--'] as string[] | undefined) ?? []).map(String),
        credentialSource: argv['credential-source'] as WatchCredentialSource,
      })

      if (exitCode !== 0) {
        process.exitCode = exitCode
      }
    },
  )
  .strict()
  .help()

process.on('unhandledRejection', (error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

cli.parse()
