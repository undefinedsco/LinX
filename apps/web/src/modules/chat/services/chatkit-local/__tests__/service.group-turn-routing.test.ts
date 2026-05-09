import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalChatKitService } from '../service'
import { agentTable, chatTable, contactTable, ContactType, credentialTable } from '@undefineds.co/models'

vi.mock('../runtime-sidecar', () => ({
  RuntimeSidecarSink: class RuntimeSidecarSink {
    persistRuntimeEvent = vi.fn().mockResolvedValue(undefined)
  },
}))

function createSseResponse(chunks: string[]) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`))
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

async function collectStreamEvents(result: Awaited<ReturnType<LocalChatKitService['process']>>) {
  expect(result.type).toBe('streaming')
  if (result.type !== 'streaming') throw new Error('Expected streaming result')

  const decoder = new TextDecoder()
  let buffer = ''
  const events: Array<Record<string, any>> = []

  for await (const chunk of result.stream()) {
    buffer += decoder.decode(chunk, { stream: true })

    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      boundary = buffer.indexOf('\n\n')

      const payload = rawEvent
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n')

      if (payload) events.push(JSON.parse(payload))
    }
  }

  return events
}

function createMockStore() {
  const thread = {
    id: 'thread-1',
    status: { type: 'active' as const },
    created_at: 1,
    updated_at: 1,
    metadata: { chat_id: 'chat-1' },
  }
  const items: any[] = []
  let assistantIndex = 0
  let userIndex = 0

  return {
    generateThreadId: vi.fn(() => 'thread-1'),
    generateItemId: vi.fn((itemType: string) => {
      if (itemType === 'assistant_message') {
        assistantIndex += 1
        return `assistant-${assistantIndex}`
      }
      userIndex += 1
      return `user-${userIndex}`
    }),
    saveThread: vi.fn(),
    loadThread: vi.fn(async () => thread),
    loadThreadItems: vi.fn(async () => ({ data: items, has_more: false })),
    addThreadItem: vi.fn(async (_threadId: string, item: any) => {
      items.push(item)
    }),
    saveItem: vi.fn(async (_threadId: string, item: any) => {
      const index = items.findIndex((stored) => stored.id === item.id)
      if (index >= 0) items[index] = item
    }),
    deleteThread: vi.fn(),
    loadItem: vi.fn(),
    deleteThreadItem: vi.fn(),
    saveAttachment: vi.fn(),
    loadAttachment: vi.fn(),
    deleteAttachment: vi.fn(),
  }
}

function rowsForTable(table: unknown): unknown[] {
  if (table === chatTable) {
    return [{
      id: 'chat-1',
      participants: ['contact-coder'],
    }]
  }
  if (table === contactTable) {
    return [{
      id: 'contact-coder',
      name: 'Coder',
      alias: 'Coder',
      contactType: ContactType.AGENT,
      entityUri: 'agent-coder',
    }]
  }
  if (table === agentTable) {
    return [{
      id: 'agent-coder',
      name: 'Coder',
      provider: 'undefineds',
      model: 'linx-lite',
      instructions: 'You are a focused coding assistant.',
      temperature: 0.2,
    }]
  }
  if (table === credentialTable) {
    return [{
      id: 'undefineds-default',
      provider: '/settings/ai/providers.ttl#undefineds',
      service: 'ai',
      status: 'active',
      apiKey: 'linx-test-key',
      baseUrl: 'https://api.undefineds.co/v1',
    }]
  }
  return []
}

function createMockDb() {
  return {
    select() {
      return {
        from(table: unknown) {
          return {
            where() {
              return {
                execute: vi.fn().mockResolvedValue(rowsForTable(table)),
              }
            },
            execute: vi.fn().mockResolvedValue(rowsForTable(table)),
          }
        },
      }
    },
  }
}

describe('LocalChatKitService group turn routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__ = false
  })

  it('routes a group message to an undefineds agent through the normal provider endpoint', async () => {
    const store = createMockStore()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://api.undefineds.co/v1/chat/completions') {
        return createSseResponse(['收到'])
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const service = new LocalChatKitService({
      store: store as any,
      db: createMockDb() as any,
      webId: 'https://alice.example/profile/card#me',
      authFetch: vi.fn() as any,
    })

    const result = await service.process(JSON.stringify({
      type: 'threads.add_user_message',
      params: {
        thread_id: 'thread-1',
        input: {
          content: [{ type: 'input_text', text: '@Coder 帮我看下' }],
        },
      },
    }), {})

    const events = await collectStreamEvents(result)
    const providerCall = fetchMock.mock.calls.find(([input]) => String(input) === 'https://api.undefineds.co/v1/chat/completions')
    expect(providerCall).toBeDefined()
    const requestBody = JSON.parse(String(providerCall?.[1]?.body))

    expect(requestBody.model).toBe('linx-lite')
    expect(requestBody.messages[0]).toMatchObject({
      role: 'system',
      content: 'You are a focused coding assistant.',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.undefineds.co/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer linx-test-key' }),
      }),
    )
    expect(store.addThreadItem).toHaveBeenCalledWith('thread-1', expect.objectContaining({
      id: 'assistant-1',
      metadata: expect.objectContaining({
        maker: 'agent-coder',
        senderName: 'Coder',
        routedBy: 'mention',
        routeTargetAgentId: 'agent-coder',
      }),
    }), {})
    expect(events.map((event) => event.type)).toEqual([
      'thread.item.added',
      'thread.item.done',
      'thread.item.added',
      'thread.item.updated',
      'thread.item.done',
      'thread.updated',
    ])
  })
})
