import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockNavigate = vi.fn()
const mockUseInboxSummary = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/providers/solid-session-provider', () => ({
  useSession: () => ({
    session: {
      info: {
        isLoggedIn: false,
      },
    },
    sessionRequestInProgress: false,
  }),
}))

vi.mock('@/modules/inbox/collections', () => ({
  useInboxSummary: () => mockUseInboxSummary(),
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
  })

  it('shows pending badge on inbox nav when approvals are waiting', () => {
    mockUseInboxSummary.mockReturnValue({
      total: 5,
      pending: 3,
      audit: 2,
    })

    render(<PrimaryLayout microAppId="chat" />)

    expect(screen.getByLabelText('收件箱，3 条待处理')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('keeps inbox nav label plain when there is no pending approval', () => {
    mockUseInboxSummary.mockReturnValue({
      total: 0,
      pending: 0,
      audit: 0,
    })

    render(<PrimaryLayout microAppId="chat" />)

    expect(screen.getByLabelText('收件箱')).toBeTruthy()
    expect(screen.queryByText('99+')).toBeNull()
  })
})
