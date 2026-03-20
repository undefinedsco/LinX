// @vitest-environment node
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { Message, MessageRole, type ThreadStreamEvent } from '@/lib/vendor/xpod-chatkit'
import { Chat, Thread } from '@/lib/vendor/xpod-chatkit'
import { createLocalChatKitFetch } from '../fetch-handler'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '@/test/xpod-integration'

const chatkitSchema = {
  Chat,
  Thread,
  Message,
}

let context: XpodIntegrationContext<typeof chatkitSchema> | null = null

async function getContext(): Promise<XpodIntegrationContext<typeof chatkitSchema>> {
  if (context) return context
  context = await createXpodIntegrationContext({
    schema: chatkitSchema,
    tables: [Chat, Thread, Message],
  })
  return context
}

function collectSseEvents(body: string): ThreadStreamEvent[] {
  return body
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => chunk
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice(6))
      .join('\n'))
    .filter(Boolean)
    .map((payload) => JSON.parse(payload) as ThreadStreamEvent)
}

function createProviderResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          choices: [{ delta: { content: chunk } }],
        })}\n\n`))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function extractThreadId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (value.includes('#')) return value.split('#').pop() || undefined
  return value
}

afterAll(async () => {
  await context?.stop()
}, 30000)

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('LocalChatKit pod archive integration', () => {
  it('creates a thread, streams an assistant reply, and archives both messages in Pod', { timeout: 30000 }, async () => {
    const { db, webId } = await getContext()
    const sessionFetch = db.getDialect().getAuthenticatedFetch()
    if (typeof sessionFetch !== 'function') {
      throw new Error('Integration DB authenticated fetch is unavailable')
    }

    const chatId = `chatkit-e2e-${Date.now()}`
    const prompt = 'hello from local chatkit integration'
    const assistantText = 'assistant reply from mocked provider'
    const providerBase = 'https://provider.example/v1'
    const providerEndpoint = `${providerBase}/chat/completions`
    const podBase = webId.replace('/profile/card#me', '')
    const credentialsUrl = `${podBase}/settings/credentials.ttl`
    const credentialsTurtle = [
      '<#cred>',
      `  <https://undefineds.co/ns#service> "ai" ;`,
      `  <https://undefineds.co/ns#status> "active" ;`,
      `  <https://undefineds.co/ns#baseUrl> "${providerBase}" ;`,
      `  <https://undefineds.co/ns#apiKey> "test-key" .`,
      '',
    ].join('\n')

    const authFetch: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
      if (url === credentialsUrl) {
        return new Response(credentialsTurtle, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle' },
        })
      }
      return sessionFetch(input as RequestInfo | URL, init)
    }

    const originalFetch = globalThis.fetch
    const providerFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
      if (url === providerEndpoint) {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          model?: string
          messages?: Array<{ role: string; content: string }>
          stream?: boolean
        }
        expect(body.model).toBe('test-model')
        expect(body.stream).toBe(true)
        expect(body.messages?.some((message) => message.role === 'user' && message.content === prompt)).toBe(true)
        return createProviderResponse(['assistant ', 'reply ', 'from mocked provider'])
      }
      return originalFetch(input as RequestInfo | URL, init)
    })
    vi.stubGlobal('fetch', providerFetch)

    const localFetch = createLocalChatKitFetch({ db, webId, authFetch })
    const response = await localFetch('http://local/chatkit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'threads.create',
        metadata: { chat_id: chatId },
        params: {
          input: {
            content: [{ type: 'input_text', text: prompt }],
            inference_options: { model: 'test-model' },
          },
        },
      }),
    })

    expect(response.ok).toBe(true)
    const events = collectSseEvents(await response.text())
    const threadCreated = events.find((event) => event.type === 'thread.created') as
      | Extract<ThreadStreamEvent, { type: 'thread.created' }>
      | undefined
    const assistantDone = events.findLast((event) => event.type === 'thread.item.done'
      && (event as any).item?.type === 'assistant_message') as
      | Extract<ThreadStreamEvent, { type: 'thread.item.done' }>
      | undefined

    expect(threadCreated?.thread.id).toBeTruthy()
    expect(assistantDone).toBeDefined()
    expect((assistantDone as any).item.content[0]?.text).toBe(assistantText)

    const threadId = threadCreated!.thread.id
    const allMessages = await db.select().from(Message).execute()
    const threadMessages = allMessages.filter((message: any) => extractThreadId(message.thread) === threadId)

    expect(threadMessages).toHaveLength(2)

    const userMessage = threadMessages.find((message: any) => message.role === MessageRole.USER)
    const assistantMessage = threadMessages.find((message: any) => message.role === MessageRole.ASSISTANT)

    expect(userMessage?.content).toBe(prompt)
    expect(assistantMessage?.content).toBe(assistantText)
    expect(assistantMessage?.status).toBe('completed')

    const createdAt = new Date(String((assistantMessage as any).createdAt))
    const yyyy = createdAt.getUTCFullYear()
    const mm = String(createdAt.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(createdAt.getUTCDate()).padStart(2, '0')
    const messageResourceUrl = `${podBase}/.data/chat/${chatId}/${yyyy}/${mm}/${dd}/messages.ttl`

    const podResponse = await authFetch(messageResourceUrl, {
      headers: { Accept: 'text/turtle' },
    })
    expect(podResponse.ok).toBe(true)

    const turtle = await podResponse.text()
    expect(turtle).toContain(`index.ttl#${threadId}`)
    expect(turtle).toContain(prompt)
    expect(turtle).toContain(assistantText)
    const providerCalls = providerFetch.mock.calls.filter(([input]) => {
      const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
      return url === providerEndpoint
    })
    expect(providerCalls).toHaveLength(1)
  })
})
