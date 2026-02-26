/**
 * FavoriteListPane Tests
 *
 * Tests for search, source filter, card rendering, selection, and empty state.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'

// ============================================================================
// Mocks
// ============================================================================

const mockUseFavoriteStore = vi.fn()
vi.mock('../store', () => ({
  useFavoriteStore: (selector: (state: unknown) => unknown) => mockUseFavoriteStore(selector),
}))

const mockUseFavoriteList = vi.fn()
vi.mock('../collections', () => ({
  useFavoriteList: (filters?: unknown) => mockUseFavoriteList(filters),
  useFavoriteInit: () => ({ db: null, isReady: true }),
}))

vi.mock('@linx/models', () => ({
  resolveRowId: (item: unknown) => (item as Record<string, unknown>)?.id ?? 'mock-id',
}))

// Mock shadcn/ui components
vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}))

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, ...props }: any) => <div data-testid="scroll-area" {...props}>{children}</div>,
}))

vi.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
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
  searchText: '',
  setSearchText: vi.fn(),
  sourceFilter: 'all',
  setSourceFilter: vi.fn(),
  selectedFavoriteId: null,
  select: vi.fn(),
  ...overrides,
})

// ============================================================================
// Import after mocks
// ============================================================================

import { FavoriteListPane } from './FavoriteListPane'

// ============================================================================
// Tests
// ============================================================================

describe('FavoriteListPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockUseFavoriteStore.mockImplementation((selector: (state: unknown) => unknown) => {
      return selector(createDefaultStoreState())
    })

    mockUseFavoriteList.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    })
  })

  describe('Empty State', () => {
    it('shows empty state when no favorites', () => {
      mockUseFavoriteList.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      })

      render(<FavoriteListPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('暂无收藏')).toBeInTheDocument()
    })

    it('shows loading state', () => {
      mockUseFavoriteList.mockReturnValue({
        data: [],
        isLoading: true,
        error: null,
      })

      render(<FavoriteListPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('正在加载...')).toBeInTheDocument()
    })
  })

  describe('Card Rendering', () => {
    it('renders favorite cards with title and content', () => {
      mockUseFavoriteList.mockReturnValue({
        data: [
          {
            id: 'fav-1',
            title: 'My Chat',
            sourceModule: 'chat',
            snapshotContent: 'Last message here',
            snapshotAuthor: 'Alice',
            favoredAt: new Date('2026-01-15'),
          },
          {
            id: 'fav-2',
            title: 'Contact Bob',
            sourceModule: 'contacts',
            snapshotContent: null,
            snapshotAuthor: null,
            favoredAt: new Date('2026-02-01'),
          },
        ],
        isLoading: false,
        error: null,
      })

      render(<FavoriteListPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('My Chat')).toBeInTheDocument()
      expect(screen.getByText('Last message here')).toBeInTheDocument()
      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Contact Bob')).toBeInTheDocument()
    })

    it('calls select when clicking a card', () => {
      const mockSelect = vi.fn()
      mockUseFavoriteStore.mockImplementation((selector: (state: unknown) => unknown) => {
        return selector(createDefaultStoreState({ select: mockSelect }))
      })

      mockUseFavoriteList.mockReturnValue({
        data: [
          {
            id: 'fav-1',
            title: 'Clickable Fav',
            sourceModule: 'chat',
            favoredAt: new Date(),
          },
        ],
        isLoading: false,
        error: null,
      })

      render(<FavoriteListPane theme="light" />, { wrapper: createWrapper() })

      fireEvent.click(screen.getByText('Clickable Fav'))
      expect(mockSelect).toHaveBeenCalledWith('fav-1')
    })
  })

  describe('Search', () => {
    it('passes search text to useFavoriteList', () => {
      mockUseFavoriteStore.mockImplementation((selector: (state: unknown) => unknown) => {
        return selector(createDefaultStoreState({ searchText: 'hello' }))
      })

      render(<FavoriteListPane theme="light" />, { wrapper: createWrapper() })

      expect(mockUseFavoriteList).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'hello' })
      )
    })
  })

  describe('Source Filter', () => {
    it('passes sourceModule filter to useFavoriteList', () => {
      mockUseFavoriteStore.mockImplementation((selector: (state: unknown) => unknown) => {
        return selector(createDefaultStoreState({ sourceFilter: 'chat' }))
      })

      render(<FavoriteListPane theme="light" />, { wrapper: createWrapper() })

      expect(mockUseFavoriteList).toHaveBeenCalledWith(
        expect.objectContaining({ sourceModule: 'chat' })
      )
    })

    it('passes undefined sourceModule when filter is "all"', () => {
      mockUseFavoriteStore.mockImplementation((selector: (state: unknown) => unknown) => {
        return selector(createDefaultStoreState({ sourceFilter: 'all' }))
      })

      render(<FavoriteListPane theme="light" />, { wrapper: createWrapper() })

      expect(mockUseFavoriteList).toHaveBeenCalledWith(
        expect.objectContaining({ sourceModule: undefined })
      )
    })

    it('renders all source filter tabs', () => {
      render(<FavoriteListPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('全部')).toBeInTheDocument()
      expect(screen.getByText('聊天')).toBeInTheDocument()
      expect(screen.getByText('联系人')).toBeInTheDocument()
      expect(screen.getByText('文件')).toBeInTheDocument()
      expect(screen.getByText('消息')).toBeInTheDocument()
      expect(screen.getByText('话题')).toBeInTheDocument()
    })
  })
})
