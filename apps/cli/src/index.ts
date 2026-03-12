#!/usr/bin/env node
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { createRemoteCompletion, listRemoteModels } from './lib/chat-api.js'
import { getClientCredentials, loadCredentials } from './lib/credentials-store.js'
import {
  createThread,
  formatThreadLabel,
  getLatestThreadId,
  getOrCreateDefaultChat,
  initPodData,
  listThreads,
  loadMessages,
  loadThread,
  saveAssistantMessage,
  saveUserMessage,
  toOpenAiMessages,
} from './lib/pod-chat-store.js'
import { promptText } from './lib/prompt.js'
import { authenticate } from './lib/solid-auth.js'

interface RuntimeContext {
  xpodUrl: string
  apiKey: string
  session: Awaited<ReturnType<typeof authenticate>>['session']
  chatId: string
}

async function resolveContext(urlOverride?: string): Promise<RuntimeContext> {
  const creds = loadCredentials()
  if (!creds) {
    throw new Error('No credentials found. Please login with xpod-cli first, or place credentials in ~/.linx.')
  }

  const clientCreds = getClientCredentials(creds)
  if (!clientCreds) {
    throw new Error('Only client credentials auth is supported in the MVP CLI.')
  }

  const xpodUrl = urlOverride || creds.url
  const { session, apiKey } = await authenticate(clientCreds.clientId, clientCreds.clientSecret, xpodUrl)
  await initPodData(session)
  const chatId = await getOrCreateDefaultChat(session)

  return { xpodUrl, apiKey, session, chatId }
}

async function runSingleTurn(options: {
  ctx: RuntimeContext
  threadId: string
  model?: string
  prompt: string
}): Promise<void> {
  const { ctx, threadId, model, prompt } = options
  const history = await loadMessages(ctx.session, threadId)

  await saveUserMessage(ctx.session, ctx.chatId, threadId, prompt)

  const reply = await createRemoteCompletion({
    xpodUrl: ctx.xpodUrl,
    apiKey: ctx.apiKey,
    model,
    messages: [...toOpenAiMessages(history), { role: 'user', content: prompt }],
  })

  await saveAssistantMessage(ctx.session, ctx.chatId, threadId, reply)
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
    const latest = await getLatestThreadId(ctx.session, ctx.chatId)
    if (latest) {
      return latest
    }
  }

  return createThread(ctx.session, ctx.chatId, workspace || process.cwd(), 'CLI Session')
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
      const threads = await listThreads(ctx.session, ctx.chatId)
      if (threads.length === 0) {
        process.stdout.write('暂无 threads\n\n')
        continue
      }

      process.stdout.write(`${threads.map((thread) => `- ${formatThreadLabel(thread)}`).join('\n')}\n\n`)
      continue
    }

    if (input === '/new') {
      threadId = await createThread(ctx.session, ctx.chatId, process.cwd(), 'CLI Session')
      process.stdout.write(`已创建 thread: ${threadId}\n\n`)
      continue
    }

    if (input.startsWith('/use ')) {
      const nextThreadId = input.slice(5).trim()
      const thread = await loadThread(ctx.session, nextThreadId)
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

void yargs(hideBin(process.argv))
  .scriptName('linx')
  .command(
    '$0 [prompt..]',
    'Start chat mode',
    (command) =>
      command
        .option('model', { type: 'string', describe: 'Model ID override' })
        .option('continue', { type: 'boolean', default: false, describe: 'Continue latest thread' })
        .option('thread', { type: 'string', describe: 'Use an existing thread ID' })
        .option('url', { type: 'string', describe: 'xpod base URL override' })
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
        .option('url', { type: 'string', describe: 'xpod base URL override' })
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
    (command) => command.option('url', { type: 'string', describe: 'xpod base URL override' }),
    async (argv) => {
      const ctx = await resolveContext(argv.url)
      const models = await listRemoteModels(ctx.session, ctx.xpodUrl, ctx.apiKey)

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
    (command) => command.option('url', { type: 'string', describe: 'xpod base URL override' }),
    async (argv) => {
      const ctx = await resolveContext(argv.url)
      const threads = await listThreads(ctx.session, ctx.chatId)

      if (threads.length === 0) {
        process.stdout.write('No threads found.\n')
      } else {
        process.stdout.write(`${threads.map((thread) => `- ${formatThreadLabel(thread)}`).join('\n')}\n`)
      }

      await ctx.session.logout()
    },
  )
  .strict()
  .help()
  .parseAsync()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
