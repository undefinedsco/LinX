import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SelfProfileCard } from './SelfProfileCard'

const findByIriMock = vi.fn()

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
    storedAccount: {
      issuerLabel: 'Cloud',
      issuerUrl: 'https://id.undefineds.co',
      providerLabel: 'Local',
      providerUrl: 'https://node-0000.undefineds.co/',
    },
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
  it('renders a default card when the Solid profile record is missing', async () => {
    findByIriMock.mockResolvedValueOnce(null)

    const { container } = renderCard()

    expect(await screen.findByText('LinX 用户')).toBeTruthy()
    expect(screen.getByText('alice')).toBeTruthy()
    expect(screen.getByText('Local')).toBeTruthy()
    expect(screen.getByText('node-0000.undefineds.co')).toBeTruthy()
    expect(container.querySelector('[data-profile-local-marker]')).toBeTruthy()
    expect(screen.getAllByText('未填写').length).toBeGreaterThan(0)
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
})
