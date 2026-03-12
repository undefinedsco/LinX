import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChatListPane } from './ChatListPane'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'

// --- Mocks Setup ---

// Mock store
const mockUseChatStore = vi.fn()
vi.mock('../store', () => ({
  useChatStore: (selector: (state: unknown) => unknown) => mockUseChatStore(selector),
}))

// Mock collections hooks
const mockUseChatList = vi.fn()
const mockUseInboxItems = vi.fn()
const mockMutations = {
  createThread: { mutateAsync: vi.fn(), isPending: false },
  updateChat: { mutateAsync: vi.fn(), isPending: false },
  deleteChat: { mutateAsync: vi.fn(), isPending: false },
  updateThread: { mutateAsync: vi.fn(), isPending: false },
  deleteThread: { mutateAsync: vi.fn(), isPending: false },
  createAIChat: { mutateAsync: vi.fn(), isPending: false },
  createGroupChat: { mutateAsync: vi.fn(), isPending: false },
}

vi.mock('../collections', () => ({
  useChatList: (filters?: { search?: string }) => mockUseChatList(filters),
  useChatMutations: () => mockMutations,
  useChatInit: () => ({ db: null, isReady: true }),
}))

vi.mock('@/modules/inbox/collections', () => ({
  useInboxItems: (..._args: unknown[]) => mockUseInboxItems(),
}))

// Mock models
vi.mock('@linx/models', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@linx/models')>()
  return {
    ...actual,
    resolveRowId: (item: unknown) => (item as Record<string, unknown>)?.id ?? 'mock-id',
    DEFAULT_AGENT_PROVIDERS: [],
  }
})

