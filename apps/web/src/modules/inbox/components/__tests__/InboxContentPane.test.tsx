import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockNavigate = vi.fn()
const mockSelectChat = vi.fn()
const mockSelectThread = vi.fn()
const mockMutateAsync = vi.fn().mockResolvedValue(undefined)

const mockUseInboxStore = vi.fn()
const mockUseInboxItems = vi.fn()
const mockUseResolveInboxApproval = vi.fn()
const mockUseChatStore = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/modules/chat/store', () => ({
  useChatStore: (selector: (state: unknown) => unknown) => mockUseChatStore(selector),
}))

const mockCreateUserMessage = vi.fn().mockResolvedValue({ id: 'message-1' })
vi.mock('@/modules/chat/collections', () => ({
  chatOps: { createUserMessage: (...args: unknown[]) => mockCreateUserMessage(...args) },
}))

vi.mock('@/providers/solid-session-context', () => ({
  useSession: () => ({ session: { info: { webId: 'https://alice.example/profile/card#me' } } }),
}))

vi.mock('../../app/store', () => ({
  useInboxStore: (selector: (state: unknown) => unknown) => mockUseInboxStore(selector),
}))

const mockResolveInputMutateAsync = vi.fn().mockResolvedValue(undefined)

vi.mock('../../data/auto-judge', () => ({
  useInboxAutoJudgeSweep: () => undefined,
  useGrantRows: () => ({ data: [], all: [], isLoading: false }),
  useAutoJudgeActions: () => ({
    takeOver: { mutate: vi.fn(), isPending: false },
    markReviewed: { mutate: vi.fn(), isPending: false },
    revokeGrant: { mutate: vi.fn(), isPending: false },
  }),
}))

vi.mock('../../data/collections', () => ({
  useInboxItems: () => mockUseInboxItems(),
  useResolveInboxApproval: () => mockUseResolveInboxApproval(),
  useResolveInboxInputRequest: () => ({
    mutateAsync: mockResolveInputMutateAsync,
    isPending: false,
    error: null,
  }),
}))

import { InboxContentPane } from '../InboxContentPane'

const authRequiredItem = {
  id: 'audit:audit-1',
  kind: 'audit' as const,
  category: 'auth_required' as const,
  title: '认证请求',
  description: '运行时需要额外认证后才能继续。',
  timestamp: '2026-03-10T12:00:00.000Z',
  chatId: 'chat-1',
  threadId: 'thread-1',
  audit: {
    id: 'audit-1',
    action: 'runtime.auth_required',
    actorRole: 'system',
    session: 'urn:linx:runtime-session:runtime-1',
    entry: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
    createdAt: '2026-03-10T12:00:00.000Z',
  },
}

const approvalItem = {
  id: 'approval:approval-1',
  kind: 'approval' as const,
  category: 'approval' as const,
  title: 'files.access.proposal',
  description: 'Access proposal requires review.',
  timestamp: '2026-03-10T12:00:00.000Z',
  status: 'pending' as const,
  approval: {
    id: 'approval-1',
    status: 'pending',
    risk: 'medium',
    toolName: 'files.access.proposal',
    target: 'https://pod.example/.data/proposals/access/authenticated-contributor.ttl#proposal',
    createdAt: '2026-03-10T12:00:00.000Z',
    resolvedAt: null,
  },
}

