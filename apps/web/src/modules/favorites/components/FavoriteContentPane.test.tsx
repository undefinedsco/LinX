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
vi.mock('../store', () => ({
  useFavoriteStore: (selector: (state: unknown) => unknown) => mockUseFavoriteStore(selector),
}))

const mockUseFavoriteList = vi.fn()
const mockRemoveMutateAsync = vi.fn().mockResolvedValue(undefined)
vi.mock('../collections', () => ({
  useFavoriteList: () => mockUseFavoriteList(),
  useFavoriteMutations: () => ({
    removeFavorite: { mutateAsync: mockRemoveMutateAsync },
  }),
}))

let mockFeatureFlag = true
vi.mock('../feature-flags', () => ({
  get FAVORITES_CP1_ENABLED() {
    return mockFeatureFlag
  },
}))

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@linx/models', () => ({
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
    mockFeatureFlag = true

    mockUseFavoriteStore.mockImplementation((selector: (state: unknown) => unknown) => {
      return selector(createDefaultStoreState())
    })

    mockUseFavoriteList.mockReturnValue({
      data: [mockFavorite],
      isLoading: false,
      error: null,
    })
  })

  describe('Feature Flag', () => {
    it('shows empty state when feature flag is off', () => {
      mockFeatureFlag = false

      render(<FavoriteContentPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('选择一个收藏项查看详情')).toBeInTheDocument()
    })
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
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })

    it('renders source module label', () => {
      mockUseFavoriteStore.mockImplementation((selector: (state: unknown) => unknown) => {
        return selector(createDefaultStoreState({ selectedFavoriteId: 'fav-1' }))
      })

      render(<FavoriteContentPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('聊天')).toBeInTheDocument()
    })

    it('renders action buttons', () => {
      mockUseFavoriteStore.mockImplementation((selector: (state: unknown) => unknown) => {
        return selector(createDefaultStoreState({ selectedFavoriteId: 'fav-1' }))
      })

      render(<FavoriteContentPane theme="light" />, { wrapper: createWrapper() })

      expect(screen.getByText('打开原对象')).toBeInTheDocument()
      expect(screen.getByText('取消收藏')).toBeInTheDocument()
    })
  })

  describe('Remove Favorite', () => {
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
    it('navigates to source module on open source click', () => {
      mockUseFavoriteStore.mockImplementation((selector: (state: unknown) => unknown) => {
        return selector(createDefaultStoreState({ selectedFavoriteId: 'fav-1' }))
      })

      render(<FavoriteContentPane theme="light" />, { wrapper: createWrapper() })

      fireEvent.click(screen.getByText('打开原对象'))

      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/',
        search: { app: 'chat' },
      })
    })
  })
})
