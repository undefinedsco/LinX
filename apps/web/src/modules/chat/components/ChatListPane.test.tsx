import { render, screen, fireEvent } from '@testing-library/react'
import { waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
const mockUseThreadIndex = vi.fn()
const mockUseInboxItems = vi.fn()
const mockMutations = {
  createThread: { mutateAsync: vi.fn(), isPending: false },
  updateChat: { mutateAsync: vi.fn(), isPending: false },
  deleteChat: { mutateAsync: vi.fn(), isPending: false },
  updateThread: { mutateAsync: vi.fn(), isPending: false },
  deleteThread: { mutateAsync: vi.fn(), isPending: false },
  createAIChat: { mutateAsync: vi.fn(), isPending: false },
  ensureLinxWelcome: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
  createGroupChat: { mutateAsync: vi.fn(), isPending: false },
}

vi.mock('../collections', () => ({
  LINX_DEFAULT_SECRETARY: {
    chatId: 'chat/__secretary__',
    title: 'AI Secretary',
  },
  useChatList: (filters?: { search?: string }) => mockUseChatList(filters),
  useThreadIndex: (..._args: unknown[]) => mockUseThreadIndex(),
  useChatMutations: () => mockMutations,
  useChatInit: () => ({ db: null, isReady: true }),
  useLinxDefaultSecretaryBootstrapSettling: () => false,
  isLinxDefaultSecretaryChat: (chat: { title?: string } | null | undefined) => chat?.title === 'AI Secretary',
}))

vi.mock('@/modules/inbox/collections', () => ({
  useInboxItems: (..._args: unknown[]) => mockUseInboxItems(),
}))

const mockToast = vi.fn()
vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

const mockListRuntimeSessions = vi.fn()
const mockFetchRuntimeSessionLog = vi.fn()
const mockIsRuntimeSessionMode = vi.fn(() => false)
const mockCreateAndStartRuntimeSession = vi.fn()
vi.mock('../runtime-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../runtime-client')>()
  return {
    ...actual,
    listRuntimeSessions: (...args: unknown[]) => mockListRuntimeSessions(...args),
    fetchRuntimeSessionLog: (...args: unknown[]) => mockFetchRuntimeSessionLog(...args),
    isRuntimeSessionMode: () => mockIsRuntimeSessionMode(),
    createAndStartRuntimeSession: (...args: unknown[]) => mockCreateAndStartRuntimeSession(...args),
  }
})

// Mock models
vi.mock('@undefineds.co/models', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@undefineds.co/models')>()
  return {
    ...actual,
    resolveRowId: (item: unknown) => (item as Record<string, unknown>)?.id ?? 'mock-id',
    DEFAULT_AGENT_PROVIDERS: [],
  }
})

