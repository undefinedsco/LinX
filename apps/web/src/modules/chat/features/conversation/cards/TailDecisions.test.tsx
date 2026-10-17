import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { approvalItem, inbox, inputItem, resetInbox } from './card-test-support'
import { TailDecisions } from './TailDecisions'

const append = vi.fn()
const thread = { messages: [] as Array<{ content: Array<{ type: string; toolCallId?: string }> }> }

vi.mock('@assistant-ui/react', () => ({
  useAui: () => ({ thread: () => ({ append }) }),
  useAuiState: (select: (state: unknown) => unknown) => select({ thread }),
}))
vi.mock('@/modules/inbox/collections', () => ({
  useInboxItems: () => ({ data: inbox.items, isLoading: inbox.isLoading }),
  useResolveInboxApproval: () => ({ mutateAsync: (input: unknown) => inbox.resolveApproval(input) }),
  useResolveInboxInputRequest: () => ({ mutateAsync: (input: unknown) => inbox.resolveInput(input) }),
}))
vi.mock('@/providers/solid-database-provider', () => ({ useSolidDatabase: () => ({ db: null }) }))
vi.mock('@/providers/solid-session-context', () => ({ useSession: () => ({ session: { info: { webId: 'https://alice.example/profile/card#me' } } }) }))

beforeEach(() => {
  resetInbox()
  append.mockReset()
  thread.messages = []
})

describe('requests no message shows', () => {
  it('lists this topic\'s pending requests as cards and writes the answer', async () => {
    resetInbox([approvalItem(), inputItem(), approvalItem('pending', { id: 'approval:other', chatId: 'other', title: '别的聊天' })])
    render(<TailDecisions chatId="c1" threadId="t1" />)
    expect(screen.getByRole('region', { name: '等你处理' })).toBeTruthy()
    expect(screen.getByText('发送周报给王芳？')).toBeTruthy()
    expect(screen.getByText('周报发给谁？')).toBeTruthy()
    expect(screen.queryByText('别的聊天')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '批准这一次' }))
    await waitFor(() => expect(inbox.resolveApproval).toHaveBeenCalledTimes(1))
  })

  it('skips a request that a message card already shows', () => {
    resetInbox([approvalItem()])
    thread.messages = [{ content: [{ type: 'tool-call', toolCallId: 'a2ui:https://alice.example/.data/approvals/2026/10/16.ttl#ap1' }] }]
    const { container } = render(<TailDecisions chatId="c1" threadId="t1" />)
    expect(container.firstChild).toBeNull()
  })

  it('shows nothing for decided requests it never showed as pending', () => {
    resetInbox([approvalItem('approved')])
    const { container } = render(<TailDecisions chatId="c1" threadId="t1" />)
    expect(container.firstChild).toBeNull()
  })

  it('keeps a request visible with its outcome after it was answered', async () => {
    resetInbox([inputItem()])
    const view = render(<TailDecisions chatId="c1" threadId="t1" />)
    expect(screen.getByText('周报发给谁？')).toBeTruthy()
    resetInbox([inputItem('resolved')])
    view.rerender(<TailDecisions chatId="c1" threadId="t1" />)
    expect((await screen.findByRole('status')).textContent).toContain('周报发给谁？')
  })

  it('lets a person interject into the running work from an input card', () => {
    resetInbox([inputItem()])
    render(<TailDecisions chatId="c1" threadId="t1" />)
    fireEvent.change(screen.getByLabelText('其他回答'), { target: { value: '先发给自己' } })
    fireEvent.click(screen.getByRole('button', { name: '立即插话' }))
    expect(append).toHaveBeenCalledWith('先发给自己')
  })

  it('asks the assistant to ask again when a request expired', async () => {
    resetInbox([inputItem()])
    const view = render(<TailDecisions chatId="c1" threadId="t1" />)
    resetInbox([inputItem('expired')])
    view.rerender(<TailDecisions chatId="c1" threadId="t1" />)
    fireEvent.click(await screen.findByRole('button', { name: '让助手重新问一次' }))
    expect(append).toHaveBeenCalledWith('请重新问我：周报发给谁？')
  })
})
