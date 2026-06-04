import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SelfProfileCard } from './SelfProfileCard'

const findByIriMock = vi.fn()
const loginStoreState = vi.hoisted(() => ({
  storedAccount: {
    issuerLabel: 'Cloud',
    issuerUrl: 'https://id.undefineds.co',
    storageProviderLabel: 'Local',
    storageProviderUrl: 'https://node-0000.undefineds.co/',
  },
}))

vi.mock('@inrupt/solid-ui-react', () => ({
  useSession: () => ({
    session: {
      info: {
        webId: 'http://127.0.0.1:5737/alice/profile/card#me',
      },
      fetch: vi.fn(),
    },
  }),
}))

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => ({
    db: {
      findByIri: findByIriMock,
    },
    status: 'ready',
    error: null,
  }),
}))

vi.mock('@linx/stores/login', () => ({
  useLoginStore: (selector: any) => selector({
    storedAccount: loginStoreState.storedAccount,
  }),
}))

function renderCard() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={client}>
      <SelfProfileCard />
    </QueryClientProvider>,
  )
}

describe('SelfProfileCard', () => {
  beforeEach(() => {
    findByIriMock.mockReset()
    loginStoreState.storedAccount = {
      issuerLabel: 'Cloud',
      issuerUrl: 'https://id.undefineds.co',
      storageProviderLabel: 'Local',
      storageProviderUrl: 'https://node-0000.undefineds.co/',
    }
  })

  it('renders a default card when the Solid profile record is missing', async () => {
    findByIriMock.mockResolvedValueOnce(null)

    const { container } = renderCard()

    expect(await screen.findByText('LinX 用户')).toBeTruthy()
    expect(screen.getByText('alice')).toBeTruthy()
    expect(screen.getByText('Local')).toBeTruthy()
    expect(screen.getByText('node-0000.undefineds.co')).toBeTruthy()
    expect(container.querySelector('[data-profile-local-marker]')).toBeTruthy()
    expect(container.querySelector('[data-profile-standalone-marker]')).toBeNull()
    expect(screen.getAllByText('未填写').length).toBeGreaterThan(0)
  })

  it('renders a standalone badge when the account and storage are local-only', async () => {
    loginStoreState.storedAccount = {
      issuerLabel: 'Standalone',
      issuerUrl: 'http://127.0.0.1:5737',
      storageProviderLabel: 'Standalone',
      storageProviderUrl: 'http://127.0.0.1:5737',
    }
    findByIriMock.mockResolvedValueOnce(null)

    const { container } = renderCard()

    expect(await screen.findByText('Standalone')).toBeTruthy()
    expect(container.querySelector('[data-profile-standalone-marker]')).toBeTruthy()
    expect(container.querySelector('[data-profile-local-marker]')).toBeNull()
  })

  it('renders profile fields when they exist', async () => {
    findByIriMock.mockResolvedValueOnce({
      name: 'Alice',
      nick: 'ali',
      email: 'alice@example.com',
      phone: '123',
      region: 'Shanghai',
      note: 'hello',
    })

    renderCard()

    expect(await screen.findByText('Alice')).toBeTruthy()
    expect(screen.getByText('ali')).toBeTruthy()
    expect(screen.getByText('alice@example.com')).toBeTruthy()
    expect(screen.getByText('123')).toBeTruthy()
    expect(screen.getByText('Shanghai')).toBeTruthy()
    expect(screen.getByText('hello')).toBeTruthy()
  })

  it('does not expose profile sync internals when loading fails', async () => {
    findByIriMock.mockRejectedValueOnce(new Error('读取 WebID Profile 失败：HTTP 401'))

    renderCard()

    expect(await screen.findByText('登录状态已失效。请重新登录。')).toBeTruthy()
    expect(screen.queryByText(/WebID Profile|HTTP 401/i)).toBeNull()
  })
})