// Mock solid session
vi.mock('@/providers/solid-session-context', () => ({
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

vi.stubGlobal('navigator', {
  clipboard: {
    writeText: vi.fn(),
  },
})

// Default store state factory
const createDefaultStoreState = (overrides = {}) => ({
  search: '',
  setSearch: vi.fn(),
  selectedChatId: null,
  selectedThreadId: null,
  selectChat: vi.fn(),
  selectThread: vi.fn(),
  openAddDialog: vi.fn(),
  isAddDialogOpen: false,
  addDialogMode: 'ai',
  closeAddDialog: vi.fn(),
  ...overrides,
})

describe('ChatListPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()

    // Default store state
    mockUseChatStore.mockImplementation((selector: (state: unknown) => unknown) => {
      return selector(createDefaultStoreState())
    })

    // Default service state
    mockUseChatList.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      fetchStatus: 'idle',
    })
    mockUseInboxItems.mockReturnValue({
      data: [],
      isLoading: false,
    })
    mockUseThreadIndex.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    })
    mockListRuntimeSessions.mockResolvedValue([])
    mockFetchRuntimeSessionLog.mockResolvedValue('runtime log')
    mockIsRuntimeSessionMode.mockReturnValue(false)
    mockCreateAndStartRuntimeSession.mockResolvedValue(null)
    mockMutations.ensureLinxWelcome.mutate.mockReset()
    mockMutations.ensureLinxWelcome.mutateAsync.mockReset()
    mockMutations.ensureLinxWelcome.isPending = false
  })

  it('uses the shared 48px list-head geometry', () => {
    render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

    const header = screen.getByTestId('chat-list-header')
    expect(header).toHaveClass('h-12')
    expect(header).not.toHaveClass('h-16')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Chat List Mode', () => {
    it('shows a retryable error instead of an empty state when the initial query fails', () => {
      const refetch = vi.fn()
      mockUseChatList.mockReturnValue({
        data: [],
        isLoading: false,
        error: new Error('offline'),
        refetch,
        fetchStatus: 'idle',
      })

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByRole('alert')).toHaveTextContent('聊天加载失败')
      expect(screen.queryByText('暂无聊天')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '重试' }))
      expect(refetch).toHaveBeenCalledTimes(1)
    })

    it('keeps cached chats visible and shows a nonblocking sync warning', () => {
      const refetch = vi.fn()
      mockUseChatList.mockReturnValue({
        data: [{
          id: 'chat-cached',
          title: 'Cached Chat',
          lastMessagePreview: 'cached',
          updatedAt: new Date().toISOString(),
          muted: false,
          starred: false,
          unreadCount: 0,
        }],
        isLoading: false,
        error: new Error('offline'),
        refetch,
        fetchStatus: 'idle',
      })

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('Cached Chat')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('同步失败，当前显示上次内容')
    })

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

    it('opens a chat from the keyboard using listbox semantics', () => {
      const selectChat = vi.fn()
      const selectThread = vi.fn()
      mockUseChatStore.mockImplementation((selector: (state: unknown) => unknown) => selector(createDefaultStoreState({
        selectChat,
        selectThread,
      })))
      mockUseChatList.mockReturnValue({
        data: [{
          id: 'chat-keyboard',
          title: 'Keyboard Chat',
          lastMessagePreview: 'Open without a pointer',
          updatedAt: new Date().toISOString(),
          muted: false,
          starred: false,
          unreadCount: 0,
        }],
        isLoading: false,
        error: null,
        fetchStatus: 'idle',
      })

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      const option = screen.getByRole('option', { name: 'Keyboard Chat' })
      option.focus()
      fireEvent.keyDown(option, { key: 'Enter' })

      expect(selectChat).toHaveBeenCalledWith('chat-keyboard')
    })

    it('keeps the built-in Secretary available while the chat list loads', () => {
      mockUseChatList.mockReturnValue({
        data: [],
        isLoading: true,
        error: null,
        fetchStatus: 'fetching',
      })

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByRole('option', { name: 'AI Secretary' })).toBeInTheDocument()
      expect(screen.queryByText('正在加载...')).not.toBeInTheDocument()
    })

    it('projects the built-in Secretary at the top when the Pod list is empty', () => {
      const mockSelectChat = vi.fn()
      const mockSelectThread = vi.fn()
      mockUseChatStore.mockImplementation((selector: (state: unknown) => unknown) => {
        return selector(createDefaultStoreState({
          selectChat: mockSelectChat,
          selectThread: mockSelectThread,
        }))
      })
      mockUseChatList.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        fetchStatus: 'idle',
      })

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByRole('option', { name: 'AI Secretary' })).toBeInTheDocument()
      expect(mockMutations.ensureLinxWelcome.mutate).not.toHaveBeenCalled()
      expect(mockSelectChat).not.toHaveBeenCalled()
      expect(mockSelectThread).not.toHaveBeenCalled()
    })

    it('keeps the built-in Secretary visible while its persistence is pending', () => {
      mockUseChatList.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        fetchStatus: 'idle',
      })
      mockMutations.ensureLinxWelcome.isPending = true

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByRole('option', { name: 'AI Secretary' })).toBeInTheDocument()
      expect(screen.queryByText('正在准备默认助手...')).not.toBeInTheDocument()
      expect(screen.queryByText('默认助手暂时还没准备好，可以先进入 LinX。')).not.toBeInTheDocument()
    })

    it('does not prepare AI Secretary from the chat list for existing accounts without it', () => {
      mockUseChatList.mockReturnValue({
        data: [
          {
            id: 'chat-1',
            title: 'Existing Chat',
            lastMessagePreview: 'hello',
            updatedAt: new Date().toISOString(),
          },
        ],
        isLoading: false,
        error: null,
        fetchStatus: 'idle',
      })

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('Existing Chat')).toBeInTheDocument()
      expect(mockMutations.ensureLinxWelcome.mutate).not.toHaveBeenCalled()
    })

    it('does not prepare AI Secretary when it already exists', async () => {
      mockUseChatList.mockReturnValue({
        data: [
          {
            id: 'secretary-chat',
            title: 'AI Secretary',
            lastMessagePreview: '默认助手',
            updatedAt: new Date().toISOString(),
          },
        ],
        isLoading: false,
        error: null,
        fetchStatus: 'idle',
      })

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('AI Secretary')).toBeInTheDocument()
      })
      expect(mockMutations.ensureLinxWelcome.mutate).not.toHaveBeenCalled()
    })

    it('does not run welcome flow while searching', () => {
      mockUseChatStore.mockImplementation((selector: (state: unknown) => unknown) => {
        return selector(createDefaultStoreState({ search: 'alice' }))
      })
      mockUseChatList.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        fetchStatus: 'idle',
      })

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.queryByRole('option', { name: 'AI Secretary' })).not.toBeInTheDocument()
      expect(mockMutations.ensureLinxWelcome.mutate).not.toHaveBeenCalled()
    })

    it('does not show delete action for AI Secretary', async () => {
      mockUseChatList.mockReturnValue({
        data: [
          {
            id: 'secretary-chat',
            title: 'AI Secretary',
            lastMessagePreview: '默认助手',
            updatedAt: new Date().toISOString(),
            participants: ['contact-1'],
          },
        ],
        isLoading: false,
        error: null,
        fetchStatus: 'idle',
      })

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      fireEvent.contextMenu(screen.getByText('AI Secretary'))

      await waitFor(() => {
        expect(screen.getByText('AI Secretary')).toBeInTheDocument()
      })
      expect(screen.queryByText('删除')).not.toBeInTheDocument()
    })

    it('does not expose star or delete affordances for AI Secretary', async () => {
      mockUseChatList.mockReturnValue({
        data: [
          {
            id: 'secretary-chat',
            title: 'AI Secretary',
            lastMessagePreview: '默认助手',
            updatedAt: new Date().toISOString(),
            starred: false,
          },
        ],
        isLoading: false,
        error: null,
        fetchStatus: 'idle',
      })

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      const secretary = screen.getByRole('option', { name: 'AI Secretary' })
      fireEvent.mouseEnter(secretary)

      expect(screen.queryByTitle('标星')).not.toBeInTheDocument()
      expect(screen.queryByTitle('取消标星')).not.toBeInTheDocument()

      fireEvent.contextMenu(secretary)
      expect(await screen.findByText('静音')).toBeInTheDocument()
      expect(screen.queryByText('标星')).not.toBeInTheDocument()
      expect(screen.queryByText('取消标星')).not.toBeInTheDocument()
      expect(screen.queryByText('删除')).not.toBeInTheDocument()
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

    it('orders AI Secretary before starred and ordinary chats', () => {
      mockUseChatList.mockReturnValue({
        data: [
          {
            id: 'chat-starred',
            title: 'Starred Chat',
            lastMessagePreview: 'Important',
            updatedAt: new Date().toISOString(),
            starred: true,
          },
          {
            id: 'secretary-chat',
            title: 'AI Secretary',
            lastMessagePreview: '默认助手',
            updatedAt: new Date().toISOString(),
            starred: false,
          },
          {
            id: 'chat-normal',
            title: 'Normal Chat',
            lastMessagePreview: 'Regular',
            updatedAt: new Date().toISOString(),
            starred: false,
          },
        ],
        isLoading: false,
        error: null,
        fetchStatus: 'idle',
      })

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getAllByTestId('chat-list-item').map((item) => item.dataset.chatId))
        .toEqual(['secretary-chat', 'chat-starred', 'chat-normal'])
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

      expect(screen.getByText('待处理授权')).toBeInTheDocument()
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

      expect(screen.getByText('等待认证')).toHaveClass('text-boundary')
    })

    it('renders runtime-backed chats as workspace threads with status preview', async () => {
      mockIsRuntimeSessionMode.mockReturnValue(true)
      mockUseChatList.mockReturnValue({
        data: [
          {
            id: 'chat-1',
            title: 'Runtime Chat',
            lastMessagePreview: '普通预览',
            updatedAt: new Date().toISOString(),
            participants: ['contact-1'],
          },
        ],
        isLoading: false,
        error: null,
        fetchStatus: 'idle',
      })
      mockUseThreadIndex.mockReturnValue({
        data: [
          {
            id: 'thread-1',
            chat: 'https://alice.example/.data/chat/chat-1/index.ttl#this',
            title: '默认话题',
          },
        ],
        isLoading: false,
        error: null,
      })
      mockListRuntimeSessions.mockResolvedValue([
        {
          id: 'runtime-1',
          threadId: 'thread-1',
          title: '默认话题',
          repoPath: '/repo',
          folderPath: '/repo',
          runnerType: 'xpod-pty',
          tool: 'codex',
          status: 'active',
          tokenUsage: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
        },
      ])

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      expect(await screen.findByText('运行中')).toBeInTheDocument()
    })

    it('copies runtime log from workspace thread context menu', async () => {
      mockIsRuntimeSessionMode.mockReturnValue(true)
      mockUseChatList.mockReturnValue({
        data: [
          {
            id: 'chat-1',
            title: 'Runtime Chat',
            lastMessagePreview: '普通预览',
            updatedAt: new Date().toISOString(),
            participants: ['contact-1'],
          },
        ],
        isLoading: false,
        error: null,
        fetchStatus: 'idle',
      })
      mockUseThreadIndex.mockReturnValue({
        data: [
          {
            id: 'thread-1',
            chat: 'https://alice.example/.data/chat/chat-1/index.ttl#this',
            title: '默认话题',
          },
        ],
        isLoading: false,
        error: null,
      })
      mockListRuntimeSessions.mockResolvedValue([
        {
          id: 'runtime-1',
          threadId: 'thread-1',
          title: '默认话题',
          repoPath: '/repo',
          folderPath: '/repo',
          runnerType: 'xpod-pty',
          tool: 'codex',
          status: 'active',
          tokenUsage: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
        },
      ])

      render(<ChatListPane theme="light" />, { wrapper: createWrapper() })

      const item = await screen.findByText('Runtime Chat')
      fireEvent.contextMenu(item)

      const copyItem = await screen.findByText('复制日志')
      fireEvent.click(copyItem)

      await waitFor(() => {
        expect(mockFetchRuntimeSessionLog).toHaveBeenCalledWith('runtime-1')
      })
      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('runtime log')
      })
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        description: '运行时日志已复制。',
      }))
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
