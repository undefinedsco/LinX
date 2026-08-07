import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalChatKitService } from '../service'

function createStore(overrides: Record<string, unknown> = {}) {
  return {
    loadItem: vi.fn(),
    saveItem: vi.fn(),
    ...overrides,
  } as any
}

const db = {
  getDialect: () => ({ getPodUrl: () => 'https://pod.example/alice/' }),
} as any

afterEach(() => vi.unstubAllGlobals())

// Regression: ISSUE-CHAT-P0 — feedback was acknowledged without persistence and abort stayed at the UI adapter.
// Found by /qa on 2026-08-02.
// Report: .gstack/qa-reports/qa-report-linx-local-2026-08-02.md
describe('LocalChatKitService P0 data and cancellation', () => {
  it('persists ChatKit feedback on every referenced item', async () => {
    const item = {
      id: 'assistant-1',
      thread_id: 'thread-1',
      type: 'assistant_message',
      content: [{ type: 'output_text', text: 'answer' }],
    }
    const store = createStore({ loadItem: vi.fn(async () => ({ ...item })) })
    const service = new LocalChatKitService({ store, db, webId: 'https://id.example/alice#me', authFetch: vi.fn() as any })

    const result = await service.process(JSON.stringify({
      type: 'items.feedback',
      params: { thread_id: 'thread-1', item_ids: ['assistant-1'], kind: 'positive' },
    }), {})

    expect(result.type).toBe('non_streaming')
    expect(store.saveItem).toHaveBeenCalledWith('thread-1', expect.objectContaining({ feedback: 'positive' }), {})
  })

  it('passes the request AbortSignal to an external provider fetch', async () => {
    const store = createStore()
    const service = new LocalChatKitService({ store, db, webId: 'https://id.example/alice#me', authFetch: vi.fn() as any })
    const controller = new AbortController()
    const providerFetch = vi.fn(async () => new Response(new ReadableStream({ start(stream) { stream.close() } }), { status: 200 }))
    vi.stubGlobal('fetch', providerFetch)

    const stream = (service as any).streamFromProvider(
      { baseUrl: 'https://provider.example/v1', apiKey: 'secret' },
      [{ role: 'user', content: 'hello' }],
      'test-model',
      {},
      controller.signal,
    )
    await stream.next()

    expect(providerFetch).toHaveBeenCalledWith('https://provider.example/v1/chat/completions', expect.objectContaining({ signal: controller.signal }))
  })

  it('persists partial output as incomplete when generation is stopped', async () => {
    const store = createStore({
      generateItemId: vi.fn(() => 'assistant-1'),
      addThreadItem: vi.fn(async () => undefined),
      saveItem: vi.fn(async () => undefined),
      loadThreadItems: vi.fn(async () => ({ data: [], has_more: false })),
    })
    const service = new LocalChatKitService({ store, db, webId: 'https://id.example/alice#me', authFetch: vi.fn() as any }) as any
    service.getRuntimeThread = vi.fn(async () => null)
    service.resolveThreadAgentConfig = vi.fn(async () => ({ provider: 'test', model: 'test-model' }))
    service.resolvePlatformModel = vi.fn(() => null)
    service.getAiConfig = vi.fn(async () => ({ baseUrl: 'https://provider.example/v1', apiKey: 'secret' }))
    service.streamFromProvider = async function* () {
      yield 'partial answer'
      const error = new Error('stopped')
      error.name = 'AbortError'
      throw error
    }

    const events: any[] = []
    for await (const event of service.respond({ id: 'thread-1' }, {
      id: 'user-1',
      thread_id: 'thread-1',
      type: 'user_message',
      content: [{ type: 'input_text', text: 'hello' }],
    }, { signal: new AbortController().signal })) {
      events.push(event)
    }

    expect(store.saveItem).toHaveBeenCalledWith('thread-1', expect.objectContaining({
      status: 'incomplete',
      content: [{ type: 'output_text', text: 'partial answer', annotations: [] }],
    }), expect.anything())
    expect(events).toContainEqual(expect.objectContaining({
      type: 'thread.item.done',
      item: expect.objectContaining({ status: 'incomplete' }),
    }))
  })

  it('retries an assistant response from the preceding user message', async () => {
    const userItem = {
      id: 'user-1',
      thread_id: 'thread-1',
      type: 'user_message',
      content: [{ type: 'input_text', text: 'try again' }],
    }
    const assistantItem = {
      id: 'assistant-1',
      thread_id: 'thread-1',
      type: 'assistant_message',
      content: [{ type: 'output_text', text: 'old answer' }],
    }
    const thread = { id: 'thread-1', status: { type: 'active' } }
    const store = createStore({
      loadThread: vi.fn(async () => thread),
      loadThreadItems: vi.fn(async () => ({ data: [userItem, assistantItem], has_more: false })),
    })
    const service = new LocalChatKitService({ store, db, webId: 'https://id.example/alice#me', authFetch: vi.fn() as any }) as any
    const respond = vi.fn(async function* () {
      yield { type: 'thread.item.done', item: { ...assistantItem, content: [{ type: 'output_text', text: 'new answer' }] } }
    })
    service.respond = respond

    const result = await service.process(JSON.stringify({
      type: 'threads.retry_after_item',
      params: { thread_id: 'thread-1', item_id: 'assistant-1' },
    }), {})
    expect(result.type).toBe('streaming')
    if (result.type === 'streaming') {
      for await (const _chunk of result.stream()) {
        // Drain the real ChatKit streaming adapter.
      }
    }

    expect(respond).toHaveBeenCalledWith(thread, userItem, {})
  })

  it('retries when ChatKit identifies the user item to continue after', async () => {
    const userItem = {
      id: 'user-1',
      thread_id: 'thread-1',
      type: 'user_message',
      content: [{ type: 'input_text', text: 'try again' }],
      inference_options: { tool_choice: { id: 'web_search' }, model: 'linx-lite' },
    }
    const thread = { id: 'thread-1', status: { type: 'active' } }
    const store = createStore({
      loadThread: vi.fn(async () => thread),
      loadThreadItems: vi.fn(async () => ({ data: [userItem], has_more: false })),
    })
    const service = new LocalChatKitService({ store, db, webId: 'https://id.example/alice#me', authFetch: vi.fn() as any }) as any
    const respond = vi.fn(async function* () {
      yield { type: 'thread.item.done', item: { id: 'assistant-2', type: 'assistant_message' } }
    })
    service.respond = respond

    const result = await service.process(JSON.stringify({
      type: 'threads.retry_after_item',
      params: { thread_id: 'thread-1', item_id: 'user-1' },
    }), {})
    expect(result.type).toBe('streaming')
    if (result.type === 'streaming') {
      for await (const _chunk of result.stream()) {
        // Drain the real ChatKit streaming adapter.
      }
    }

    expect(respond).toHaveBeenCalledWith(thread, userItem, {}, {
      tool_choice: { id: 'web_search' },
      model: 'linx-lite',
    })
  })

  it('includes image and document attachments in model conversation content', async () => {
    const store = createStore({
      loadThreadItems: vi.fn(async () => ({
        data: [{
          id: 'user-1',
          thread_id: 'thread-1',
          type: 'user_message',
          content: [{ type: 'input_text', text: '分析这些附件' }],
          attachments: [
            { id: 'image-1', type: 'image', name: 'pixel.png', mime_type: 'image/png', preview_url: 'blob:test' },
            { id: 'text-1', type: 'file', name: 'notes.txt', mime_type: 'text/plain' },
          ],
        }],
        has_more: false,
      })),
      readAttachmentBytes: vi.fn(async (id: string) => (
        id === 'image-1' ? new Uint8Array([1, 2, 3]) : new TextEncoder().encode('Pod document body')
      )),
    })
    const service = new LocalChatKitService({ store, db, webId: 'https://id.example/alice#me', authFetch: vi.fn() as any })

    const messages = await (service as any).buildConversationHistory('thread-1', {})

    expect(messages[1].content).toEqual(expect.arrayContaining([
      { type: 'text', text: '分析这些附件' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AQID' } },
      { type: 'text', text: expect.stringContaining('Pod document body') },
    ]))
  })
})
