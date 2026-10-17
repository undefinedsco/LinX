import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AssistantRuntimeProvider, ExportedMessageRepository, ThreadPrimitive } from '@assistant-ui/react'
import { fromAgUiMessages, useAgUiRuntime } from '@assistant-ui/react-ag-ui'
import type { StreamingReq, ThreadItem, ThreadStreamEvent } from '@/lib/vendor/xpod-chatkit'
import type { LocalConversationApi } from '../../../../services/chatkit-local/fetch-handler'
import { LinxConversationAgent } from '../../ag-ui/agent'
import { AssistantMessage, UserMessage } from '../Messages'
import { createFeedbackAdapter, withSavedFeedback } from './feedback'
import { stopReadAloud } from './read-aloud'

vi.mock('../speaker', () => ({ useSpeakerName: () => null }))
vi.mock('../useRememberMessage', () => ({ useRememberMessage: () => ({ canRemember: false, status: { kind: 'idle' }, remember: vi.fn(), undo: vi.fn() }) }))
vi.mock('@/modules/favorites/collections', () => ({ favoriteHooks: { onStarredChange: vi.fn() }, useFavoriteList: () => ({ data: [] }) }))
vi.mock('../../../collections', () => ({ useChatList: () => ({ data: [] }) }))

const THREAD = 'https://alice.example/.data/chat/c1/index.ttl#t1'
const U1 = 'https://alice.example/.data/chat/c1/2026/10/16.ttl#u1'
const A1 = 'https://alice.example/.data/chat/c1/2026/10/16.ttl#a1'
const user = (id: string, text: string): ThreadItem => ({ id, thread_id: 't1', type: 'user_message', content: [{ type: 'input_text', text }], created_at: 1 })
const answer = (id: string, text: string, extra: object = {}) => ({ id, thread_id: 't1', type: 'assistant_message', content: [{ type: 'output_text', text }], created_at: 2, ...extra }) as ThreadItem

function backend(requests: StreamingReq[], feedback: ReturnType<typeof vi.fn>, saved: object = {}): LocalConversationApi {
  return {
    load: async () => ({
      thread: { id: 't1', status: { type: 'active' }, created_at: 0, updated_at: 0 },
      threadUri: THREAD,
      items: [
        { uri: U1, item: user('i1', '明天天气') },
        { uri: A1, item: answer('i2', '明天晴，二十度。', saved) },
      ],
    }),
    resolveItemUri: (id) => `https://alice.example/${id}`,
    uploadAttachment: async (file) => ({ id: 'att', type: 'file', name: file.name, mime_type: file.mimeType }),
    feedback: async (...args) => { feedback(...args) },
    async *run(request) {
      requests.push(request)
      const edited = user('i3', '后天天气')
      const reply = answer('i4', '后天多云。')
      yield { type: 'thread.item.added', item: edited } as ThreadStreamEvent
      yield { type: 'thread.item.done', item: edited } as ThreadStreamEvent
      yield { type: 'thread.item.added', item: answer('i4', '') } as ThreadStreamEvent
      yield { type: 'thread.item.done', item: reply } as ThreadStreamEvent
    },
  }
}

