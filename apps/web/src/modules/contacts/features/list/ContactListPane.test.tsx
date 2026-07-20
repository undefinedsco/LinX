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
  session: {
    info: { webId: null as string | null, isLoggedIn: true },
  },
}))

vi.mock('@inrupt/solid-ui-react', () => ({
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
      search: vi.fn(async () => []),
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
    for (const row of contactCollection.toArray) {
      contactCollection.delete(row.id)
    }
  })

  it('fetches the first contact page when the Pod database is ready', async () => {
    render(<ContactListPane />, { wrapper: createWrapper() })

    await waitFor(() => expect(mocks.fetchContacts).toHaveBeenCalledOnce())
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
})
