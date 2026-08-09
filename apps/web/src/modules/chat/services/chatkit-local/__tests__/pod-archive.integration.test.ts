// @vitest-environment node
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { Message, type ThreadStreamEvent } from '@/lib/vendor/xpod-chatkit'
import { Chat, Thread } from '@/lib/vendor/xpod-chatkit'
import { aiProviderResource, credentialResource, getDefaultAIConfigCredentialId } from '@undefineds.co/models'
import { createLocalChatKitFetch } from '../fetch-handler'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '@/test/xpod-integration'

const chatkitSchema = {
  Chat,
  Thread,
  Message,
  aiProviderResource,
  credentialResource,
}

let context: XpodIntegrationContext<typeof chatkitSchema> | null = null

async function getContext(): Promise<XpodIntegrationContext<typeof chatkitSchema>> {
  if (context) return context
  context = await createXpodIntegrationContext({
    schema: chatkitSchema,
    resources: [Chat, Thread, Message, aiProviderResource, credentialResource],
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

function resourceUrlFromSubject(subject: string): string {
  const hashIndex = subject.indexOf('#')
  return hashIndex >= 0 ? subject.slice(0, hashIndex) : subject
}

function localIdFromSubject(value: string | null | undefined): string | null {
  if (!value) return null
  const hashIndex = value.lastIndexOf('#')
  if (hashIndex >= 0 && hashIndex < value.length - 1) return value.slice(hashIndex + 1)
  const slashIndex = value.lastIndexOf('/')
  return slashIndex >= 0 ? value.slice(slashIndex + 1) : value
}

async function findMessageByItemId(db: XpodIntegrationContext<typeof chatkitSchema>['db'], itemId: string) {
  const direct = await (db as any).findById(Message as any, itemId).catch(() => null)
  if (direct) return direct

  const messages = await db.select().from(Message).execute()
  return messages.find((message: any) => (
    message.id === itemId
    || localIdFromSubject(message.id) === itemId
    || localIdFromSubject(message['@id']) === itemId
  )) ?? null
}

afterAll(async () => {
  await context?.stop()
}, 90000)

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('LocalChatKit pod archive integration', () => {
  it('creates a thread, streams an assistant reply, and archives both messages in Pod', { timeout: 90000 }, async () => {
    const { db, webId } = await getContext()
    const sessionFetch = db.getDialect().getAuthenticatedFetch()
    if (typeof sessionFetch !== 'function') {
      throw new Error('Integration DB authenticated fetch is unavailable')
    }

    const chatId = `chatkit-e2e-${Date.now()}`
    const prompt = 'hello from local chatkit integration'
    const assistantText = 'assistant reply from mocked provider'
    const providerBase = 'https://provider.example/v1'
    const providerId = 'openai'
    const credentialId = getDefaultAIConfigCredentialId(providerId)

    await db.insert(aiProviderResource).values({
      id: aiProviderResource.buildId({ id: providerId }),
      baseUrl: providerBase,
    }).execute()

    await db.insert(credentialResource).values({
      id: credentialResource.buildId({ id: credentialId }),
      provider: `/settings/providers/${providerId}.ttl`,
      service: 'ai',
      status: 'active',
      apiKey: 'test-key',
    }).execute()

    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
      if (url.endsWith('/v1/chat/completions')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          provider?: string
          model?: string
          messages?: Array<{ role: string; content: string }>
          stream?: boolean
        }
        expect(body.provider).toBe(providerId)
        expect(body.model).toBe(`${providerId}/test-model`)
        expect(body.stream).toBe(true)
        expect(body.messages?.some((message) => message.role === 'user' && message.content === prompt)).toBe(true)
        return createProviderResponse(['assistant ', 'reply ', 'from mocked provider'])
      }
      return sessionFetch(input as RequestInfo | URL, init)
    })

    const localFetch = createLocalChatKitFetch({ db, webId, authFetch: authFetch as typeof fetch })
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
    const userDone = events.find((event) => event.type === 'thread.item.done'
      && (event as any).item?.type === 'user_message') as
      | Extract<ThreadStreamEvent, { type: 'thread.item.done' }>
      | undefined

    expect(threadCreated?.thread.id).toBeTruthy()
    expect(userDone).toBeDefined()
    expect(assistantDone).toBeDefined()
    expect((assistantDone as any).item.content[0]?.text).toBe(assistantText)

    const threadId = threadCreated!.thread.id
    const userItem = (userDone as any).item
    const assistantItem = (assistantDone as any).item
    const userMessage = await findMessageByItemId(db, userItem.id)
    const assistantMessage = await findMessageByItemId(db, assistantItem.id)

    expect(userMessage?.content).toBe(prompt)
    expect(assistantMessage?.content).toBe(assistantText)
    expect(assistantMessage?.status).toBe('completed')

    const userSubject = (userMessage as any)?.['@id']
    const assistantSubject = (assistantMessage as any)?.['@id']
    expect(userSubject).toBeTruthy()
    expect(assistantSubject).toBeTruthy()

    const messageResourceUrls = Array.from(new Set([
      resourceUrlFromSubject(userSubject),
      resourceUrlFromSubject(assistantSubject),
    ]))
    const turtle = (await Promise.all(messageResourceUrls.map(async (messageResourceUrl) => {
      const podResponse = await authFetch(messageResourceUrl, {
        headers: { Accept: 'text/turtle' },
      })
      expect(podResponse.ok).toBe(true)
      return podResponse.text()
    }))).join('\n')

    expect(turtle).toContain(`index.ttl#${threadId}`)
    expect(turtle).toContain(prompt)
    expect(turtle).toContain(assistantText)
    const providerCalls = authFetch.mock.calls.filter(([input]) => {
      const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
      return url.endsWith('/v1/chat/completions')
    })
    expect(providerCalls).toHaveLength(1)
  })
})
