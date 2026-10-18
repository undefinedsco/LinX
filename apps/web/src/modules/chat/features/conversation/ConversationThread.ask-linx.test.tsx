import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import { ask, useAskLinx } from '@/lib/ask-linx'
import { useCardDialog } from '@/lib/card-dialog'

vi.mock('../../store', () => ({
  useChatStore: (select: (state: unknown) => unknown) => select({ messageAnchorId: null, clearMessageAnchor: () => undefined }),
}))
vi.mock('./cards/TailDecisions', () => ({ TailDecisions: () => null }))
vi.mock('./ui/Messages', () => ({ UserMessage: () => null, AssistantMessage: () => null }))
vi.mock('../../collections', () => ({ useThreadList: () => ({ data: [] }), LINX_DEFAULT_SECRETARY: { chatId: 'linx-chat' } }))

import { ConversationThread } from './ConversationThread'

function Harness({ chatId }: { chatId: string }) {
  const runtime = useLocalRuntime({ run: async () => ({ content: [{ type: 'text', text: 'ok' }] }) })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ConversationThread chatId={chatId} threadId="t" sendDisabled={false} pendingComposerDraft={null} onComposerDraftApplied={() => undefined} />
    </AssistantRuntimeProvider>
  )
}

describe('问 LinX into the composer', () => {
  afterEach(() => {
    useAskLinx.setState({ pending: null, listeners: 0 })
    useCardDialog.getState().close()
  })

  it('has no listener until the chat registers one, so callers can fall back', () => {
    expect(ask({ text: '关于这段' })).toBe(false)
    expect(useAskLinx.getState().pending).toBeNull()
  })

  it('puts the quoted prompt into the LinX composer, focused, with a citation chip, without sending', async () => {
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
    useAskLinx.getState().listen()
    render(<Harness chatId="linx-chat" />)
    const input = screen.getByLabelText('消息') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '先看看' } })
    act(() => {
      expect(ask({
        text: '关于「周报」第 2 页里的这段：\n> 本周完成\n\n',
        sourceUri: 'https://alice.example/files/weekly.pdf',
        locator: { page: 2 },
        title: '周报',
      })).toBe(true)
    })
    await waitFor(() => expect(input.value).toBe('先看看\n\n关于「周报」第 2 页里的这段：\n> 本周完成\n\n'))
    await waitFor(() => expect(document.activeElement).toBe(input))
    expect(useAskLinx.getState().pending).toBeNull()
    expect(screen.queryByTestId('composer-citation')).toHaveTextContent('周报')

    fireEvent.click(screen.getByTitle('打开引用的内容'))
    expect(useCardDialog.getState().request).toEqual({ uri: 'https://alice.example/files/weekly.pdf', locator: { page: 2 }, from: 'chat' })
    fireEvent.click(screen.getByLabelText('移除引用 周报'))
    expect(screen.queryByTestId('composer-citation')).toBeNull()
    expect(input.value).toContain('本周完成') // removing the chip keeps the words
  })

  it('leaves other chats alone', () => {
    useAskLinx.getState().listen()
    render(<Harness chatId="someone-else" />)
    act(() => { ask({ text: '关于这段' }) })
    expect((screen.getByLabelText('消息') as HTMLTextAreaElement).value).toBe('')
    expect(useAskLinx.getState().pending).not.toBeNull()
  })
})
