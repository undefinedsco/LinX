/**
 * CP1 Component Tests: ContactListPane filtering
 *
 * Tests contactType filtering without restoring the removed filter-tab row.
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { ContactClass } from '@undefineds.co/models'

const { mockUseLiveQuery } = vi.hoisted(() => ({
  mockUseLiveQuery: vi.fn(),
}))
const mockContacts = [
  { id: 's-1', name: 'Alice', rdfType: ContactClass.PERSON, contactType: 'solid', starred: false, avatarUrl: null, about: 'https://alice.example/profile/card#me' },
  { id: 's-2', name: 'Bob', rdfType: ContactClass.PERSON, contactType: 'solid', starred: true, avatarUrl: null, about: 'https://bob.example/profile/card#me' },
  { id: 'a-1', name: 'GPT Helper', rdfType: ContactClass.AGENT, contactType: 'agent', starred: false, avatarUrl: null, about: 'https://pod.example/agents/gpt-helper/profile/card#me' },
  { id: 'g-1', name: 'Dev Team', rdfType: ContactClass.GROUP, contactType: 'solid', starred: false, avatarUrl: null, about: '/.data/contacts/g-1.ttl' },
]

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: mockUseLiveQuery,
}))

vi.mock('../data/collections', () => ({
  contactCollection: {
    startSyncImmediate: vi.fn(),
  },
  contactOps: {
    getAll: vi.fn(() => mockContacts),
    search: vi.fn(() => []),
    subscribeToPod: vi.fn(() => Promise.resolve(() => {})),
    fetch: vi.fn(async () => mockContacts),
    getGroupDisplayInfo: vi.fn(() => ({
      memberCount: 2,
      isOwner: true,
      memberPreview: ['Alice', 'Bob'],
    })),
  },
  initializeContactCollections: vi.fn(),
}))

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => ({ db: { mockDb: true }, status: 'ready' }),
}))

vi.mock('@/providers/solid-session-context', () => ({
  useSession: () => ({
    session: {
      info: {
        webId: 'https://me.example/profile/card#me',
      },
    },
  }),
}))

// Store mock — mutable so tests can change listFilter
let mockStoreState = {
  search: '',
  setSearch: vi.fn(),
  selectedId: null as string | null,
  viewMode: 'view',
  select: vi.fn(),
  openCreateDialog: vi.fn(),
  listFilter: 'all' as string,
  setListFilter: vi.fn(),
}

vi.mock('../app/store', () => ({
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
    mockUseLiveQuery.mockReturnValue({
      data: mockContacts,
      isLoading: false,
      isError: false,
    })
    mockStoreState = {
      search: '',
      setSearch: vi.fn(),
      selectedId: null,
      viewMode: 'view',
      select: vi.fn(),
      openCreateDialog: vi.fn(),
      listFilter: 'all',
      setListFilter: vi.fn(),
    }
  })

  it('keeps the list header compact without a filter-tab row', async () => {
    render(<ContactListPane theme="light" />, { wrapper: createWrapper() })

    expect(screen.getByPlaceholderText('搜索联系人')).toBeInTheDocument()
    expect(screen.queryByText('全部')).not.toBeInTheDocument()
    expect(screen.queryByText('个人')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'AI' })).not.toBeInTheDocument()
    expect(screen.queryByText('群组')).not.toBeInTheDocument()
  })

  it('renders all contacts when filter is "all"', async () => {
    render(<ContactListPane theme="light" />, { wrapper: createWrapper() })

    expect(await screen.findByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('GPT Helper')).toBeInTheDocument()
    expect(screen.getByText('Dev Team')).toBeInTheDocument()
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

  it('shows group summary and owner badge for group contacts', async () => {
    render(<ContactListPane theme="light" />, { wrapper: createWrapper() })

    expect(await screen.findByText('2人 · Alice、Bob')).toBeInTheDocument()
    expect(screen.getByText('群主')).toBeInTheDocument()
  })

  it('hides filter tabs when searching', async () => {
    mockStoreState.search = 'alice'

    render(<ContactListPane theme="light" />, { wrapper: createWrapper() })

    // Filter tabs should be hidden during search
    expect(screen.queryByText('全部')).not.toBeInTheDocument()
  })
})
