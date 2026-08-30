import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalChatKitService } from '../service'

function createStore(overrides: Record<string, unknown> = {}) {
  return {
    loadItem: vi.fn(),
    loadThread: vi.fn(async (id: string) => ({ id, status: { type: 'active' }, metadata: {} })),
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
  it('persists branch selection and filters sibling items on reload', async () => {
    const thread = { id: 'thread-1', status: { type: 'active' }, metadata: {} }
    const store = createStore({
      loadThread: vi.fn(async () => thread),
      saveThread: vi.fn(async (next: any) => Object.assign(thread, next)),
      loadThreadItems: vi.fn(async () => ({ data: [
        { id: 'root', type: 'user_message', thread_id: 'thread-1' },
        { id: 'branch-a', type: 'user_message', thread_id: 'thread-1', parent_item_id: 'root' },
        { id: 'answer-a', type: 'assistant_message', thread_id: 'thread-1', parent_item_id: 'branch-a' },
        { id: 'branch-b', type: 'user_message', thread_id: 'thread-1', parent_item_id: 'root' },
        { id: 'answer-b', type: 'assistant_message', thread_id: 'thread-1', parent_item_id: 'branch-b' },
      ], has_more: false })),
    })
    const service = new LocalChatKitService({ store, db, webId: 'https://id.example/alice#me', authFetch: vi.fn() as any })
    const result = await service.process(JSON.stringify({ type: 'threads.custom_action', params: {
      action: {
        type: 'message.select_branch',
        payload: { thread_id: 'thread-1', item_id: 'branch-b', parent_item_id: 'root' },
      },
    }}), {})
    if (result.type === 'streaming') for await (const _ of result.stream()) { /* consume */ }
    expect(thread.metadata?.active_branch_by_parent).toEqual({ root: 'branch-b' })
    const listed = await service.process(JSON.stringify({ type: 'items.list', params: { thread_id: 'thread-1' } }), {})
    expect(listed).toMatchObject({ type: 'non_streaming' })
    expect(JSON.parse((listed as any).json).data.map((item: any) => item.id)).toEqual(['root', 'branch-b', 'answer-b'])
    const loaded = await service.process(JSON.stringify({ type: 'threads.get_by_id', params: { thread_id: 'thread-1' } }), {})
    expect(JSON.parse((loaded as any).json).items.data.map((item: any) => item.id)).toEqual(['root', 'branch-b', 'answer-b'])
  })

  it('matches legacy short parent ids to resource-relative branch ids', async () => {
    const originalId = 'chat/demo/messages.ttl#user-1'
    const thread = {
      id: 'thread-1',
      status: { type: 'active' },
      metadata: { active_branch_by_parent: { [`branch-root:${originalId}`]: 'user-2' } },
    }
    const store = createStore({
      loadThread: vi.fn(async () => thread),
      loadThreadItems: vi.fn(async () => ({ data: [
        { id: originalId, type: 'user_message', parent_item_id: `branch-root:${originalId}`, content: [] },
        { id: 'assistant-old', type: 'assistant_message', parent_item_id: 'user-1', content: [] },
        { id: 'user-2', type: 'user_message', parent_item_id: `branch-root:${originalId}`, content: [] },
        { id: 'assistant-new', type: 'assistant_message', parent_item_id: 'user-2', content: [] },
      ], has_more: false })),
    })
    const service = new LocalChatKitService({ store, db, webId: 'https://id.example/alice#me', authFetch: vi.fn() as any })

    const result = await service.process(JSON.stringify({
      type: 'items.list',
      params: { thread_id: 'thread-1' },
    }), {})

    expect(JSON.parse((result as any).json).data.map((item: any) => item.id))
      .toEqual(['user-2', 'assistant-new'])
  })

  it('links a follow-up user message to the active response branch', async () => {
    const thread = {
      id: 'thread-1',
      status: { type: 'active' },
      metadata: { active_branch_by_parent: { 'branch-root': 'edited', edited: 'answer-new' } },
    }
    const store = createStore({
      loadThread: vi.fn(async () => thread),
      loadThreadItems: vi.fn(async () => ({ data: [
        { id: 'original', type: 'user_message', parent_item_id: 'branch-root', branch_id: 'original-branch' },
        { id: 'answer-old', type: 'assistant_message', parent_item_id: 'original', branch_id: 'original-branch' },
        { id: 'edited', type: 'user_message', parent_item_id: 'branch-root', branch_id: 'edited-branch' },
        { id: 'answer-new', type: 'assistant_message', parent_item_id: 'edited', branch_id: 'edited-branch' },
      ], has_more: false })),
      generateItemId: vi.fn(() => 'follow-up'),
      addThreadItem: vi.fn(async () => undefined),
    })
    const service = new LocalChatKitService({ store, db, webId: 'https://id.example/alice#me', authFetch: vi.fn() as any }) as any
    service.respond = vi.fn(async function* () {})

    const result = await service.process(JSON.stringify({
      type: 'threads.add_user_message',
      params: {
        thread_id: 'thread-1',
        input: { content: [{ type: 'input_text', text: 'continue' }] },
      },
    }), {})
    if (result.type === 'streaming') for await (const _ of result.stream()) { /* consume */ }

    expect(store.addThreadItem).toHaveBeenCalledWith('thread-1', expect.objectContaining({
      id: 'follow-up',
      parent_item_id: 'answer-new',
      branch_id: 'edited-branch',
    }), {})
  })

  it('handles custom message deletion through the ChatKit action channel', async () => {
    const thread = { id: 'thread-1', status: { type: 'active' }, metadata: { active_branch_by_parent: { 'user-1': 'assistant-1' } } }
    const store = createStore({
      loadThread: vi.fn(async () => thread),
      saveThread: vi.fn(async () => undefined),
      loadThreadItems: vi.fn(async () => ({ data: [
        { id: 'user-1', type: 'user_message', thread_id: 'thread-1' },
        { id: 'assistant-1', type: 'assistant_message', thread_id: 'thread-1', parent_item_id: 'user-1' },
      ], has_more: false })),
      deleteThreadItem: vi.fn(async () => undefined),
    })
    const service = new LocalChatKitService({ store, db, webId: 'https://id.example/alice#me', authFetch: vi.fn() as any })
    const result = await service.process(JSON.stringify({
      type: 'threads.custom_action',
      params: {
        action: {
          type: 'message.delete',
          payload: { thread_id: 'thread-1', item_id: 'user-1' },
        },
      },
    }), {})
    expect(result.type).toBe('streaming')
    const events: any[] = []
    if (result.type === 'streaming') for await (const chunk of result.stream()) events.push(JSON.parse(new TextDecoder().decode(chunk).replace(/^data:\s*/, '').trim()))
    expect(store.deleteThreadItem).toHaveBeenNthCalledWith(1, 'thread-1', 'user-1', {})
    expect(store.deleteThreadItem).toHaveBeenNthCalledWith(2, 'thread-1', 'assistant-1', {})
    expect(thread.metadata.active_branch_by_parent).toEqual({})
    expect(events).toContainEqual({ type: 'thread.item.deleted', thread_id: 'thread-1', item_id: 'assistant-1' })
  })

  it('edits a user message and can regenerate from the edited item', async () => {
    const item = { id: 'user-1', thread_id: 'thread-1', type: 'user_message', content: [{ type: 'input_text', text: 'old' }] }
    const thread = { id: 'thread-1', status: { type: 'active' }, metadata: {} }
    const store = createStore({
      loadItem: vi.fn(async () => ({ ...item })),
      saveItem: vi.fn(async () => undefined),
      loadThread: vi.fn(async () => thread),
      saveThread: vi.fn(async () => undefined),
      loadThreadItems: vi.fn(async () => ({ data: [
        item,
        { id: 'assistant-old', thread_id: 'thread-1', type: 'assistant_message', content: [] },
        { id: 'user-later', thread_id: 'thread-1', type: 'user_message', content: [{ type: 'input_text', text: 'later' }] },
        { id: 'assistant-later', thread_id: 'thread-1', type: 'assistant_message', content: [] },
      ], has_more: false })),
      generateItemId: vi.fn(() => 'user-branch-1'),
    })
    const service = new LocalChatKitService({ store, db, webId: 'https://id.example/alice#me', authFetch: vi.fn() as any }) as any
    service.respond = vi.fn(async function* (_thread: any, edited: any) {
      yield { type: 'thread.item.done', item: { id: 'assistant-1', type: 'assistant_message', content: [{ type: 'output_text', text: edited.content[0].text }] } }
    })
    const result = await service.process(JSON.stringify({
      type: 'threads.custom_action',
      params: {
        action: {
          type: 'message.edit',
          payload: { thread_id: 'thread-1', item_id: 'user-1', text: 'new', regenerate: true },
        },
      },
    }), {})
    const events: any[] = []
    if (result.type === 'streaming') for await (const chunk of result.stream()) events.push(JSON.parse(new TextDecoder().decode(chunk).replace(/^data:\s*/, '').trim()))
    expect(store.saveItem).toHaveBeenCalledWith('thread-1', expect.objectContaining({
      content: [{ type: 'input_text', text: 'new' }],
      parent_item_id: 'branch-root:user-1',
      supersedes: 'user-1',
      branch_id: expect.stringMatching(/^branch-/),
    }), {})
    expect(service.respond).toHaveBeenCalledWith(
      thread,
      expect.objectContaining({ id: 'user-branch-1' }),
      {},
      undefined,
      { selectResponseBranch: true },
    )
    expect(store.saveItem).toHaveBeenCalledWith('thread-1', expect.objectContaining({
      id: 'user-1',
      parent_item_id: 'branch-root:user-1',
      branch_id: 'branch-original:user-1',
    }), {})
    expect(store.saveItem).toHaveBeenCalledWith('thread-1', expect.objectContaining({
      id: 'assistant-old',
      parent_item_id: 'user-1',
      branch_id: 'branch-original:user-1',
    }), {})
    expect(store.saveItem).toHaveBeenCalledWith('thread-1', expect.objectContaining({
      id: 'user-later',
      parent_item_id: 'assistant-old',
      branch_id: 'branch-original:user-1',
    }), {})
    expect(store.saveItem).toHaveBeenCalledWith('thread-1', expect.objectContaining({
      id: 'assistant-later',
      parent_item_id: 'user-later',
      branch_id: 'branch-original:user-1',
    }), {})
    expect(events).toContainEqual(expect.objectContaining({ type: 'thread.updated' }))
    expect(events).toContainEqual(expect.objectContaining({ type: 'thread.item.added' }))
  })

  it('regenerates a sibling answer from the selected user message', async () => {
    const item = { id: 'user-1', thread_id: 'thread-1', type: 'user_message', content: [{ type: 'input_text', text: 'again' }] }
    const thread = { id: 'thread-1', status: { type: 'active' }, metadata: {} }
    const store = createStore({
      loadItem: vi.fn(async () => item),
      loadThread: vi.fn(async () => thread),
    })
    const service = new LocalChatKitService({ store, db, webId: 'https://id.example/alice#me', authFetch: vi.fn() as any }) as any
    service.respond = vi.fn(async function* () {
      yield { type: 'thread.item.done', item: { id: 'assistant-2', type: 'assistant_message', content: [] } }
    })

    const result = await service.process(JSON.stringify({
      type: 'threads.custom_action',
      params: {
        action: {
          type: 'message.regenerate',
          payload: { thread_id: 'thread-1', item_id: 'user-1' },
        },
      },
    }), {})
    if (result.type === 'streaming') for await (const _ of result.stream()) { /* consume */ }

    expect(service.respond).toHaveBeenCalledWith(thread, item, {}, undefined, { selectResponseBranch: true })
  })

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

  it('passes the request AbortSignal to the authenticated provider runtime', async () => {
    const store = createStore()
    const controller = new AbortController()
    const authFetch = vi.fn(async () => new Response(new ReadableStream({ start(stream) { stream.close() } }), { status: 200 }))
    const providerFetch = vi.fn()
    vi.stubGlobal('fetch', providerFetch)
    const service = new LocalChatKitService({ store, db, webId: 'https://id.example/alice#me', authFetch: authFetch as any })

    const stream = (service as any).streamFromProviderRuntime(
      'test',
      'test-model',
      [{ role: 'user', content: 'hello' }],
      {},
      controller.signal,
    )
    await stream.next()

    expect(authFetch).toHaveBeenCalledWith(
      'https://pod.example/v1/chat/completions',
      expect.objectContaining({ signal: controller.signal }),
    )
    expect(providerFetch).not.toHaveBeenCalled()
  })

  it('restarts an errored runtime session before retrying the message', async () => {
    const store = createStore()
    const service = new LocalChatKitService({ store, db, webId: 'https://id.example/alice#me', authFetch: vi.fn() as any }) as any
    const runtimeFetch = vi.fn(async () => new Response(JSON.stringify({ status: 'active' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', runtimeFetch)

    await service.ensureRuntimeThreadActive({ id: 'runtime-1', status: 'error' })

    expect(runtimeFetch).toHaveBeenCalledWith('/api/runtime/threads/runtime-1/start', { method: 'POST' })
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
    service.streamFromProviderRuntime = async function* () {
      yield 'partial answer'
      // The UI abort callback uses this string as AbortSignal.reason. Fetch
      // propagates it verbatim rather than wrapping it in an AbortError.
      throw 'user_cancelled'
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
    expect(events).not.toContainEqual(expect.objectContaining({
      type: 'thread.item.done',
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

    expect(respond).toHaveBeenCalledWith(thread, userItem, {}, undefined, { selectResponseBranch: true })
    expect(store.saveItem).toHaveBeenCalledWith('thread-1', expect.objectContaining({
      id: 'assistant-1',
      parent_item_id: 'user-1',
    }), {})
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
    }, { selectResponseBranch: true })
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

  it('cuts retry and edit context off at the anchored user message', async () => {
    const store = createStore({
      loadThreadItems: vi.fn(async () => ({
        data: [
          { id: 'assistant-2', thread_id: 'thread-1', type: 'assistant_message', content: [{ type: 'output_text', text: 'later answer' }] },
          { id: 'user-2', thread_id: 'thread-1', type: 'user_message', content: [{ type: 'input_text', text: 'later' }] },
          { id: 'assistant-1', thread_id: 'thread-1', type: 'assistant_message', content: [{ type: 'output_text', text: 'first answer' }] },
          { id: 'user-1', thread_id: 'thread-1', type: 'user_message', content: [{ type: 'input_text', text: 'first' }] },
        ],
        has_more: false,
      })),
    })
    const service = new LocalChatKitService({ store, db, webId: 'https://id.example/alice#me', authFetch: vi.fn() as any })

    const messages = await (service as any).buildConversationHistory('thread-1', {}, undefined, 'user-1')

    expect(messages).toEqual([
      expect.objectContaining({ role: 'system' }),
      { role: 'user', content: 'first' },
    ])
  })
})