function Harness({ agent }: { agent: LinxConversationAgent }) {
  const runtime = useAgUiRuntime({
    agent: agent as never,
    onError: () => undefined,
    adapters: {
      feedback: createFeedbackAdapter(agent),
      history: {
        load: async () => {
          const loaded = await agent.loadSettled()
          return ExportedMessageRepository.fromArray(fromAgUiMessages(loaded.messages).map((message) => withSavedFeedback(message as never, loaded.feedbackByUri) as never))
        },
        append: async () => undefined,
      },
    },
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
    </AssistantRuntimeProvider>
  )
}

async function click(element: HTMLElement) {
  await act(async () => { fireEvent.click(element) })
}

async function openMenu(root: HTMLElement) {
  const trigger = within(root).getByRole('button', { name: '更多' })
  await act(async () => { fireEvent.keyDown(trigger, { key: 'Enter' }) })
}

function mount(saved: object = {}) {
  const requests: StreamingReq[] = []
  const feedback = vi.fn()
  const agent = new LinxConversationAgent({ localThreadId: 't1', threadUri: THREAD, backend: backend(requests, feedback, saved) })
  const view = render(<Harness agent={agent} />)
  return { requests, feedback, ...view }
}

afterEach(() => { stopReadAloud(); vi.unstubAllGlobals() })

describe('message actions', () => {
  it('edits a sent message into a new version saved through the service', async () => {
    const { requests, container } = mount()
    await waitFor(() => expect(container.querySelector('[data-role="user"]')).not.toBeNull())
    await openMenu(container.querySelector('[data-role="user"]') as HTMLElement)
    await click(await screen.findByRole('menuitem', { name: '编辑' }))
    const input = await screen.findByLabelText('编辑消息')
    fireEvent.change(input, { target: { value: '后天天气' } })
    await click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]).toEqual({
      type: 'threads.custom_action',
      params: { action: { type: 'message.edit', payload: { thread_id: 't1', item_id: 'i1', text: '后天天气', regenerate: true } } },
    })
    await waitFor(() => expect(container.textContent).toContain('后天多云。'))
    expect(screen.getAllByLabelText('上一个版本').length).toBeGreaterThan(0)
  })

  it('saves 有用 / 没用 on an answer and shows the saved choice after reload', async () => {
    const first = mount()
    await waitFor(() => expect(first.container.querySelector('[data-role="assistant"]')).not.toBeNull())
    await openMenu(first.container.querySelector('[data-role="assistant"]') as HTMLElement)
    await click(await screen.findByRole('menuitemcheckbox', { name: /有用/u }))
    await waitFor(() => expect(first.feedback).toHaveBeenCalledWith('t1', ['i2'], 'positive'))
    first.unmount()

    const second = mount({ feedback: 'negative' })
    await waitFor(() => expect(second.container.querySelector('[data-role="assistant"]')).not.toBeNull())
    await openMenu(second.container.querySelector('[data-role="assistant"]') as HTMLElement)
    expect(await screen.findByRole('menuitemcheckbox', { name: '已点没用' })).toBeTruthy()
  })

  it('reads an answer aloud and stops on the second press', async () => {
    const speak = vi.fn((utterance: { onend?: () => void }) => { void utterance })
    const cancel = vi.fn()
    vi.stubGlobal('speechSynthesis', { speak, cancel })
    vi.stubGlobal('SpeechSynthesisUtterance', class { lang = ''; onend: (() => void) | null = null; onerror: (() => void) | null = null; addEventListener() {} constructor(public text: string) {} })
    const { container } = mount()
    await waitFor(() => expect(container.querySelector('[data-role="assistant"]')).not.toBeNull())
    const root = container.querySelector('[data-role="assistant"]') as HTMLElement
    await openMenu(root)
    await click(await screen.findByRole('menuitem', { name: '朗读' }))
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(1))
    expect((speak.mock.calls[0][0] as unknown as { text: string }).text).toContain('明天晴')
    await openMenu(root)
    await click(await screen.findByRole('menuitem', { name: '停止朗读' }))
    expect(cancel).toHaveBeenCalled()
    await openMenu(root)
    expect(await screen.findByRole('menuitem', { name: '朗读' })).toBeTruthy()
    await act(async () => { fireEvent.keyDown(document.body, { key: 'Escape' }) })
  })

  it('hides 朗读 when the browser cannot speak', async () => {
    const { container } = mount()
    await waitFor(() => expect(container.querySelector('[data-role="assistant"]')).not.toBeNull())
    await openMenu(container.querySelector('[data-role="assistant"]') as HTMLElement)
    await screen.findByRole('menuitem', { name: '重新回答' })
    expect(screen.queryByRole('menuitem', { name: '朗读' })).toBeNull()
  })
})
