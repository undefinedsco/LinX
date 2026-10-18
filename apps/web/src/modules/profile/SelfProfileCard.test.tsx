import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
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

vi.mock('@/providers/solid-session-context', () => ({
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

const spaceState = vi.hoisted(() => ({
  attention: null as null | { kind: string; severity: string; message: string; action?: { id: string; label: string } },
}))

vi.mock('./useSpaceStatus', () => ({
  useSpaceStatus: () => ({
    spaceKind: 'local',
    spaceLabel: '本机',
    providerHost: 'https://node-0000.undefineds.co/',
    issuerLabel: 'Cloud',
    databaseStatus: 'ready',
    online: true,
    aiConnected: true,
    aiStatus: 'connected',
    connectedProviderCount: 1,
    attention: spaceState.attention,
  }),
}))

vi.mock('@linx/stores/login', () => ({
  useLoginStore: (selector: any) => selector({
    storedAccount: loginStoreState.storedAccount,
  }),
}))

function renderCard(props: Parameters<typeof SelfProfileCard>[0] = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={client}>
      <SelfProfileCard {...props} />
    </QueryClientProvider>,
  )
}

describe('SelfProfileCard', () => {
  beforeEach(() => {
    findByIriMock.mockReset()
    spaceState.attention = null
    loginStoreState.storedAccount = {
      issuerLabel: 'Cloud',
      issuerUrl: 'https://id.undefineds.co',
      storageProviderLabel: 'Local',
      storageProviderUrl: 'https://node-0000.undefineds.co/',
    }
  })

  it('shows who you are and where your data lives, nothing more when all is well', async () => {
    findByIriMock.mockResolvedValueOnce(null)

    renderCard()

    expect(await screen.findByText('LinX 用户')).toBeTruthy()
    expect(screen.getByText('alice@本机')).toBeTruthy()
    expect(screen.getByText('空间：本机')).toBeTruthy()
    // The provider host is a tooltip detail, not a permanent line on the card.
    expect(screen.queryByText('node-0000.undefineds.co')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    for (const label of ['编辑个人资料', '设置', '切换账号', '退出登录']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('adds one line with one action when something needs attention', async () => {
    findByIriMock.mockResolvedValueOnce(null)
    spaceState.attention = { kind: 'ai-not-connected', severity: 'action', message: 'AI 还没连接', action: { id: 'connect-ai', label: '去连接' } }
    const onConnectAi = vi.fn()

    renderCard({ onConnectAi })

    expect(await screen.findByRole('status')).toHaveTextContent('AI 还没连接')
    fireEvent.click(screen.getByRole('button', { name: '去连接' }))
    expect(onConnectAi).toHaveBeenCalled()
  })

  it('hands account actions to the shell', async () => {
    findByIriMock.mockResolvedValueOnce(null)
    const onOpenSettings = vi.fn()
    const onSwitchAccount = vi.fn()
    const onSignOut = vi.fn()

    renderCard({ onOpenSettings, onSwitchAccount, onSignOut })
    await screen.findByText('LinX 用户')

    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    fireEvent.click(screen.getByRole('button', { name: '切换账号' }))
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
    expect(onOpenSettings).toHaveBeenCalled()
    expect(onSwitchAccount).toHaveBeenCalled()
    expect(onSignOut).toHaveBeenCalled()
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
    // The card shows the signature; contact details live on the edit page.
    expect(screen.getByText('hello')).toBeTruthy()
    expect(screen.queryByText('alice@example.com')).toBeNull()
    expect(screen.queryByText('123')).toBeNull()
  })

  it('opens the profile editor from the first menu row', async () => {
    findByIriMock.mockResolvedValueOnce(null)
    const onEditProfile = vi.fn()

    renderCard({ onEditProfile })
    await screen.findByText('LinX 用户')

    fireEvent.click(screen.getByRole('button', { name: '编辑个人资料' }))
    expect(onEditProfile).toHaveBeenCalled()
  })

  it('does not expose profile sync internals when loading fails', async () => {
    findByIriMock.mockRejectedValueOnce(new Error('读取 WebID Profile 失败：HTTP 401'))

    renderCard()

    expect(await screen.findByText('登录状态已失效。请重新登录。')).toBeTruthy()
    expect(screen.queryByText(/WebID Profile|HTTP 401/i)).toBeNull()
  })
})
