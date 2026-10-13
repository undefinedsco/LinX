import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  items: [] as unknown[],
  resolveApproval: vi.fn(),
  resolveInput: vi.fn(),
  createUserMessage: vi.fn(),
}))

vi.mock('@/modules/inbox/collections', () => ({
  useInboxItems: () => ({ data: mocks.items }),
  useResolveInboxApproval: () => ({ mutateAsync: mocks.resolveApproval }),
  useResolveInboxInputRequest: () => ({ mutateAsync: mocks.resolveInput }),
}))
vi.mock('@/providers/solid-session-context', () => ({
  useSession: () => ({ session: { info: { webId: 'https://pod.example/me#me' } } }),
}))
vi.mock('../../collections', () => ({
  useLinxDefaultSecretaryBootstrapSettling: () => false,
  chatOps: { createUserMessage: (...args: unknown[]) => mocks.createUserMessage(...args) },
}))

import { ConversationDecisions } from './ConversationDecisions'

const approval = (status: string) => ({
  id: 'approval:a1',
  kind: 'approval',
  category: 'approval',
  title: '发送排班日历邀请？',
  description: '发给 6 位志愿者，邮件发出后不能撤回',
  status,
  chatId: 'chat-1',
  threadId: 'thread-1',
  approval: { id: 'a1', status, resolvedAt: status === 'pending' ? null : '2026-10-11T02:43:00.000Z' },
})

const input = (status: string, requestKind = 'user-input') => ({
  id: 'input:i1',
  kind: 'input_request',
  category: 'input_request',
  title: '周日下午几点开始？',
  status,
  chatId: 'chat-1',
  threadId: 'thread-1',
  inputRequest: { id: 'i1', status, requestKind, inputOptions: requestKind === 'secret' ? null : '["13:00","14:00"]', response: '14:00' },
})

describe('ConversationDecisions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.items = []
    mocks.resolveApproval.mockResolvedValue(undefined)
    mocks.resolveInput.mockResolvedValue(undefined)
    mocks.createUserMessage.mockResolvedValue(undefined)
  })

  it('stays out of the way when nothing waits', () => {
    const { container } = render(<ConversationDecisions chatId="chat-1" threadId="thread-1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the details only when asked, and never offers "always allow"', () => {
    mocks.items = [approval('pending')]
    render(<ConversationDecisions chatId="chat-1" threadId="thread-1" />)

    expect(screen.queryByText('发给 6 位志愿者，邮件发出后不能撤回')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /详情/ }))
    expect(screen.getByText('发给 6 位志愿者，邮件发出后不能撤回')).toBeInTheDocument()
    expect(screen.queryByText(/总是允许|一直允许/)).toBeNull()
    expect(screen.getByText('关闭页面不会取消这些请求，也可以在收件箱处理。')).toBeInTheDocument()
  })

  it('keeps the choice and offers a safe retry when submitting fails', async () => {
    mocks.items = [approval('pending')]
    mocks.resolveApproval.mockRejectedValueOnce(new Error('offline'))
    render(<ConversationDecisions chatId="chat-1" threadId="thread-1" />)

    fireEvent.click(screen.getByRole('button', { name: '批准' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('没提交成功，你的选择还在。重试不会重复发送。')

    fireEvent.click(screen.getByRole('button', { name: '再试一次' }))
    await waitFor(() => expect(mocks.resolveApproval).toHaveBeenCalledTimes(2))
  })

  it('says so when a request it showed was handled in the inbox meanwhile', () => {
    mocks.items = [approval('pending')]
    const { rerender } = render(<ConversationDecisions chatId="chat-1" threadId="thread-1" />)

    mocks.items = [approval('approved')]
    rerender(<ConversationDecisions chatId="chat-1" threadId="thread-1" />)

    expect(screen.getByRole('status')).toHaveTextContent(/已在收件箱批准/)
  })

  it('answers a question in place and can put it off for later', async () => {
    mocks.items = [input('pending')]
    render(<ConversationDecisions chatId="chat-1" threadId="thread-1" />)

    fireEvent.click(screen.getByRole('button', { name: '稍后' }))
    fireEvent.click(screen.getByRole('button', { name: /稍后处理：周日下午几点开始？/ }))
    fireEvent.click(screen.getByRole('radio', { name: '14:00' }))
    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    await waitFor(() => expect(mocks.resolveInput).toHaveBeenCalledWith(expect.objectContaining({ response: '14:00' })))
  })

  it('keeps secret answers out of the conversation', () => {
    mocks.items = [input('pending', 'secret')]
    render(<ConversationDecisions chatId="chat-1" threadId="thread-1" />)

    expect(screen.getByLabelText('你的回答')).toHaveAttribute('type', 'password')
    expect(screen.getByText('不会出现在聊天记录里')).toBeInTheDocument()
  })

  it('offers to ask again when a request expired', async () => {
    mocks.items = [input('pending')]
    const { rerender } = render(<ConversationDecisions chatId="chat-1" threadId="thread-1" />)
    mocks.items = [input('expired')]
    rerender(<ConversationDecisions chatId="chat-1" threadId="thread-1" />)

    expect(screen.getByRole('status')).toHaveTextContent('这个请求已过期，没有执行')
    fireEvent.click(screen.getByRole('button', { name: '让助手重新问一次' }))
    await waitFor(() => expect(mocks.createUserMessage).toHaveBeenCalledWith(
      'chat-1',
      'thread-1',
      '请重新问我：周日下午几点开始？',
      'https://pod.example/me#me',
    ))
  })

  it('only shows requests from this topic', () => {
    mocks.items = [{ ...approval('pending'), threadId: 'thread-2' }]
    const { container } = render(<ConversationDecisions chatId="chat-1" threadId="thread-1" />)
    expect(container).toBeEmptyDOMElement()
  })
})
