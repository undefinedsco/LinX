import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mockNavigate }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: { name: '林舟', note: '周末在书店做读书会' } }),
}))
vi.mock('@/providers/solid-session-context', () => ({
  useSession: () => ({
    session: { info: { webId: 'https://id.undefineds.co/linzhou/profile/card#me' }, fetch: vi.fn() },
  }),
}))
vi.mock('@/providers/solid-database-provider', () => ({ useSolidDatabase: () => ({ db: {} }) }))

const spaceState = vi.hoisted(() => ({
  attention: null as null | { message: string; action?: { id: string; label: string } },
}))
vi.mock('@/modules/profile/useSpaceStatus', () => ({
  useSpaceStatus: () => ({ attention: spaceState.attention }),
}))

const switchAccount = vi.hoisted(() => vi.fn())
vi.mock('@/modules/login/login-utils', () => ({ requestSwitchAccount: switchAccount }))

import { useSettingsStore } from '@/modules/settings/app/store'
import { MePage } from './MePage'
import { useShellStore } from './shell-store'

describe('MePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    spaceState.attention = null
    useSettingsStore.setState({ selectedSection: 'about', compactLevel: 'section' })
    useShellStore.setState({ signOutOpen: false })
  })

  it('shows who you are and 收藏 / 设置 / account actions, but no 我的 AI', () => {
    render(<MePage theme="light" />)

    expect(screen.getByText('林舟')).toBeInTheDocument()
    expect(screen.getByText('linzhou@undefineds.co')).toBeInTheDocument()
    for (const name of ['收藏', '设置', '切换账号', '退出登录']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.queryByText('我的 AI')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('opens the editor from the identity row', () => {
    render(<MePage theme="light" />)

    fireEvent.click(screen.getByText('林舟'))
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/$microAppId', params: { microAppId: 'profile' } })
  })

  it('opens 设置 on its section list', () => {
    render(<MePage theme="light" />)

    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    expect(useSettingsStore.getState().compactLevel).toBe('list')
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/$microAppId', params: { microAppId: 'settings' } })
  })

  it('asks the shell to confirm sign out', () => {
    render(<MePage theme="light" />)

    fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
    expect(useShellStore.getState().signOutOpen).toBe(true)
  })

  it('adds one row with one action when the space has a problem', () => {
    spaceState.attention = { message: '本机空间没有启动', action: { id: 'open-local-service', label: '启动' } }
    render(<MePage theme="light" />)

    expect(screen.getByRole('status')).toHaveTextContent('本机空间没有启动')
    fireEvent.click(screen.getByRole('button', { name: '启动' }))
    expect(useSettingsStore.getState().selectedSection).toBe('runtime')
  })
})
