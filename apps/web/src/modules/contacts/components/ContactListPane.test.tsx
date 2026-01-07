import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'

// --- Mock data (must be inline in factory) ---

// Mock contactOps - factory function can't reference external variables
vi.mock('../collections', () => {
  const mockContacts = [
    {
      id: 'mock-agent-1',
      name: '智能翻译官',
      alias: '翻译助手',
      contactType: 'agent',
      starred: true,
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'mock-solid-1',
      name: 'Alice',
      alias: null,
      contactType: 'solid',
      starred: false,
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'mock-wechat-1',
      name: '老王',
      alias: null,
      contactType: 'external',
      externalPlatform: 'wechat',
      starred: false,
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]
  
  return {
    contactOps: {
      getAll: vi.fn(() => mockContacts),
      search: vi.fn((query: string) => {
        const q = query.toLowerCase()
        return mockContacts.filter(c => 
          c.name.toLowerCase().includes(q) || 
          (c.alias && c.alias.toLowerCase().includes(q))
        )
      }),
      subscribeToPod: vi.fn(() => Promise.resolve(() => {})),
    },
    initializeContactCollections: vi.fn(),
  }
})

// Mock solid database provider
vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => ({ db: { mockDb: true }, status: 'ready' }),
}))

// Mock store state - will be updated in tests
let mockStoreState = {
  search: '',
  setSearch: vi.fn(),
  selectedId: null as string | null,
  viewMode: 'view',
  select: vi.fn(),
  startCreate: vi.fn(),
  startEdit: vi.fn(),
  cancelEdit: vi.fn(),
  showNewFriends: vi.fn(),
  newFriendsCount: 2,
}

vi.mock('../store', () => ({
  useContactStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}))

// Import after mocks
import { ContactListPane } from './ContactListPane'
import { contactOps } from '../collections'

// Wrapper for React Query
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('ContactListPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Reset store state
    mockStoreState = {
      search: '',
      setSearch: vi.fn(),
      selectedId: null,
      viewMode: 'view',
      select: vi.fn(),
      startCreate: vi.fn(),
      startEdit: vi.fn(),
      cancelEdit: vi.fn(),
      showNewFriends: vi.fn(),
      newFriendsCount: 2,
    }
  })

  describe('Rendering', () => {
    it('renders search input', async () => {
      render(<ContactListPane theme="light" />, { wrapper: createWrapper() })
      expect(screen.getByPlaceholderText('搜索联系人')).toBeInTheDocument()
    })

    it('renders add button', async () => {
      render(<ContactListPane theme="light" />, { wrapper: createWrapper() })
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })

    it('renders new friends entry with badge', async () => {
      render(<ContactListPane theme="light" />, { wrapper: createWrapper() })
      expect(screen.getByText('新的朋友')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('renders contacts from contactOps', async () => {
      render(<ContactListPane theme="light" />, { wrapper: createWrapper() })
      
      // Wait for data to load
      // Note: 智能翻译官 shows as its alias "翻译助手"
      expect(await screen.findByText('翻译助手')).toBeInTheDocument()
      expect(await screen.findByText('Alice')).toBeInTheDocument()
      expect(await screen.findByText('老王')).toBeInTheDocument()
    })
  })

  describe('Search Functionality', () => {
    it('filters contacts by search term', async () => {
      mockStoreState.search = 'alice'
      // Override mock for this test
      vi.mocked(contactOps.search).mockReturnValue([
        {
          id: 'mock-solid-1',
          name: 'Alice',
          alias: null,
          contactType: 'solid',
          starred: false,
          avatarUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any)
      
      render(<ContactListPane theme="light" />, { wrapper: createWrapper() })
      
      expect(await screen.findByText('Alice')).toBeInTheDocument()
      expect(screen.queryByText('老王')).not.toBeInTheDocument()
    })

    it('hides new friends entry when searching', async () => {
      mockStoreState.search = 'alice'
      vi.mocked(contactOps.search).mockReturnValue([
        {
          id: 'mock-solid-1',
          name: 'Alice',
          alias: null,
          contactType: 'solid',
          starred: false,
          avatarUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any)
      
      render(<ContactListPane theme="light" />, { wrapper: createWrapper() })
      
      // Wait for search results
      await screen.findByText('Alice')
      expect(screen.queryByText('新的朋友')).not.toBeInTheDocument()
    })

    it('shows empty state when no matches', async () => {
      mockStoreState.search = 'xyz-nonexistent'
      vi.mocked(contactOps.search).mockReturnValue([])
      
      render(<ContactListPane theme="light" />, { wrapper: createWrapper() })
      
      expect(await screen.findByText('暂无联系人')).toBeInTheDocument()
    })
  })

  describe('Interactions', () => {
    it('calls select when clicking a contact', async () => {
      render(<ContactListPane theme="light" />, { wrapper: createWrapper() })
      
      const alice = await screen.findByText('Alice')
      fireEvent.click(alice)
      expect(mockStoreState.select).toHaveBeenCalledWith('mock-solid-1')
    })

    it('calls showNewFriends when clicking new friends entry', async () => {
      render(<ContactListPane theme="light" />, { wrapper: createWrapper() })
      
      fireEvent.click(screen.getByText('新的朋友'))
      expect(mockStoreState.showNewFriends).toHaveBeenCalled()
    })

    it('updates search on input change', async () => {
      render(<ContactListPane theme="light" />, { wrapper: createWrapper() })
      
      const searchInput = screen.getByPlaceholderText('搜索联系人')
      fireEvent.change(searchInput, { target: { value: 'test' } })
      
      expect(mockStoreState.setSearch).toHaveBeenCalledWith('test')
    })
  })

  describe('Grouping', () => {
    it('groups starred contacts separately', async () => {
      render(<ContactListPane theme="light" />, { wrapper: createWrapper() })
      
      // Wait for contacts to load - '智能翻译官' shows as alias '翻译助手'
      await screen.findByText('翻译助手')
      expect(screen.getByText('星标朋友')).toBeInTheDocument()
    })
  })

  describe('Contact Item Display', () => {
    it('shows @wechat suffix for wechat contacts', async () => {
      render(<ContactListPane theme="light" />, { wrapper: createWrapper() })
      
      // Wait for contacts to load
      await screen.findByText('老王')
      expect(screen.getByText('@wechat')).toBeInTheDocument()
    })
  })

  describe('Selection State', () => {
    it('highlights selected contact', async () => {
      mockStoreState.selectedId = 'mock-solid-1'
      
      render(<ContactListPane theme="light" />, { wrapper: createWrapper() })
      
      const alice = await screen.findByText('Alice')
      const aliceItem = alice.closest('[class*="cursor-pointer"]')
      expect(aliceItem).toHaveClass('bg-accent')
    })
  })
})
