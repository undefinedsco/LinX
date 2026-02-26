/**
 * CP1 Component Tests: ContactListPane filtering
 *
 * Tests the filter tabs and contactType filtering behavior.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'

// Mock contacts data with mixed types
const mockContacts = [
  { id: 's-1', name: 'Alice', contactType: 'solid', starred: false, avatarUrl: null },
  { id: 's-2', name: 'Bob', contactType: 'solid', starred: true, avatarUrl: null },
  { id: 'a-1', name: 'GPT Helper', contactType: 'agent', starred: false, avatarUrl: null },
  { id: 'g-1', name: 'Dev Team', contactType: 'group', starred: false, avatarUrl: null },
]

vi.mock('../collections', () => ({
  contactOps: {
    getAll: vi.fn(() => mockContacts),
    search: vi.fn(() => []),
    subscribeToPod: vi.fn(() => Promise.resolve(() => {})),
    getGroupMembers: vi.fn(() => ['s-1', 's-2']),
  },
  initializeContactCollections: vi.fn(),
}))

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => ({ db: { mockDb: true }, status: 'ready' }),
}))

// Store mock — mutable so tests can change listFilter
let mockStoreState = {
  search: '',
  setSearch: vi.fn(),
  selectedId: null as string | null,
  viewMode: 'view',
  select: vi.fn(),
  openCreateDialog: vi.fn(),
  showNewFriends: vi.fn(),
  newFriendsCount: 0,
  listFilter: 'all' as string,
  setListFilter: vi.fn(),
}

vi.mock('../store', () => ({
  useContactStore: (selector: (s: typeof mockStoreState) => unknown) => selector(mockStoreState),
}))

import { ContactListPane } from './ContactListPane'

const createWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

describe('ContactListPane CP1 Filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState = {
      search: '',
      setSearch: vi.fn(),
      selectedId: null,
      viewMode: 'view',
      select: vi.fn(),
      openCreateDialog: vi.fn(),
      showNewFriends: vi.fn(),
      newFriendsCount: 0,
      listFilter: 'all',
      setListFilter: vi.fn(),
    }
  })

  it('renders filter tabs when CP1 enabled', async () => {
    render(<ContactListPane theme="light" />, { wrapper: createWrapper() })

    expect(screen.getByText('全部')).toBeInTheDocument()
    expect(screen.getByText('个人')).toBeInTheDocument()
    expect(screen.getByText('AI')).toBeInTheDocument()
    expect(screen.getByText('群组')).toBeInTheDocument()
  })

  it('renders all contacts when filter is "all"', async () => {
    render(<ContactListPane theme="light" />, { wrapper: createWrapper() })

    expect(await screen.findByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('GPT Helper')).toBeInTheDocument()
    expect(screen.getByText('Dev Team')).toBeInTheDocument()
  })

  it('calls setListFilter when a tab is clicked', async () => {
    render(<ContactListPane theme="light" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByText('群组'))
    expect(mockStoreState.setListFilter).toHaveBeenCalledWith('groups')
  })

  it('filters to only groups when listFilter is "groups"', async () => {
    mockStoreState.listFilter = 'groups'

    render(<ContactListPane theme="light" />, { wrapper: createWrapper() })

    expect(await screen.findByText('Dev Team')).toBeInTheDocument()
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
    expect(screen.queryByText('GPT Helper')).not.toBeInTheDocument()
  })

  it('filters to only agents when listFilter is "agents"', async () => {
    mockStoreState.listFilter = 'agents'

    render(<ContactListPane theme="light" />, { wrapper: createWrapper() })

    expect(await screen.findByText('GPT Helper')).toBeInTheDocument()
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
    expect(screen.queryByText('Dev Team')).not.toBeInTheDocument()
  })

  it('shows member count subtitle for group contacts', async () => {
    render(<ContactListPane theme="light" />, { wrapper: createWrapper() })

    // Dev Team group should show "2人" (from mocked getGroupMembers)
    expect(await screen.findByText('2人')).toBeInTheDocument()
  })

  it('hides filter tabs when searching', async () => {
    mockStoreState.search = 'alice'

    render(<ContactListPane theme="light" />, { wrapper: createWrapper() })

    // Filter tabs should be hidden during search
    expect(screen.queryByText('全部')).not.toBeInTheDocument()
  })
})
