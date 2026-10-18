import { describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { ExportedMessageRepository } from '@assistant-ui/react'
import { fromAgUiMessages, useAgUiRuntime } from '@assistant-ui/react-ag-ui'
import type { StreamingReq, ThreadItem } from '@/lib/vendor/xpod-chatkit'
import type { LocalConversationApi } from '../../../services/chatkit-local/fetch-handler'
import { LinxConversationAgent } from './agent'

const THREAD = 'https://alice.example/.data/chat/c1/index.ttl#t1'

function textItem(id: string, threadId: string, type: 'user_message' | 'assistant_message', text: string, createdAt: number): ThreadItem {
  return (type === 'user_message'
    ? { id, thread_id: threadId, type, content: [{ type: 'input_text', text }], created_at: createdAt }
    : { id, thread_id: threadId, type, content: [{ type: 'output_text', text }], created_at: createdAt }) as ThreadItem
}

function makeBackend(entries: () => Array<{ uri: string; item: ThreadItem; threadId: string }>, requests: StreamingReq[] = []): LocalConversationApi {
  return {
    load: async () => ({
      thread: { id: 't1', status: { type: 'active' }, created_at: 0, updated_at: 0 },
      threadUri: THREAD,
      items: entries(),
    }),
    resolveItemUri: (id) => `https://alice.example/${id}`,
    uploadAttachment: async (file) => ({ id: 'a', type: 'file', name: file.name, mime_type: file.mimeType }),
    async *run(request) {
      requests.push(request)
    },
  }
}

describe('live merge of other internal threads', () => {
  it('merges a message from another thread into the running thread and keeps the composer draft', async () => {
    const store = [
      { uri: 'https://alice.example/m1', item: textItem('i1', 't1', 'user_message', '早', 10), threadId: 't1' },
      { uri: 'https://alice.example/m2', item: textItem('i2', 't1', 'assistant_message', '早上好', 20), threadId: 't1' },
    ]
    const agent = new LinxConversationAgent({ localThreadId: 't1', threadUri: THREAD, chatId: 'c1', backend: makeBackend(() => store) })
    const first = await agent.load()
    const history = { load: async () => ExportedMessageRepository.fromArray(fromAgUiMessages(first.messages)), append: async () => undefined }
    const { result } = renderHook(() => useAgUiRuntime({ agent, adapters: { history } }))
    await waitFor(() => expect(result.current.thread.getState().messages).toHaveLength(2))
    act(() => result.current.thread.composer.setText('还没发的草稿'))

    // A scheduled run writes into another thread of the same chat.
    store.push({ uri: 'https://alice.example/s1', item: textItem('s1', 't2', 'assistant_message', '周报已生成', 30), threadId: 't2' })
    expect(agent.messageKnower()('https://alice.example/s1')).toBe(false)
    const loaded = await agent.load()
    act(() => result.current.thread.import(ExportedMessageRepository.fromArray(fromAgUiMessages(loaded.messages))))

    await waitFor(() => expect(result.current.thread.getState().messages).toHaveLength(3))
    expect(JSON.stringify(result.current.thread.getState().messages[2].content)).toContain('周报已生成')
    expect(result.current.thread.composer.getState().text).toBe('还没发的草稿')
    expect(agent.messageKnower()('https://alice.example/s1')).toBe(true)
    // Pod row ids that only share the item id are recognised too.
    expect(agent.messageKnower()('https://alice.example/.data/chat/c1/2026/10/17/messages.ttl#s1')).toBe(true)
  })

  it('sends the next message to the successor thread the runtime prepared', async () => {
    const requests: StreamingReq[] = []
    const agent = new LinxConversationAgent({
      localThreadId: 't1',
      threadUri: THREAD,
      backend: makeBackend(() => [], requests),
      prepareSendThread: async (current) => (current === 't1' ? 't2' : null),
    })
    await agent.load()
    const { result } = renderHook(() => useAgUiRuntime({ agent }))
    await act(async () => { result.current.thread.append('继续') })
    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]).toMatchObject({ type: 'threads.add_user_message', params: { thread_id: 't2' } })
    expect(agent.sendThreadId).toBe('t2')

    await act(async () => { result.current.thread.append('再来一条') })
    await waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1]).toMatchObject({ params: { thread_id: 't2' } })
  })
})
