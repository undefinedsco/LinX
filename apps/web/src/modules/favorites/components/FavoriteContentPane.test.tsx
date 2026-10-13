/**
 * FavoriteContentPane Tests
 *
 * Tests for detail rendering, remove favorite, open source, and empty state.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'

// ============================================================================
// Mocks
// ============================================================================

const mockUseFavoriteStore = vi.fn()
vi.mock('../app/store', () => ({
  useFavoriteStore: (selector: (state: unknown) => unknown) => mockUseFavoriteStore(selector),
}))

const mockUseFavoriteList = vi.fn()
const mockUseFavoriteSourceStatus = vi.fn()
const mockRemoveMutateAsync = vi.fn().mockResolvedValue(undefined)
const mockRestoreMutateAsync = vi.fn().mockResolvedValue(undefined)
const mockToast = vi.fn()
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }))
const mockOpenCard = vi.fn()
vi.mock('@/lib/card-dialog', () => ({
  useCardDialog: (selector: (state: unknown) => unknown) => selector({ open: mockOpenCard }),
}))
vi.mock('../data/collections', () => ({
  useFavoriteList: () => mockUseFavoriteList(),
  useFavoriteSourceStatus: (target: unknown) => mockUseFavoriteSourceStatus(target),
  useFavoriteMutations: () => ({
    removeFavorite: { mutateAsync: mockRemoveMutateAsync },
    restoreFavorite: { mutateAsync: mockRestoreMutateAsync },
  }),
}))

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

const mockSelectChat = vi.fn()
const mockSelectThread = vi.fn()
const mockSetMessageAnchor = vi.fn()
vi.mock('@/modules/chat/store', () => ({
  useChatStore: (selector: (state: unknown) => unknown) => selector({
    selectChat: mockSelectChat,
    selectThread: mockSelectThread,
    setMessageAnchor: mockSetMessageAnchor,
  }),
}))

const mockSelectContact = vi.fn()
vi.mock('@/modules/contacts/app/store', () => ({
  useContactStore: (selector: (state: unknown) => unknown) => selector({
    select: mockSelectContact,
  }),
}))

const mockSelectFile = vi.fn()
const mockSelectTreeNode = vi.fn()
vi.mock('@/modules/files/store', () => ({
  useFilesStore: (selector: (state: unknown) => unknown) => selector({
    selectFile: mockSelectFile,
    selectTreeNode: mockSelectTreeNode,
  }),
}))

vi.mock('@undefineds.co/models', () => ({
  resolveRowId: (item: unknown) => (item as Record<string, unknown>)?.id ?? 'mock-id',
}))

// ============================================================================
// Helpers
// ============================================================================

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const createDefaultStoreState = (overrides = {}) => ({
  selectedFavoriteId: null,
  select: vi.fn(),
  ...overrides,
})

const mockFavorite = {
  id: 'fav-1',
  title: 'Starred Chat',
  sourceModule: 'chat',
  sourceId: 'chat-1',
  snapshotContent: 'Hello world preview',
  snapshotAuthor: 'Alice',
  snapshotMeta: null,
  favoredAt: new Date('2026-01-15T10:30:00Z'),
  updatedAt: null,
  targetType: 'chat',
  targetUri: 'chat-1',
  searchText: 'Starred Chat',
}

// ============================================================================
// Import after mocks
// ============================================================================

import { FavoriteContentPane } from './FavoriteContentPane'

// ============================================================================
// Tests
// ============================================================================

describe('FavoriteContentPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockUseFavoriteStore.mockImplementation((selector: (state: unknown) => unknown) => {
      return selector(createDefaultStoreState())
    })

    mockUseFavoriteList.mockReturnValue({
      data: [mockFavorite],
      isLoading: false,
      error: null,
    })
    mockUseFavoriteSourceStatus.mockReturnValue('available')
  })

  describe('Empty State', () => {
    it('shows empty state when no favorite is selected', () => {
      mockUseFavoriteStore.mockImplementation((selector: (state: unknown) => unknown) => {
        return selector(createDefaultStoreState({ selectedFavoriteId: null }))
      })

      render(<FavoriteContentPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('选择一个收藏项查看详情')).toBeInTheDocument()
    })
  })

  describe('Detail Rendering', () => {
    it('renders favorite detail with title and content', () => {
      mockUseFavoriteStore.mockImplementation((selector: (state: unknown) => unknown) => {
        return selector(createDefaultStoreState({ selectedFavoriteId: 'fav-1' }))
      })

      render(<FavoriteContentPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('Starred Chat')).toBeInTheDocument()
      expect(screen.getByText('Hello world preview')).toBeInTheDocument()
      expect(screen.getByText(/Alice/)).toBeInTheDocument()
    })

    it('renders source module label', () => {
      mockUseFavoriteStore.mockImplementation((selector: (state: unknown) => unknown) => {
        return selector(createDefaultStoreState({ selectedFavoriteId: 'fav-1' }))
      })

      render(<FavoriteContentPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText(/^会话 · Alice/)).toBeInTheDocument()
    })

    it('renders action buttons', () => {
      mockUseFavoriteStore.mockImplementation((selector: (state: unknown) => unknown) => {
        return selector(createDefaultStoreState({ selectedFavoriteId: 'fav-1' }))
      })

      render(<FavoriteContentPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('在会话中查看')).toBeInTheDocument()
      expect(screen.getByText('取消收藏')).toBeInTheDocument()
    })
  })

  describe('Original availability', () => {
    const selectFav = () => mockUseFavoriteStore.mockImplementation((selector: (state: unknown) => unknown) => (
      selector(createDefaultStoreState({ selectedFavoriteId: 'fav-1' }))
    ))

    it('does not show saved content once the original is deleted', () => {
      selectFav()
      mockUseFavoriteSourceStatus.mockReturnValue('deleted')

      render(<FavoriteContentPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('原会话已被删除')).toBeInTheDocument()
      expect(screen.queryByText('Hello world preview')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '移除这条收藏' }))
      expect(mockRemoveMutateAsync).toHaveBeenCalledWith('fav-1')
    })

    it('does not show saved content after access is withdrawn', () => {
      selectFav()
      mockUseFavoriteSourceStatus.mockReturnValue('forbidden')

      render(<FavoriteContentPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('没有权限了')).toBeInTheDocument()
      expect(screen.queryByText('Hello world preview')).not.toBeInTheDocument()
    })

    it('shows the last seen content offline but cannot jump back', () => {
      selectFav()
      mockUseFavoriteSourceStatus.mockReturnValue('offline')

      render(<FavoriteContentPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('Hello world preview')).toBeInTheDocument()
      expect(screen.getByText(/没有网络：显示的是上次看到的内容/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '在会话中查看' })).toBeDisabled()
    })

    it('waits instead of flashing content while checking', () => {
      selectFav()
      mockUseFavoriteSourceStatus.mockReturnValue('checking')

      render(<FavoriteContentPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.queryByText('Hello world preview')).not.toBeInTheDocument()
      expect(screen.getByLabelText('正在确认原内容')).toBeInTheDocument()
    })
  })

  describe('Single message favorites', () => {
    const messageFavorite = {
      ...mockFavorite,
      id: 'fav-m',
      title: '签到表放共享盘了',
      sourceModule: 'messages',
      sourceId: 'https://alice.example/.data/chat/chat-1/2026/03/27/messages.ttl#msg-3',
      targetUri: 'https://alice.example/.data/chat/chat-1/2026/03/27/messages.ttl#msg-3',
      snapshotContent: '签到表放共享盘了，周六 9:30 前到',
      snapshotAuthor: '周禾',
      snapshotMeta: JSON.stringify({ chatTitle: '书店活动组' }),
    }
    const selectMessage = () => {
      mockUseFavoriteList.mockReturnValue({ data: [messageFavorite], isLoading: false, error: null })
      mockUseFavoriteStore.mockImplementation((selector: (state: unknown) => unknown) => (
        selector(createDefaultStoreState({ selectedFavoriteId: 'fav-m' }))
      ))
    }

    it('says the message is gone without showing the saved text', () => {
      selectMessage()
      mockUseFavoriteSourceStatus.mockReturnValue('deleted')

      render(<FavoriteContentPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('原消息已被删除')).toBeInTheDocument()
      expect(screen.getByText(/来自 书店活动组/)).toBeInTheDocument()
      expect(screen.queryByText(/签到表/)).not.toBeInTheDocument()
    })

    it('jumps to the chat and the message from the message uri when no meta ids were saved', () => {
      selectMessage()

      render(<FavoriteContentPane theme="light" />, { wrapper: createWrapper() })
      fireEvent.click(screen.getByText('在会话中查看'))

      expect(mockSelectChat).toHaveBeenCalledWith('chat-1')
      expect(mockSetMessageAnchor).toHaveBeenCalledWith(messageFavorite.sourceId)
    })
  })

  describe('Card favorites', () => {
    it('opens a card in the card dialog', () => {
      mockUseFavoriteList.mockReturnValue({
        data: [{ ...mockFavorite, sourceModule: 'files', sourceId: 'https://p.example/t.ttl#r1', targetUri: 'https://p.example/t.ttl#r1' }],
        isLoading: false,
        error: null,
      })
      mockUseFavoriteStore.mockImplementation((selector: (state: unknown) => unknown) => (
        selector(createDefaultStoreState({ selectedFavoriteId: 'fav-1' }))
      ))

      render(<FavoriteContentPane theme="light" />, { wrapper: createWrapper() })
      fireEvent.click(screen.getByText('查看卡片'))

      expect(mockOpenCard).toHaveBeenCalledWith({ uri: 'https://p.example/t.ttl#r1', from: 'favorites' })
    })
  })

  describe('Remove Favorite', () => {
    it('removes without a confirm dialog and offers an undo toast', async () => {
      const mockSelect = vi.fn()
      mockUseFavoriteStore.mockImplementation((selector: (state: unknown) => unknown) => (
        selector(createDefaultStoreState({ selectedFavoriteId: 'fav-1', select: mockSelect }))
      ))

      render(<FavoriteContentPane theme="light" />, { wrapper: createWrapper() })
      fireEvent.click(screen.getByText('取消收藏'))

      await vi.waitFor(() => expect(mockToast).toHaveBeenCalled())
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(mockToast.mock.calls[0][0]).toMatchObject({ description: '已取消收藏' })
      expect(mockToast.mock.calls[0][0].action).toBeTruthy()
    })

    it('calls removeFavorite and clears selection on remove click', async () => {
      const mockSelect = vi.fn()
      mockUseFavoriteStore.mockImplementation((selector: (state: unknown) => unknown) => {
        return selector(createDefaultStoreState({
          selectedFavoriteId: 'fav-1',
          select: mockSelect,
        }))
      })

      render(<FavoriteContentPane theme="light" />, { wrapper: createWrapper() })

      fireEvent.click(screen.getByText('取消收藏'))

      // removeFavorite.mutateAsync should be called with the favorite id
      expect(mockRemoveMutateAsync).toHaveBeenCalledWith('fav-1')
    })
  })

  describe('Open Source', () => {
    it('restores chat selection and navigates to the scene on open source click', () => {
      mockUseFavoriteStore.mockImplementation((selector: (state: unknown) => unknown) => {
        return selector(createDefaultStoreState({ selectedFavoriteId: 'fav-1' }))
      })

      render(<FavoriteContentPane theme="light" />, { wrapper: createWrapper() })

      fireEvent.click(screen.getByText('在会话中查看'))

      expect(mockSelectChat).toHaveBeenCalledWith('chat-1')
      expect(mockSetMessageAnchor).toHaveBeenCalledWith(null)
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/$microAppId',
        params: { microAppId: 'chat' },
      })
    })

    it('restores message anchor when favorite points to a message', () => {
      mockUseFavoriteList.mockReturnValue({
        data: [{
          ...mockFavorite,
          sourceModule: 'messages',
          sourceId: 'msg-3',
          targetUri: 'https://alice.example/.data/chat/chat-1/2026/03/27/messages.ttl#msg-3',
          snapshotMeta: JSON.stringify({
            chatId: 'chat-1',
            threadId: 'thread-2',
          }),
        }],
        isLoading: false,
        error: null,
      })

      mockUseFavoriteStore.mockImplementation((selector: (state: unknown) => unknown) => {
        return selector(createDefaultStoreState({ selectedFavoriteId: 'fav-1' }))
      })

      render(<FavoriteContentPane theme="light" />, { wrapper: createWrapper() })

      fireEvent.click(screen.getByText('在会话中查看'))

      expect(mockSelectChat).toHaveBeenCalledWith('chat-1')
      expect(mockSelectThread).toHaveBeenCalledWith('thread-2')
      expect(mockSetMessageAnchor).toHaveBeenCalledWith('msg-3')
    })
  })
})
