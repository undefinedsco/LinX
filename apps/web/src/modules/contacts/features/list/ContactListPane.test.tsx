import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  contactCollection: null as any,
  database: {
    db: {} as any,
    status: 'ready' as 'idle' | 'initializing' | 'ready' | 'error',
    error: null as Error | null,
    retry: vi.fn(),
  },
  fetchContacts: vi.fn(async () => []),
  searchContacts: vi.fn(async () => [] as Array<Record<string, unknown>>),
  session: {
    info: { webId: null as string | null, isLoggedIn: true },
  },
}))

vi.mock('@/providers/solid-session-context', () => ({
  useSession: () => ({ session: mocks.session }),
}))

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => mocks.database,
}))

vi.mock('../../data/collections', async () => {
  const { createCollection, localOnlyCollectionOptions } = await import('@tanstack/react-db')
  mocks.contactCollection = createCollection(
    localOnlyCollectionOptions({
      id: 'contacts-list-reactivity-test',
      getKey: (row: { id: string }) => row.id,
    }),
  )
  return {
    contactCollection: mocks.contactCollection,
    contactOps: {
      subscribeToPod: vi.fn(async () => () => {}),
      getGroupDisplayInfo: vi.fn(),
      fetch: mocks.fetchContacts,
      getAll: vi.fn(() => []),
      search: mocks.searchContacts,
    },
  }
})

const store = {
  search: '',
  setSearch: vi.fn(),
  selectedId: null,
  select: vi.fn(),
  openCreateDialog: vi.fn(),
  listFilter: 'all',
  setListFilter: vi.fn(),
}

vi.mock('../../app/store', () => ({
  useContactStore: (selector: (state: typeof store) => unknown) => selector(store),
}))

import { ContactListPane } from './ContactListPane'
import { contactCollection } from '../../data/collections'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('ContactListPane collection reactivity', () => {
  beforeEach(() => {
    mocks.database.db = {}
    mocks.database.status = 'ready'
    mocks.database.error = null
    mocks.session.info.isLoggedIn = true
    mocks.fetchContacts.mockClear()
    mocks.searchContacts.mockReset()
    mocks.searchContacts.mockResolvedValue([])
    store.search = ''
    for (const row of contactCollection.toArray) {
      contactCollection.delete(row.id)
    }
  })

  it('delegates the first contact hydration to useLiveQuery', async () => {
    render(<ContactListPane />, { wrapper: createWrapper() })

    await waitFor(() => expect(contactCollection.isReady()).toBe(true))
    expect(mocks.fetchContacts).not.toHaveBeenCalled()
  })

  it('does not present an unavailable Pod as an empty contact list', () => {
    mocks.database.db = null
    mocks.database.status = 'idle'
    mocks.session.info.isLoggedIn = false

    render(<ContactListPane />, { wrapper: createWrapper() })

    expect(screen.getByRole('alert')).toHaveTextContent('当前空间未连接，请先完成登录。')
    expect(screen.queryByText('暂无联系人')).not.toBeInTheDocument()
  })

  it('renders local Contact collection mutations without query invalidation', async () => {
    render(<ContactListPane />, { wrapper: createWrapper() })
    await waitFor(() => expect(contactCollection.isReady()).toBe(true))

    act(() => {
      contactCollection.insert({
        id: 'alice',
        name: 'Alice',
        contactType: 'solid',
        starred: false,
      })
    })
    expect(contactCollection.toArray.map((row) => row.name)).toEqual(['Alice'])
    expect(await screen.findByText('Alice')).toBeInTheDocument()

    act(() => {
      contactCollection.update('alice', (draft) => {
        draft.name = 'Alice Updated'
      })
    })
    expect(await screen.findByText('Alice Updated')).toBeInTheDocument()

    act(() => {
      contactCollection.delete('alice')
    })
    await waitFor(() => expect(screen.queryByText('Alice Updated')).not.toBeInTheDocument())
  })

  it('uses remote search so matches outside the resident window remain discoverable', async () => {
    store.search = 'remote alice'
    mocks.searchContacts.mockResolvedValueOnce([{
      id: 'outside-top-100',
      name: 'Remote Alice',
      contactType: 'solid',
      starred: false,
    }])

    render(<ContactListPane />, { wrapper: createWrapper() })

    expect(await screen.findByText('Remote Alice')).toBeInTheDocument()
    expect(mocks.searchContacts).toHaveBeenCalledWith('remote alice')
    expect(contactCollection.toArray).toHaveLength(0)
  })
})
