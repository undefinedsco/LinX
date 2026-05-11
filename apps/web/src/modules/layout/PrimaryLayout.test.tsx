import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockNavigate = vi.fn()
const mockSessionState = vi.hoisted(() => ({
  isLoggedIn: true,
  sessionRequestInProgress: false,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/providers/solid-session-provider', () => ({
  useSession: () => ({
    session: {
      info: {
        isLoggedIn: mockSessionState.isLoggedIn,
      },
    },
    sessionRequestInProgress: mockSessionState.sessionRequestInProgress,
  }),
}))

vi.mock('@/modules/profile/SelfProfileCard', () => ({
  SelfProfileCard: () => <div>SelfProfileCard</div>,
}))

vi.mock('@/modules/settings/ServiceManagementDialog', () => ({
  ServiceManagementDialog: () => null,
}))

vi.mock('@/components/ShellStatusBadge', () => ({
  ShellStatusBadge: () => <div>ShellStatusBadge</div>,
}))

vi.mock('@/modules/inbox/components/InboxBellButton', () => ({
  InboxBellButton: () => <button aria-label="收件箱通知" type="button" />,
}))

import { PrimaryLayout } from './PrimaryLayout'

describe('PrimaryLayout', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockSessionState.isLoggedIn = true
    mockSessionState.sessionRequestInProgress = false
  })

  it('shows only stable first-slice modules in primary navigation', () => {
    render(<PrimaryLayout microAppId="chat" />)

    expect(screen.getByLabelText('聊天')).toBeTruthy()
    expect(screen.getByLabelText('联系人')).toBeTruthy()
    expect(screen.getByLabelText('文件')).toBeTruthy()
    expect(screen.getByLabelText('收藏')).toBeTruthy()
  })

  it('hides unfinished modules from the primary navigation', () => {
    render(<PrimaryLayout microAppId="chat" />)

    expect(screen.queryByLabelText('收件箱')).toBeNull()
  })

  it('does not expose the unfinished import utility', () => {
    render(<PrimaryLayout microAppId="chat" />)

    expect(screen.queryByLabelText('导入')).toBeNull()
    expect(screen.getByLabelText('设置')).toBeTruthy()
  })

  it('exposes the self profile trigger as an accessible button', () => {
    render(<PrimaryLayout microAppId="chat" />)

    expect(screen.getByRole('button', { name: '个人资料' })).toBeTruthy()
  })

  it('hides the application shell after sign out', () => {
    mockSessionState.isLoggedIn = false

    render(<PrimaryLayout microAppId="chat" />)

    expect(screen.queryByLabelText('聊天')).toBeNull()
    expect(screen.queryByLabelText('个人资料')).toBeNull()
    expect(screen.queryByText('打开 聊天')).toBeNull()
  })
})
