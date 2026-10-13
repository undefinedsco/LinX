import { describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { Observable } from 'rxjs'
import { ExportedMessageRepository } from '@assistant-ui/react'
import { fromAgUiMessages, useAgUiRuntime } from '@assistant-ui/react-ag-ui'
import { buildLinxCardSurface, readLinxCardSurface } from '@linx/agent-runtime/ag-ui'
import type { StreamingReq, ThreadItem, ThreadStreamEvent } from '@/lib/vendor/xpod-chatkit'
import type { LocalConversationApi } from '../../../services/chatkit-local/fetch-handler'
import { LinxConversationAgent } from './agent'

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
})
