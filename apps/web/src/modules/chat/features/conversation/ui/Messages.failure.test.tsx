import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { AssistantRuntimeProvider, ExportedMessageRepository, ThreadPrimitive, useAui } from '@assistant-ui/react'
import { fromAgUiMessages, useAgUiRuntime } from '@assistant-ui/react-ag-ui'
import type { ThreadItem, ThreadStreamEvent } from '@/lib/vendor/xpod-chatkit'
import type { LocalConversationApi } from '../../../services/chatkit-local/fetch-handler'
import { LinxConversationAgent } from '../ag-ui/agent'
import { AssistantMessage, UserMessage } from './Messages'

vi.mock('./speaker', () => ({ useSpeakerName: () => null }))
vi.mock('./MessageToolbar', () => ({ MessageToolbar: () => null }))

const FAIL = '消息生成失败。请稍后重试。'
const THREAD = 'https://alice.example/.data/chat/c1/index.ttl#t1'
const userItem: ThreadItem = { id: 'u1', thread_id: 't1', type: 'user_message', content: [{ type: 'input_text', text: '你好吗' }], created_at: 5 }
const assistant = (text: string, extra: object = {}) => ({ id: 'a1', thread_id: 't1', type: 'assistant_message', content: [{ type: 'output_text', text }], created_at: 6, ...extra }) as ThreadItem
const failEvents: ThreadStreamEvent[] = [
  { type: 'thread.item.added', item: userItem },
  { type: 'thread.item.done', item: userItem },
  { type: 'thread.item.added', item: assistant('') },
  { type: 'thread.item.done', item: assistant(FAIL, { status: 'incomplete' }) },
  { type: 'error', error: { code: 'generation_error', message: FAIL } } as ThreadStreamEvent,
]

function backend(load: LocalConversationApi['load']): LocalConversationApi {
  return {
    load,
    resolveItemUri: (id) => `https://alice.example/${id}`,
    uploadAttachment: async (file) => ({ id: 'att', type: 'file', name: file.name, mime_type: file.mimeType }),
    async *run() {
      for (const event of failEvents) yield event
    },
  }
}

const emptyTopic = async () => ({ thread: { id: 't1', status: { type: 'active' as const }, created_at: 0, updated_at: 0 }, threadUri: THREAD, items: [] })

let send: (text: string) => void = () => undefined
function Harness({ agent }: { agent: LinxConversationAgent }) {
  const runtime = useAgUiRuntime({
    agent: agent as never,
    onError: () => undefined,
    adapters: {
      history: {
        load: async () => ExportedMessageRepository.fromArray(fromAgUiMessages((await agent.loadSettled()).messages)),
        append: async () => undefined,
      },
    },
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Sender />
      <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
    </AssistantRuntimeProvider>
  )
}
function Sender() {
  const aui = useAui()
  send = (text) => aui.thread().append(text)
  return null
}

describe('a failed run in the conversation', () => {
  it('keeps the person\'s message and says the failure once, with a retry', async () => {
    const agent = new LinxConversationAgent({ localThreadId: 't1', threadUri: THREAD, backend: backend(emptyTopic) })
    const { container } = render(<Harness agent={agent} />)
    await act(async () => { send('你好吗') })
    await waitFor(() => expect(container.querySelector('[data-role="assistant"]')?.textContent).toContain(FAIL))
    expect(container.querySelector('[data-role="user"]')?.textContent).toContain('你好吗')
    expect(container.textContent?.split(FAIL).length).toBe(2)
    expect(screen.getAllByText('重试')).toHaveLength(1)
  })

  it('rereads the topic when a send overtakes a slow history read', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    let reads = 0
    const agent = new LinxConversationAgent({
      localThreadId: 't1',
      threadUri: THREAD,
      backend: backend(async () => {
        reads += 1
        if (reads === 1) {
          await gate
          return emptyTopic()
        }
        return { ...(await emptyTopic()), items: [{ uri: 'https://alice.example/u1', item: userItem }, { uri: 'https://alice.example/a1', item: assistant(FAIL, { status: 'incomplete' }) }] }
      }),
    })
    const loading = agent.loadSettled()
    await new Promise<void>((resolve) => {
      agent.run({
        threadId: THREAD, runId: 'r', state: {}, tools: [], context: [], forwardedProps: {},
        messages: [{ id: 'local-1', role: 'user', content: '你好吗' }],
      } as never).subscribe({ complete: resolve })
    })
    release()
    const loaded = await loading
    expect(reads).toBe(2)
    expect(loaded.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
  })
})