describe('InboxContentPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockUseInboxStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      selectedItemId: 'audit:audit-1',
    }))

    mockUseInboxItems.mockReturnValue({
      data: [authRequiredItem],
      isLoading: false,
    })

    mockUseResolveInboxApproval.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      error: null,
    })

    mockUseChatStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      selectChat: mockSelectChat,
      selectThread: mockSelectThread,
    }))
  })

  it('renders auth-required actions and audit pointers', () => {
    render(<InboxContentPane />)

    expect(screen.getByText('运行时等待额外认证')).toBeInTheDocument()
    expect(screen.getByText('打开会话')).toBeInTheDocument()
    expect(screen.getByText('事件详情')).toBeInTheDocument()
    expect(screen.getByText('https://alice.example/.data/chat/chat-1/index.ttl#thread-1')).toBeInTheDocument()
  })

  it('opens the linked conversation when user clicks open conversation', () => {
    render(<InboxContentPane />)

    fireEvent.click(screen.getByText('打开会话'))

    expect(mockSelectChat).toHaveBeenCalledWith('chat-1')
    expect(mockSelectThread).toHaveBeenCalledWith('thread-1')
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/$microAppId',
      params: { microAppId: 'chat' },
    })
  })

  it('does not show pending auth guidance once auth request is resolved', () => {
    mockUseInboxItems.mockReturnValue({
      data: [
        {
          ...authRequiredItem,
          status: 'resolved',
        },
      ],
      isLoading: false,
    })

    render(<InboxContentPane />)

    expect(screen.queryByText('运行时等待额外认证')).not.toBeInTheDocument()
    expect(screen.getByText('运行时认证已完成')).toBeInTheDocument()
    expect(screen.getByText('打开会话')).toBeInTheDocument()
  })

  it('handles approval mutation failures through hook error state without surfacing the rejection', async () => {
    mockUseInboxStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      selectedItemId: approvalItem.id,
    }))
    mockUseInboxItems.mockReturnValue({
      data: [approvalItem],
      isLoading: false,
    })
    mockMutateAsync.mockRejectedValueOnce(new Error('ACR access proposal cannot be approved automatically.'))

    render(<InboxContentPane />)

    fireEvent.change(screen.getByLabelText('处理备注'), { target: { value: 'Needs policy support.' } })
    fireEvent.click(screen.getByText('批准这一次'))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        approval: approvalItem.approval,
        decision: 'approved',
        reason: 'Needs policy support.',
      })
    })
    expect(screen.getByLabelText('处理备注')).toHaveValue('Needs policy support.')
  })

  const inputRequestItem = {
    id: 'input:input-1',
    kind: 'input_request' as const,
    category: 'input_request' as const,
    title: '周日下午几点开始？',
    description: '等待输入',
    timestamp: '2026-10-10T10:42:00.000Z',
    status: 'pending',
    chatId: 'chat-1',
    threadId: 'thread-1',
    inputRequest: {
      id: 'input-1',
      session: 'urn:linx:runtime-session:runtime-1',
      requestKind: 'user-input',
      prompt: '周日下午几点开始？',
      inputOptions: '["13:00","14:00"]',
      status: 'pending',
      createdAt: '2026-10-10T10:42:00.000Z',
    },
  }

  it('labels an input request as needing input and answers it in place', async () => {
    mockUseInboxStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      selectedItemId: inputRequestItem.id,
    }))
    mockUseInboxItems.mockReturnValue({ data: [inputRequestItem], isLoading: false })

    render(<InboxContentPane />)

    expect(screen.getByText('需要输入')).toBeInTheDocument()
    expect(screen.queryByText('审计事件')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('14:00'))
    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    await waitFor(() => {
      expect(mockResolveInputMutateAsync).toHaveBeenCalledWith({
        inputRequest: inputRequestItem.inputRequest,
        response: '14:00',
      })
    })
    // Plain submit only queues the answer; it does not interrupt the conversation.
    expect(mockCreateUserMessage).not.toHaveBeenCalled()
  })

  it('can steer the waiting run by also posting the answer into the original topic', async () => {
    mockUseInboxStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      selectedItemId: inputRequestItem.id,
    }))
    mockUseInboxItems.mockReturnValue({ data: [inputRequestItem], isLoading: false })

    render(<InboxContentPane />)

    fireEvent.click(screen.getByLabelText('14:00'))
    fireEvent.click(screen.getByRole('button', { name: '立即插话' }))

    await waitFor(() => {
      expect(mockCreateUserMessage).toHaveBeenCalledWith(
        'chat-1',
        'thread-1',
        '回答「周日下午几点开始？」：14:00',
        'https://alice.example/profile/card#me',
      )
    })
    expect(mockResolveInputMutateAsync).toHaveBeenCalledWith({
      inputRequest: inputRequestItem.inputRequest,
      response: '14:00',
    })
  })

  it('uses a masked field for secret input requests', () => {
    mockUseInboxStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      selectedItemId: inputRequestItem.id,
    }))
    mockUseInboxItems.mockReturnValue({
      data: [{
        ...inputRequestItem,
        inputRequest: { ...inputRequestItem.inputRequest, requestKind: 'secret', inputOptions: null },
      }],
      isLoading: false,
    })

    render(<InboxContentPane />)

    expect(screen.getByLabelText('你的回答')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: '提交' })).toBeDisabled()
    // Secrets only queue; they never go into the conversation.
    expect(screen.queryByRole('button', { name: '立即插话' })).not.toBeInTheDocument()
  })
})
