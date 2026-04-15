import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  persistRuntimeEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../runtime-sidecar', () => ({
  RuntimeSidecarSink: class RuntimeSidecarSink {
    persistRuntimeEvent = mocked.persistRuntimeEvent
  },
}))

vi.mock('@/lib/vendor/xpod-chatkit', () => ({
  extractUserMessageText: (content: Array<{ type: string; text?: string }>) => content
    .filter((part) => part.type === 'input_text')
    .map((part) => part.text ?? '')
    .join('\n'),
  generateId: (prefix: string) => `${prefix}-generated`,
  isStreamingReq: (request: { type?: string }) => request.type === 'threads.add_client_tool_output',
  nowTimestamp: () => 1,
}))

vi.mock('@/lib/vendor/xpod-credential', () => ({
  Credential: {},
  CredentialStatus: { ACTIVE: 'active' },
  ServiceType: { AI: 'ai' },
}))

import { LocalChatKitService } from '../service'

function createSseResponse(events: unknown[]) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
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
  if (result.type !== 'streaming') {
    throw new Error('Expected streaming result')
  }

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

      if (!rawEvent.trim()) continue

      const payload = rawEvent
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n')

      if (!payload) continue
      events.push(JSON.parse(payload))
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

  const itemMap = new Map<string, any>([
    ['tool-item-1', {
      id: 'tool-item-1',
      thread_id: 'thread-1',
      type: 'client_tool_call',
      name: 'write_file',
      arguments: '{"path":"/tmp/demo.txt"}',
      call_id: 'call-1',
      status: 'pending',
      created_at: 1,
    }],
  ])

  let assistantIndex = 0
  let toolIndex = 1

  return {
    generateItemId: vi.fn((itemType: string) => {
      if (itemType === 'assistant_message') {
        assistantIndex += 1
        return `assistant-${assistantIndex}`
      }
      toolIndex += 1
      return `tool-item-${toolIndex}`
    }),
    loadItem: vi.fn(async (_threadId: string, itemId: string) => itemMap.get(itemId)),
    saveItem: vi.fn(async (_threadId: string, item: any) => {
      itemMap.set(item.id, item)
    }),
    loadThread: vi.fn(async () => thread),
    addThreadItem: vi.fn(async (_threadId: string, item: any) => {
      itemMap.set(item.id, item)
    }),
  }
}

describe('LocalChatKitService add_client_tool_output integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__ = true
  })

  it('continues runtime output and persists assistant follow-up', async () => {
    const store = createMockStore()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url === '/api/threads/thread-1/runtime') {
        return new Response(JSON.stringify({
          id: 'runtime-1',
          threadId: 'thread-1',
          title: 'Demo Runtime',
          tool: 'codex',
          status: 'active',
          tokenUsage: 0,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      if (url === '/api/threads/thread-1/runtime/events') {
        return createSseResponse([
          { type: 'assistant_delta', ts: 1, threadId: 'runtime-1', text: '继续处理 ' },
          { type: 'assistant_done', ts: 2, threadId: 'runtime-1', text: '继续处理 完成' },
        ])
      }

      if (url === '/api/threads/thread-1/runtime/tool-calls/call-1/respond') {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const service = new LocalChatKitService({
      store: store as any,
      db: {} as any,
      webId: 'https://alice.example/profile/card#me',
      authFetch: vi.fn() as any,
    })

    const result = await service.process(JSON.stringify({
      type: 'threads.add_client_tool_output',
      params: {
        thread_id: 'thread-1',
        item_id: 'tool-item-1',
        output: '{"decision":"approved"}',
      },
    }), {})

    const events = await collectStreamEvents(result)

    expect(store.saveItem).toHaveBeenCalledWith('thread-1', expect.objectContaining({
      id: 'tool-item-1',
      status: 'completed',
      output: '{"decision":"approved"}',
    }), {})
    expect(store.addThreadItem).toHaveBeenCalledWith('thread-1', expect.objectContaining({
      id: 'assistant-1',
      type: 'assistant_message',
    }), {})
    expect(store.saveItem).toHaveBeenLastCalledWith('thread-1', expect.objectContaining({
      id: 'assistant-1',
      status: 'completed',
      content: [expect.objectContaining({ text: '继续处理 完成' })],
    }), {})
    expect(events.map((event) => event.type)).toEqual([
      'thread.item.done',
      'thread.item.added',
      'thread.item.updated',
      'thread.item.done',
    ])
  })

  it('re-enters inbox when runtime emits another tool_call', async () => {
    const store = createMockStore()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url === '/api/threads/thread-1/runtime') {
        return new Response(JSON.stringify({
          id: 'runtime-1',
          threadId: 'thread-1',
          title: 'Demo Runtime',
          tool: 'codex',
          status: 'active',
          tokenUsage: 0,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      if (url === '/api/threads/thread-1/runtime/events') {
        return createSseResponse([
          { type: 'assistant_delta', ts: 1, threadId: 'runtime-1', text: '先检查一下。' },
          { type: 'tool_call', ts: 2, threadId: 'runtime-1', requestId: 'call-2', name: 'open_url', arguments: '{"url":"https://example.com/auth"}' },
        ])
      }

      if (url === '/api/threads/thread-1/runtime/tool-calls/call-1/respond') {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const service = new LocalChatKitService({
      store: store as any,
      db: {} as any,
      webId: 'https://alice.example/profile/card#me',
      authFetch: vi.fn() as any,
    })

    const result = await service.process(JSON.stringify({
      type: 'threads.add_client_tool_output',
      params: {
        thread_id: 'thread-1',
        item_id: 'tool-item-1',
        output: '{"decision":"approved"}',
      },
    }), {})

    const events = await collectStreamEvents(result)

    expect(store.addThreadItem).toHaveBeenCalledWith('thread-1', expect.objectContaining({
      type: 'client_tool_call',
      call_id: 'call-2',
      name: 'open_url',
      status: 'pending',
    }), {})
    expect(store.saveItem).toHaveBeenLastCalledWith('thread-1', expect.objectContaining({
      id: 'assistant-1',
      status: 'incomplete',
      content: [expect.objectContaining({ text: expect.stringContaining('已转入收件箱等待处理') })],
    }), {})
    expect(events.map((event) => event.type)).toContain('thread.item.added')
    expect(mocked.persistRuntimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'runtime-1' }),
      expect.objectContaining({ type: 'tool_call', requestId: 'call-2' }),
      { chatId: 'chat-1', threadId: 'thread-1' },
    )
  })
})
