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
  title: '认证请求 · oauth2',
  description: '需要登录 · oauth2 · https://example.com/auth',
  timestamp: '2026-03-10T12:00:00.000Z',
  chatId: 'chat-1',
  threadId: 'thread-1',
  authUrl: 'https://example.com/auth',
  authMethod: 'oauth2',
  authMessage: '请完成登录后继续',
  audit: {
    id: 'audit-1',
    action: 'runtime.auth_required',
    actorRole: 'system',
    session: 'urn:linx:runtime-session:runtime-1',
    createdAt: '2026-03-10T12:00:00.000Z',
    context: JSON.stringify({ method: 'oauth2', url: 'https://example.com/auth' }),
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

  it('renders auth-required actions and context', () => {
    render(<InboxContentPane />)

    expect(screen.getByText('运行时等待额外认证')).toBeInTheDocument()
    expect(screen.getByText('打开会话')).toBeInTheDocument()
    expect(screen.getByText('打开认证页')).toBeInTheDocument()
    expect(screen.getByText('oauth2')).toBeInTheDocument()
    expect(screen.getByText('请完成登录后继续')).toBeInTheDocument()
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
