import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  stageAiDraft: vi.fn(async () => ({ state: 'draft' })),
}))

vi.mock('../runtime-sidecar', () => ({
  RuntimeSidecarSink: class RuntimeSidecarSink {
    persistRuntimeEvent = vi.fn().mockResolvedValue(undefined)
  },
}))

vi.mock('@/modules/files', () => ({
  stageAiDraft: mocked.stageAiDraft,
  writeAiCellChange: vi.fn(),
  stageAiColumnChange: vi.fn(),
  readRawTextResource: vi.fn(),
  saveRawTextResource: vi.fn(),
  createRawTextResource: vi.fn(),
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

import { LocalChatKitService } from '../service'

function sse(events: unknown[]) {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      controller.close()
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

async function drain(result: Awaited<ReturnType<LocalChatKitService['process']>>) {
  if (result.type !== 'streaming') throw new Error('Expected streaming result')
  const decoder = new TextDecoder()
  let text = ''
  for await (const chunk of result.stream()) text += decoder.decode(chunk, { stream: true })
  return text
}

describe('runtime file tool calls go through the draft layer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__ = true
  })

  it('stages the edit as a draft and tells the runtime it is not live', async () => {
    const FILE = 'https://pod.example/docs/plan.md'
    const items = new Map<string, any>([
      ['tool-item-1', { id: 'tool-item-1', thread_id: 'thread-1', type: 'client_tool_call', name: 'open_url', arguments: {}, call_id: 'call-1', status: 'pending', created_at: 1 }],
    ])
    const thread = { id: 'thread-1', status: { type: 'active' }, created_at: 1, updated_at: 1, metadata: {} as Record<string, unknown> }
    let toolCounter = 1
    let assistantCounter = 0
    const store = {
      generateItemId: vi.fn((type: string) => (type === 'assistant_message' ? `assistant-${++assistantCounter}` : `tool-item-${++toolCounter}`)),
      loadItem: vi.fn(async (_t: string, id: string) => items.get(id)),
      saveItem: vi.fn(async (_t: string, item: any) => { items.set(item.id, item) }),
      loadThread: vi.fn(async () => thread),
      saveThread: vi.fn(async () => undefined),
      addThreadItem: vi.fn(async (_t: string, item: any) => { items.set(item.id, item) }),
    }
    let eventsCall = 0
    const responded: Array<{ url: string; body: string }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/runtime/threads?threadId=thread-1') {
        return new Response(JSON.stringify({ items: [{ id: 'runtime-1', threadId: 'thread-1', title: 'R', tool: 'codex', status: 'active', tokenUsage: 0 }] }), { status: 200 })
      }
      if (url === '/api/runtime/threads/runtime-1/events') {
        eventsCall += 1
        return eventsCall === 1
          ? sse([{ type: 'tool_call', ts: 1, threadId: 'runtime-1', requestId: 'call-2', name: 'files_edit', arguments: JSON.stringify({ uri: FILE, content: '新内容' }) }])
          : sse([{ type: 'assistant_done', ts: 2, threadId: 'runtime-1', text: '好的，等你保留' }])
      }
      if (url.includes('/tool-calls/')) {
        responded.push({ url, body: String(init?.body) })
        return new Response(JSON.stringify({ success: true }), { status: 200 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }))

    const service = new LocalChatKitService({
      store: store as any,
      db: { select: () => ({ from: () => ({ execute: async () => [] }) }) } as any,
      webId: 'https://pod.example/profile/card#me',
      authFetch: vi.fn() as any,
    })
    const text = await drain(await service.process(JSON.stringify({
      type: 'threads.add_client_tool_output',
      params: { thread_id: 'thread-1', item_id: 'tool-item-1', output: '{}' },
    }), {}))

    expect(mocked.stageAiDraft).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      targetResourceUri: FILE,
      draftContent: '新内容',
      delegated: false,
    }))
    const reply = responded.find((entry) => entry.url.includes('call-2'))
    expect(JSON.parse(reply!.body).output).toContain('已作为未确认草稿，等用户保留')
    expect(text).toContain('files_edit')
    expect(text).toContain('好的，等你保留')
  })

  it('carries a 问 LinX citation on the message and into the runtime prompt', async () => {
    const store = { generateItemId: vi.fn(() => 'user-1') }
    const service = new LocalChatKitService({
      store: store as any, db: {} as any, webId: 'https://pod.example/profile/card#me', authFetch: vi.fn() as any,
    })
    const citation = { sourceUri: 'https://pod.example/docs/a.pdf', locator: { page: 3, quote: '第三条' }, title: 'a.pdf' }
    const message = await (service as any).createUserMessage(
      'thread-1', [{ type: 'input_text', text: '这是什么意思' }], [], undefined, undefined, {}, undefined, citation,
    )
    expect(message.citation).toEqual(citation)
    const prompt = await (service as any).buildRuntimeUserText(message)
    expect(prompt).toContain('这是什么意思')
    expect(prompt).toContain('uri: https://pod.example/docs/a.pdf')
    expect(prompt).toContain('page: 3')
    const plain = await (service as any).createUserMessage('thread-1', [{ type: 'input_text', text: 'hi' }], [], undefined, undefined, {}, undefined, 'junk')
    expect(plain.citation).toBeUndefined()
  })
})
