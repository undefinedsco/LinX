#!/usr/bin/env node
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { aiCommand } from './lib/ai-command.js'
import { getClientCredentials, loadCredentials } from './lib/credentials-store.js'
import { loginCommand, logoutCommand, whoamiCommand } from './lib/login-command.js'
import { promptText } from './lib/prompt.js'
import { resolveRuntimeTarget } from './lib/runtime-target.js'
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
    messages: Array<{ role: ChatRole; content: string }>
  }): Promise<string>
  listRemoteModels(session: unknown, runtimeUrl: string, apiKey: string): Promise<Array<{
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
}

interface RuntimeContext {
  runtimeUrl: string
  apiKey: string
  session: SessionLike
  chatId: string
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

  const clientCreds = getClientCredentials(creds)
  if (!clientCreds) {
    throw new Error('Only client credentials auth is supported in the MVP CLI.')
  }

  const target = resolveRuntimeTarget({
    issuerUrl: creds.url,
    runtimeUrlOverride: urlOverride,
  })
  const { session, apiKey } = await runtime.authenticate(clientCreds.clientId, clientCreds.clientSecret, target.oidcIssuer)
  await runtime.initPodData(session)
  const chatId = await runtime.getOrCreateDefaultChat(session)

  return { runtimeUrl: target.runtimeUrl, apiKey, session, chatId, runtime }
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

  await ctx.runtime.saveAssistantMessage(ctx.session, ctx.chatId, threadId, reply)
  process.stdout.write(`\n${reply}\n\n`)
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

  process.stdout.write(`LinX CLI ready\nthread: ${threadId}\nmodel: ${model || 'default'}\n输入 /help 查看命令。\n\n`)

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
      process.stdout.write(`当前模型: ${model || 'default'}\n\n`)
      continue
    }

    await runSingleTurn({ ctx, threadId, model, prompt: input })
  }
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
  .command(
    '$0 [prompt..]',
    'Start chat mode',
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
    'chat [prompt..]',
    'Explicit chat command',
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
      const ctx = await resolveContext(argv.url)
      const models = await ctx.runtime.listRemoteModels(ctx.session, ctx.runtimeUrl, ctx.apiKey)

      if (models.length === 0) {
        process.stdout.write('No models found.\n')
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
    'sessions',
    'List recent CLI threads',
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
    'watch <action> [backend] [prompt..]',
    'Run or inspect local watch backends',
    (command) =>
      command
        .positional('action', {
          type: 'string',
          choices: ['run', 'backends', 'sessions', 'show', 'approvals', 'approve', 'reject'] as const,
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
      const action = String(argv.action)

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
          process.stdout.write('No pending remote approvals.\n')
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

      const backend = argv.backend as WatchBackend | undefined
      if (!backend || !['codex', 'claude', 'codebuddy'].includes(backend)) {
        throw new Error('Usage: linx watch run <codex|claude|codebuddy> <prompt> [-- backend args]')
      }

      const prompt = (argv.prompt as string[] | undefined)?.join(' ').trim() || undefined
      const exitCode = await runWatch({
        backend,
        mode: argv.mode as WatchMode,
        cwd: argv.cwd || process.cwd(),
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
