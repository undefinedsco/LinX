import { render, screen, fireEvent } from '@testing-library/react'
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

vi.mock('../../store', () => ({
  useInboxStore: (selector: (state: unknown) => unknown) => mockUseInboxStore(selector),
}))

vi.mock('../../collections', () => ({
  useInboxItems: () => mockUseInboxItems(),
  useResolveInboxApproval: () => mockUseResolveInboxApproval(),
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
})
