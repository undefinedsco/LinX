import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'

vi.mock('../../store', () => ({
  useChatStore: (select: (state: unknown) => unknown) => select({ messageAnchorId: null, clearMessageAnchor: () => undefined }),
}))
vi.mock('./cards/TailDecisions', () => ({ TailDecisions: () => null }))
vi.mock('./ui/Messages', () => ({ UserMessage: () => null, AssistantMessage: () => null }))
vi.mock('../../collections', () => ({ useThreadList: () => ({ data: [] }) }))

import { ConversationThread } from './ConversationThread'

function Harness({ onStarted }: { onStarted: () => void }) {
  const runtime = useLocalRuntime({ run: async () => ({ content: [{ type: 'text', text: 'ok' }] }) })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ConversationThread
        chatId="c"
        threadId="t"
        sendDisabled={false}
        pendingComposerDraft={null}
        onComposerDraftApplied={() => undefined}
        welcome={{ content: (start) => <button type="button" onClick={() => start('帮我比较几个方案')}>比较几个方案</button>, onStarted }}
      />
    </AssistantRuntimeProvider>
  )
}

describe('welcome inside the conversation', () => {
  it('keeps the real composer (tools, / menu) and ends the welcome once a message is sent', async () => {
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
    const onStarted = vi.fn()
    render(<Harness onStarted={onStarted} />)
    expect(screen.getByLabelText('联网搜索')).toBeTruthy()
    expect(screen.getByLabelText('添加附件')).toBeTruthy()
    expect(onStarted).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('比较几个方案'))
    await waitFor(() => expect(onStarted).toHaveBeenCalled())
    expect(screen.queryByText('比较几个方案', { selector: 'button' })).toBeNull()
  })
})
