import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'

vi.mock('../../store', () => ({
  useChatStore: (select: (state: unknown) => unknown) => select({ messageAnchorId: null, clearMessageAnchor: () => undefined }),
}))
vi.mock('./cards/TailDecisions', () => ({ TailDecisions: () => null }))
vi.mock('./ui/Messages', () => ({ UserMessage: () => null, AssistantMessage: () => null }))
vi.mock('../../collections', () => ({ useThreadList: () => ({ data: [] }), LINX_DEFAULT_SECRETARY: { chatId: 'linx-chat' } }))

import { ConversationThread } from './ConversationThread'
import type { InlineWelcome } from './welcome/WelcomeConversation'

Element.prototype.scrollTo ??= () => undefined

function Harness({ onStarted, onPersist, initialNamed = null }: {
  onStarted: () => void
  onPersist: (texts: string[]) => Promise<void>
  initialNamed?: string | null
}) {
  const runtime = useLocalRuntime({ run: async () => ({ content: [{ type: 'text', text: 'ok' }] }) })
  const [persisted, setPersisted] = useState(false)
  const [named, setNamed] = useState<string | null>(initialNamed)
  const welcome: InlineWelcome = {
    content: (start) => (
      <div>
        <button type="button" onClick={() => start('帮我比较几个方案')}>比较几个方案</button>
        <button type="button" onClick={() => setNamed('小助')}>起名</button>
      </div>
    ),
    suggestions: () => <div>开始建议</div>,
    named,
    texts: () => ['intro', ...(named ? [`named:${named}`] : [])],
    persisted,
    onPersisted: () => setPersisted(true),
    onStarted,
  }
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ConversationThread
        chatId="c"
        threadId="t"
        sendDisabled={false}
        pendingComposerDraft={null}
        onComposerDraftApplied={() => undefined}
        welcome={welcome}
        onPersistWelcome={onPersist}
      />
    </AssistantRuntimeProvider>
  )
}

describe('welcome inside the conversation', () => {
  it('keeps the real composer (tools, / menu) and ends the welcome once a message is sent', async () => {
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
    const onStarted = vi.fn()
    render(<Harness onStarted={onStarted} onPersist={async () => undefined} />)
    expect(screen.getByLabelText('联网搜索')).toBeTruthy()
    expect(screen.getByLabelText('添加附件')).toBeTruthy()
    expect(onStarted).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('比较几个方案'))
    await waitFor(() => expect(onStarted).toHaveBeenCalled())
    expect(screen.queryByText('比较几个方案', { selector: 'button' })).toBeNull()
  })

  it('saves the welcome into the thread before the first message ends it, so earlier messages stay', async () => {
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
    const order: string[] = []
    const onPersist = vi.fn(async (texts: string[]) => { order.push(`persist:${texts.join('|')}`) })
    const onStarted = vi.fn(() => { order.push('started') })
    render(<Harness onStarted={onStarted} onPersist={onPersist} />)
    expect(onPersist).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('比较几个方案'))
    await waitFor(() => expect(onStarted).toHaveBeenCalled())
    expect(onPersist).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['persist:intro', 'started'])
  })

  it('saves the welcome as soon as the assistant is named and keeps the suggestions', async () => {
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
    const onStarted = vi.fn()
    const onPersist = vi.fn(async () => undefined)
    render(<Harness onStarted={onStarted} onPersist={onPersist} />)
    fireEvent.click(screen.getByText('起名'))
    await waitFor(() => expect(onPersist).toHaveBeenCalledWith(['intro', 'named:小助'], expect.any(Number)))
    await waitFor(() => expect(screen.getByText('开始建议')).toBeTruthy())
    expect(screen.queryByText('起名')).toBeNull()
    expect(onStarted).not.toHaveBeenCalled()
  })
})
