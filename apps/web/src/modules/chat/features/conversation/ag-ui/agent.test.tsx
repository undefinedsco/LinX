import { describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { Observable } from 'rxjs'
import { ExportedMessageRepository } from '@assistant-ui/react'
import { fromAgUiMessages, useAgUiRuntime } from '@assistant-ui/react-ag-ui'
import { buildLinxCardSurface, readLinxCardSurface } from '@linx/agent-runtime/ag-ui'
import type { StreamingReq, ThreadItem, ThreadStreamEvent } from '@/lib/vendor/xpod-chatkit'
import type { LocalConversationApi } from '../../../services/chatkit-local/fetch-handler'
import { LinxConversationAgent } from './agent'
import { setComposerCitation } from '../../../domain/message-citation'

const THREAD = 'https://alice.example/.data/chat/c1/index.ttl#t1'
const APPROVAL = 'https://alice.example/.data/approvals/a1.ttl#it'

function item(id: string, text: string): ThreadItem {
  return { id, thread_id: 't1', type: 'assistant_message', content: [{ type: 'output_text', text }], created_at: 1 }
}

function backend(events: ThreadStreamEvent[], requests: StreamingReq[] = []): LocalConversationApi {
  return {
    load: async () => ({
      thread: { id: 't1', status: { type: 'active' }, created_at: 0, updated_at: 0 },
      threadUri: THREAD,
      items: [
        { uri: 'https://alice.example/m1', item: { id: 'i1', thread_id: 't1', maker: 'https://bob.example/profile/card#me', type: 'user_message', content: [{ type: 'input_text', text: '早' }], created_at: 0 } },
        { uri: 'https://alice.example/m2', item: item('i2', '早上好') },
      ],
    }),
    resolveItemUri: (id) => `https://alice.example/${id}`,
    uploadAttachment: async (file) => ({ id: 'att-1', type: 'file', name: file.name, mime_type: file.mimeType }),
    async *run(request) {
      requests.push(request)
      for (const event of events) yield event
    },
  }
}

describe('LinxConversationAgent with assistant-ui', () => {
  it('hydrates history and streams the next answer', async () => {
    const requests: StreamingReq[] = []
    const agent = new LinxConversationAgent({
      localThreadId: 't1',
      threadUri: THREAD,
      backend: backend([
        { type: 'thread.item.added', item: item('i4', '') },
        { type: 'thread.item.updated', item_id: 'i4', update: { type: 'assistant_message.content_part.text_delta', delta: '好的' } },
        { type: 'thread.item.done', item: item('i4', '好的') },
      ], requests),
    })
    const loaded = await agent.load()
    const history = {
      load: async () => ExportedMessageRepository.fromArray(fromAgUiMessages(loaded.messages)),
      append: async () => undefined,
    }
    const { result } = renderHook(() => useAgUiRuntime({ agent, adapters: { history } }))
    await waitFor(() => expect(result.current.thread.getState().messages).toHaveLength(2))
    expect(result.current.thread.getState().messages.map((message) => message.id)).toEqual([
      'https://alice.example/m1',
      'https://alice.example/m2',
    ])

    await act(async () => {
      result.current.thread.append('帮我排班')
    })
    await waitFor(() => expect(result.current.thread.getState().messages).toHaveLength(4))
    const last = result.current.thread.getState().messages[3]
    expect(last.role).toBe('assistant')
    expect(JSON.stringify(last.content)).toContain('好的')
    expect(requests[0]).toMatchObject({ type: 'threads.add_user_message' })
  })

  it('exposes a bound card as a part we can map back to its Pod resource', async () => {
    const operations = buildLinxCardSurface({ card: 'approval', resource: APPROVAL, fallbackText: '发送排班日历邀请？' })
    const agent = new LinxConversationAgent({ localThreadId: 't1', threadUri: THREAD, backend: backend([]) })
    agent.run = (() => (
      new Observable((subscriber) => {
        subscriber.next({ type: 'RUN_STARTED', threadId: THREAD, runId: 'r1' })
        subscriber.next({ type: 'ACTIVITY_SNAPSHOT', messageId: `${APPROVAL}#a2ui-card`, activityType: 'a2ui-surface', content: { a2ui_operations: operations } })
        subscriber.next({ type: 'RUN_FINISHED', threadId: THREAD, runId: 'r1' })
        subscriber.complete()
      })
    )) as typeof agent.run
    const { result } = renderHook(() => useAgUiRuntime({ agent }))
    await act(async () => {
      result.current.thread.append('发邀请')
    })
    await waitFor(() => expect(result.current.thread.getState().messages.length).toBeGreaterThan(1))
    const assistant = result.current.thread.getState().messages.at(-1)!
    const part = assistant.content.find((entry) => entry.type === 'tool-call') as { toolCallId: string; artifact?: { a2ui?: unknown } } | undefined
    expect(part?.toolCallId).toBe(`a2ui:${APPROVAL}`)
    expect(readLinxCardSurface(part?.artifact?.a2ui)).toMatchObject({ card: 'approval', resource: APPROVAL })
  })
})

describe('LinxConversationAgent one continuous chat', () => {
  it('loads the whole chat and regenerates an older message in the thread it lives in', async () => {
    const requests: StreamingReq[] = []
    const loads: Array<[string, string | undefined]> = []
    const base = backend([], requests)
    const agent = new LinxConversationAgent({
      localThreadId: 't2',
      threadUri: THREAD,
      chatId: 'chat-1',
      backend: {
        ...base,
        load: async (threadId, chatId) => {
          loads.push([threadId, chatId])
          return {
            thread: { id: 't2', status: { type: 'active' }, created_at: 0, updated_at: 0 },
            threadUri: THREAD,
            items: [
              { uri: 'https://alice.example/old', threadId: 't1', item: { id: 'i-old', thread_id: 't1', type: 'user_message', content: [{ type: 'input_text', text: '上周的问题' }], created_at: 1 } },
              { uri: 'https://alice.example/new', threadId: 't2', item: { id: 'i-new', thread_id: 't2', type: 'user_message', content: [{ type: 'input_text', text: '今天的问题' }], created_at: 2 } },
            ],
          }
        },
      },
    })
    const loaded = await agent.load()
    expect(loads).toEqual([['t2', 'chat-1']])
    expect(loaded.messages.map((message) => message.id)).toEqual(['https://alice.example/old', 'https://alice.example/new'])

    await new Promise<void>((resolve) => {
      agent.run({
        threadId: THREAD, runId: 'r', state: {}, tools: [], context: [], forwardedProps: {},
        messages: [{ id: 'https://alice.example/old', role: 'user', content: '上周的问题' }],
      }).subscribe({ complete: resolve })
    })
    expect(requests[0]).toMatchObject({
      type: 'threads.custom_action',
      params: { action: { type: 'message.regenerate', payload: { thread_id: 't1', item_id: 'i-old' } } },
    })
  })
})

describe('LinxConversationAgent requests', () => {
  it('stores composer attachments first and sends their ids', async () => {
    const requests: StreamingReq[] = []
    const uploaded: string[] = []
    const base = backend([], requests)
    const agent = new LinxConversationAgent({
      localThreadId: 't1',
      threadUri: THREAD,
      backend: { ...base, uploadAttachment: async (file) => { uploaded.push(file.name); return { id: 'att-9', type: 'file', name: file.name, mime_type: file.mimeType } } },
    })
    await new Promise<void>((resolve) => {
      agent.run({
        threadId: THREAD, runId: 'r', state: {}, tools: [], context: [], forwardedProps: {},
        messages: [{ id: 'local-1', role: 'user', content: [
          { type: 'text', text: '看一下' },
          { type: 'document', source: { type: 'data', value: btoa('hello'), mimeType: 'text/plain' }, metadata: { filename: '名单.txt' } },
        ] }],
      } as never).subscribe({ complete: resolve })
    })
    expect(uploaded).toEqual(['名单.txt'])
    expect(requests[0]).toMatchObject({ type: 'threads.add_user_message', params: { input: { attachments: ['att-9'] } } })
  })

  it('sends the 问 LinX citation as structured context, once', async () => {
    const requests: StreamingReq[] = []
    const agent = new LinxConversationAgent({ localThreadId: 't1', threadUri: THREAD, backend: backend([], requests) })
    setComposerCitation({ sourceUri: 'https://alice.example/docs/a.pdf', locator: { page: 3, quote: '第三条' }, title: 'a.pdf' })
    const send = (id: string) => new Promise<void>((resolve) => {
      agent.run({
        threadId: THREAD, runId: 'r', state: {}, tools: [], context: [], forwardedProps: {},
        messages: [{ id, role: 'user', content: '这是什么意思' }],
      } as never).subscribe({ complete: resolve })
    })
    await send('local-1')
    await send('local-2')
    expect(requests[0]).toMatchObject({
      params: { input: { citation: { sourceUri: 'https://alice.example/docs/a.pdf', locator: { page: 3, quote: '第三条' }, title: 'a.pdf' } } },
    })
    expect((requests[1] as any).params.input.citation).toBeUndefined()
  })

  it('remembers who wrote each message for group speaker names', async () => {
    const agent = new LinxConversationAgent({ localThreadId: 't1', threadUri: THREAD, backend: backend([]) })
    const loaded = await agent.load()
    expect(loaded.makerByUri.get('https://alice.example/m1')).toBe('https://bob.example/profile/card#me')
    expect(loaded.makerByUri.has('https://alice.example/m2')).toBe(false)
  })

  it('regenerates instead of re-sending a question that is already in the Pod', async () => {
    const requests: StreamingReq[] = []
    const agent = new LinxConversationAgent({ localThreadId: 't1', threadUri: THREAD, backend: backend([], requests) })
    await agent.load()
    await new Promise<void>((resolve) => {
      agent.run({
        threadId: THREAD, runId: 'r', state: {}, tools: [], context: [], forwardedProps: {},
        messages: [{ id: 'https://alice.example/m1', role: 'user', content: '早' }],
      } as never).subscribe({ complete: resolve })
    })
    expect(requests[0]).toMatchObject({ type: 'threads.custom_action', params: { action: { type: 'message.regenerate' } } })
  })
  it('passes the composer\'s web search choice with the next new message only', async () => {
    const requests: StreamingReq[] = []
    let on = true
    const agent = new LinxConversationAgent({
      localThreadId: 't1',
      threadUri: THREAD,
      backend: backend([], requests),
      takeInferenceOptions: () => { const options = on ? { tool_choice: { id: 'web_search' } } : undefined; on = false; return options },
    })
    for (const id of ['local-1', 'local-2']) {
      await new Promise<void>((resolve) => {
        agent.run({
          threadId: THREAD, runId: 'r', state: {}, tools: [], context: [], forwardedProps: {},
          messages: [{ id, role: 'user', content: '查一下' }],
        } as never).subscribe({ complete: resolve })
      })
    }
    expect(requests[0]).toMatchObject({ params: { input: { inference_options: { tool_choice: { id: 'web_search' } } } } })
    expect(requests[1]).toMatchObject({ params: { input: { inference_options: {} } } })
  })

  it('tells a failed answer from a stopped one when the topic is read again', async () => {
    const base = backend([])
    const agent = new LinxConversationAgent({
      localThreadId: 't1',
      threadUri: THREAD,
      backend: {
        ...base,
        load: async () => ({
          thread: { id: 't1', status: { type: 'active' }, created_at: 0, updated_at: 0 },
          threadUri: THREAD,
          items: [
            { uri: 'https://alice.example/failed', item: { ...item('i2', '消息生成失败。请稍后重试。'), status: 'failed' } as ThreadItem },
            { uri: 'https://alice.example/stopped', item: { ...item('i3', '已停止生成。'), status: 'incomplete' } as ThreadItem },
          ],
        }),
      },
    })
    const loaded = await agent.load()
    expect([...loaded.failedByUri.keys()]).toEqual(['https://alice.example/failed'])
  })
})

describe('LinxConversationAgent versions of a message', () => {
  const entry = (id: string, type: 'user_message' | 'assistant_message', text: string, extra: Record<string, unknown> = {}) => ({
    uri: `https://alice.example/${id}`,
    item: type === 'user_message'
      ? { id, thread_id: 't1', type, content: [{ type: 'input_text', text }], created_at: 1, ...extra }
      : { id, thread_id: 't1', type, content: [{ type: 'output_text', text }], created_at: 1, ...extra },
  }) as { uri: string; item: ThreadItem }

  function branched(selected: Array<[string, string, string]> = []) {
    const base = backend([])
    return {
      ...base,
      load: async () => ({
        thread: { id: 't1', status: { type: 'active' as const }, created_at: 0, updated_at: 0 },
        threadUri: THREAD,
        items: [
          entry('u2', 'user_message', '改过的问题', { parent_item_id: 'branch-root:u1', branch_id: 'b2' }),
          entry('a2', 'assistant_message', '新回答', { parent_item_id: 'u2' }),
        ],
        alternates: [
          entry('u1', 'user_message', '原来的问题', { parent_item_id: 'branch-root:u1', branch_id: 'b1', created_at: 0 }),
          entry('a1', 'assistant_message', '旧回答', { parent_item_id: 'u1', created_at: 0 }),
        ],
      }),
      selectBranch: async (threadId: string, itemId: string, parentItemId: string) => { selected.push([threadId, itemId, parentItemId]) },
    } satisfies LocalConversationApi
  }

  it('shows the other versions after a reload and saves the one the picker switches to', async () => {
    const selected: Array<[string, string, string]> = []
    const agent = new LinxConversationAgent({ localThreadId: 't1', threadUri: THREAD, backend: branched(selected) })
    const loaded = await agent.load()
    expect(loaded.alternates.map(({ message, parentId }) => [message.id, parentId])).toEqual([
      ['https://alice.example/u1', null],
      ['https://alice.example/a1', 'https://alice.example/u1'],
    ])
    const parentById = new Map(loaded.alternates.map(({ message, parentId }) => [message.id, parentId]))
    const shown = fromAgUiMessages(loaded.messages)
    const hidden = fromAgUiMessages(loaded.alternates.map(({ message }) => message))
    const history = {
      load: async () => ExportedMessageRepository.fromBranchableArray([
        ...hidden.map((message) => ({ message, parentId: parentById.get(message.id!)! })),
        ...shown.map((message, index) => ({ message, parentId: index > 0 ? shown[index - 1].id! : null })),
      ], { headId: shown[shown.length - 1].id }),
      append: async () => undefined,
    }
    const { result } = renderHook(() => useAgUiRuntime({ agent, adapters: { history } }))
    await waitFor(() => expect(result.current.thread.getState().messages).toHaveLength(2))
    const thread = result.current.thread
    expect(thread.getState().messages[0].id).toBe('https://alice.example/u2')
    // The picker offers the original question as version 1 of 2 (we are on 2).
    expect(thread.getMessageByIndex(0).getState().branchCount).toBe(2)

    // Nothing changed yet: nothing to save.
    await agent.persistVisibleVersions(thread.getState().messages.map((message) => message.id))
    expect(selected).toEqual([])

    act(() => thread.getMessageByIndex(0).switchToBranch({ position: 'previous' }))
    await waitFor(() => expect(thread.getState().messages[0].id).toBe('https://alice.example/u1'))
    await agent.persistVisibleVersions(thread.getState().messages.map((message) => message.id))
    expect(selected).toEqual([['t1', 'u1', 'branch-root:u1'], ['t1', 'a1', 'u1']])
    // Saved once: the same path is not written again.
    await agent.persistVisibleVersions(thread.getState().messages.map((message) => message.id))
    expect(selected).toHaveLength(2)
  })
})
