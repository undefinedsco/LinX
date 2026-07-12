import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  contactCollection: null as any,
}))

vi.mock('@inrupt/solid-ui-react', () => ({
  useSession: () => ({ session: { info: { webId: null } } }),
}))

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => ({ db: {} }),
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
      fetch: vi.fn(async () => []),
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
    for (const row of contactCollection.toArray) {
      contactCollection.delete(row.id)
    }
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