// Mock solid session
vi.mock('@inrupt/solid-ui-react', () => ({
  useSession: () => ({
    session: { info: { isLoggedIn: true } },
    sessionRequestInProgress: false,
    fetch: globalThis.fetch,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}))

// Wrapper for React Query
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

// Default store state factory
const createDefaultStoreState = (overrides = {}) => ({
  search: '',
  setSearch: vi.fn(),
  selectedChatId: null,
  selectedThreadId: null,
  selectChat: vi.fn(),
  openAddDialog: vi.fn(),
  isAddDialogOpen: false,
  addDialogMode: 'ai',
  closeAddDialog: vi.fn(),
  ...overrides,
})

describe('ChatListPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default store state
    mockUseChatStore.mockImplementation((selector: (state: unknown) => unknown) => {
      return selector(createDefaultStoreState())
    })

    // Default service state
    mockUseChatList.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      fetchStatus: 'idle',
    })
    mockUseInboxItems.mockReturnValue({
      data: [],
      isLoading: false,
    })
  })

  describe('Chat List Mode', () => {
    it('renders chat list with WeChat style items', () => {
      mockUseChatList.mockReturnValue({
        data: [
          {
            id: 'chat-1',
            title: 'Test Chat 1',
            lastMessagePreview: 'Hello world',
            updatedAt: new Date().toISOString(),
            muted: false,
            starred: false,
            unreadCount: 0,
          },
          {
            id: 'chat-2',
            title: 'Test Chat 2',
            lastMessagePreview: 'Hi there',
            updatedAt: new Date().toISOString(),
            muted: false,
            starred: true,
            unreadCount: 5,
          },
        ],
        isLoading: false,
        error: null,
        fetchStatus: 'idle',
      })

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('Test Chat 1')).toBeInTheDocument()
      expect(screen.getByText('Test Chat 2')).toBeInTheDocument()
      expect(screen.getByText('Hello world')).toBeInTheDocument()
      expect(screen.getByText('Hi there')).toBeInTheDocument()
    })

    it('shows loading state', () => {
      mockUseChatList.mockReturnValue({
        data: [],
        isLoading: true,
        error: null,
        fetchStatus: 'fetching',
      })

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('正在加载...')).toBeInTheDocument()
    })

    it('shows empty state when no chats', () => {
      mockUseChatList.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        fetchStatus: 'idle',
      })

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('暂无聊天')).toBeInTheDocument()
    })

    it('displays unread badge with count', () => {
      mockUseChatList.mockReturnValue({
        data: [
          {
            id: 'chat-1',
            title: 'Unread Chat',
            lastMessagePreview: 'New message',
            updatedAt: new Date().toISOString(),
            unreadCount: 5,
          },
        ],
        isLoading: false,
        error: null,
        fetchStatus: 'idle',
      })

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('displays 99+ for large unread counts', () => {
      mockUseChatList.mockReturnValue({
        data: [
          {
            id: 'chat-1',
            title: 'Many Unread',
            lastMessagePreview: 'Lots of messages',
            updatedAt: new Date().toISOString(),
            unreadCount: 150,
          },
        ],
        isLoading: false,
        error: null,
        fetchStatus: 'idle',
      })

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('99+')).toBeInTheDocument()
    })

    it('sorts starred chats to top', () => {
      mockUseChatList.mockReturnValue({
        data: [
          {
            id: 'chat-normal',
            title: 'Normal Chat',
            lastMessagePreview: 'Regular',
            updatedAt: new Date().toISOString(),
            starred: false,
          },
          {
            id: 'chat-starred',
            title: 'Starred Chat',
            lastMessagePreview: 'Important',
            updatedAt: new Date().toISOString(),
            starred: true,
          },
        ],
        isLoading: false,
        error: null,
        fetchStatus: 'idle',
      })

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      const items = screen.getAllByText(/Chat/)
      // Starred should be first
      expect(items[0]).toHaveTextContent('Starred Chat')
    })

    it('calls selectChat when clicking a chat item', () => {
      const mockSelectChat = vi.fn()
      mockUseChatStore.mockImplementation((selector: (state: unknown) => unknown) => {
        return selector(createDefaultStoreState({ selectChat: mockSelectChat }))
      })

      mockUseChatList.mockReturnValue({
        data: [
          {
            id: 'chat-1',
            title: 'Clickable Chat',
            lastMessagePreview: 'Click me',
            updatedAt: new Date().toISOString(),
          },
        ],
        isLoading: false,
        error: null,
        fetchStatus: 'idle',
      })

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      fireEvent.click(screen.getByText('Clickable Chat'))
      expect(mockSelectChat).toHaveBeenCalledWith('chat-1')
    })

    it('shows approval preview when inbox has pending approvals for the chat', () => {
      mockUseChatList.mockReturnValue({
        data: [
          {
            id: 'chat-1',
            title: 'Runtime Chat',
            lastMessagePreview: '普通预览',
            updatedAt: new Date().toISOString(),
          },
        ],
        isLoading: false,
        error: null,
        fetchStatus: 'idle',
      })
      mockUseInboxItems.mockReturnValue({
        data: [
          {
            id: 'approval:1',
            kind: 'approval',
            status: 'pending',
            category: 'approval',
            chatId: 'chat-1',
          },
        ],
        isLoading: false,
      })

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('⚠️ 待处理授权')).toBeInTheDocument()
    })

    it('prefers auth-required preview over generic approval preview', () => {
      mockUseChatList.mockReturnValue({
        data: [
          {
            id: 'chat-1',
            title: 'Runtime Chat',
            lastMessagePreview: '普通预览',
            updatedAt: new Date().toISOString(),
          },
        ],
        isLoading: false,
        error: null,
        fetchStatus: 'idle',
      })
      mockUseInboxItems.mockReturnValue({
        data: [
          {
            id: 'audit:1',
            kind: 'audit',
            category: 'auth_required',
            chatId: 'chat-1',
          },
          {
            id: 'approval:1',
            kind: 'approval',
            status: 'pending',
            category: 'approval',
            chatId: 'chat-1',
          },
        ],
        isLoading: false,
      })

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('🔐 等待认证')).toBeInTheDocument()
    })
  })

  describe('Timestamp Formatting', () => {
    it('formats today timestamps as time', () => {
      const now = new Date()
      mockUseChatList.mockReturnValue({
        data: [
          {
            id: 'chat-1',
            title: 'Today Chat',
            lastMessagePreview: 'Recent',
            updatedAt: now.toISOString(),
          },
        ],
        isLoading: false,
        error: null,
        fetchStatus: 'idle',
      })

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      // Should show time format like "14:30"
      const timeFormat = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      expect(screen.getByText(timeFormat)).toBeInTheDocument()
    })
  })
})
