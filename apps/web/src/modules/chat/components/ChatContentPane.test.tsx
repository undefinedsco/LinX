import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockNavigate = vi.fn()
const mockUseInboxItems = vi.fn()
const mockSelectInboxItem = vi.fn()
const mockSetInboxFilter = vi.fn()
const mockSetThreadId = vi.fn()

const storeState = {
  selectedChatId: 'chat-1',
  selectedThreadId: 'thread-1',
  selectThread: vi.fn(),
}

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@inrupt/solid-ui-react', () => ({
  useSession: () => ({
    session: {
      info: { webId: 'https://alice.example/profile/card#me' },
      fetch: vi.fn(),
    },
  }),
}))

vi.mock('@openai/chatkit-react', () => ({
  useChatKit: () => ({
    control: {},
    setThreadId: mockSetThreadId,
  }),
  ChatKit: () => <div data-testid="chatkit-root" />,
}))

vi.mock('@linx/models', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@linx/models')>()
  return {
    ...actual,
    resolveRowId: (row: { id?: string }) => row?.id ?? null,
  }
})

vi.mock('@/modules/inbox/collections', () => ({
  useInboxItems: (..._args: unknown[]) => mockUseInboxItems(),
}))

vi.mock('@/modules/inbox/store', () => ({
  useInboxStore: (selector: (state: unknown) => unknown) =>
    selector({
      selectedItemId: null,
      filter: 'all',
      selectItem: mockSelectInboxItem,
      setFilter: mockSetInboxFilter,
    }),
}))

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => ({
    db: {},
  }),
}))

vi.mock('../services/chatkit-local/fetch-handler', () => ({
  createLocalChatKitFetch: () => vi.fn(),
}))

vi.mock('../store', () => ({
  useChatStore: (selector: (state: unknown) => unknown) => selector(storeState),
}))

const mockMutations = {
  createThread: {
    isPending: false,
    mutate: vi.fn(),
  },
}

vi.mock('../collections', () => ({
  useChatInit: () => ({ isReady: true }),
  useChatList: () => ({
    data: [{ id: 'chat-1', title: 'Runtime Chat' }],
  }),
  useThreadList: () => ({
    data: [{ id: 'thread-1', title: '默认话题' }],
    isLoading: false,
  }),
  useChatMutations: () => mockMutations,
}))

vi.mock('../runtime-client', () => ({
  fetchRuntimeSessionLog: vi.fn(),
  isRuntimeSessionMode: () => false,
  useRuntimeSession: () => ({
    runtimeSession: null,
    refetch: vi.fn(),
    createSession: { isPending: false, mutateAsync: vi.fn() },
    startSession: { isPending: false, mutateAsync: vi.fn() },
    pauseSession: { isPending: false, mutateAsync: vi.fn() },
    resumeSession: { isPending: false, mutateAsync: vi.fn() },
    stopSession: { isPending: false, mutateAsync: vi.fn() },
  }),
  useRuntimeSessionEvents: vi.fn(),
}))

import { ChatContentPane } from './ChatContentPane'

describe('ChatContentPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseInboxItems.mockReturnValue({
      data: [],
      isLoading: false,
    })
  })

  it('shows approval banner and routes to inbox for pending approvals', () => {
    mockUseInboxItems.mockReturnValue({
      data: [
        {
          id: 'approval:1',
          kind: 'approval',
          category: 'approval',
          status: 'pending',
          chatId: 'chat-1',
          threadId: 'thread-1',
        },
      ],
      isLoading: false,
    })

    render(<ChatContentPane theme="light" />)

    expect(screen.getByText('当前话题有 1 条待处理授权')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '打开收件箱' }))

    expect(mockSetInboxFilter).toHaveBeenCalledWith('all')
    expect(mockSelectInboxItem).toHaveBeenCalledWith('approval:1')
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/$microAppId',
      params: { microAppId: 'inbox' },
    })
  })

  it('prefers auth-required banner when authentication is needed', () => {
    mockUseInboxItems.mockReturnValue({
      data: [
        {
          id: 'audit:1',
          kind: 'audit',
          category: 'auth_required',
          status: 'pending',
          chatId: 'chat-1',
          threadId: 'thread-1',
        },
        {
          id: 'approval:1',
          kind: 'approval',
          category: 'approval',
          status: 'pending',
          chatId: 'chat-1',
          threadId: 'thread-1',
        },
      ],
      isLoading: false,
    })

    render(<ChatContentPane theme="light" />)

    expect(screen.getByText('当前话题等待认证')).toBeInTheDocument()
    expect(screen.getByText('请先在收件箱完成认证，再继续当前 runtime 会话。')).toBeInTheDocument()
  })
})
