import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUseInboxStore = vi.fn()
const mockUseInboxItems = vi.fn()
const mockUseInboxSummary = vi.fn()

vi.mock('../../store', () => ({
  useInboxStore: (selector: (state: unknown) => unknown) => mockUseInboxStore(selector),
}))

vi.mock('../../collections', () => ({
  useInboxItems: () => mockUseInboxItems(),
  useInboxSummary: () => mockUseInboxSummary(),
}))

import { InboxListPane } from '../InboxListPane'

describe('InboxListPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockUseInboxStore.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({
        filter: 'all',
        setFilter: vi.fn(),
        selectedItemId: null,
        selectItem: vi.fn(),
      }))

    mockUseInboxSummary.mockReturnValue({
      total: 2,
      pending: 1,
      audit: 2,
    })
  })

  it('shows resolved auth items as completed instead of pending', () => {
    mockUseInboxItems.mockReturnValue({
      data: [
        {
          id: 'audit:resolved-auth',
          kind: 'audit',
          category: 'auth_required',
          title: '认证请求 · oauth2',
          description: '认证已完成 · https://example.com/auth',
          timestamp: '2026-03-12T12:00:00.000Z',
          status: 'resolved',
        },
      ],
      isLoading: false,
    })

    render(<InboxListPane />)

    expect(screen.getByText('已完成')).toBeInTheDocument()
    expect(screen.queryByText('待认证')).not.toBeInTheDocument()
  })

  it('keeps pending auth items actionable in the list', () => {
    const selectItem = vi.fn()
    mockUseInboxStore.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({
        filter: 'all',
        setFilter: vi.fn(),
        selectedItemId: null,
        selectItem,
      }))

    mockUseInboxItems.mockReturnValue({
      data: [
        {
          id: 'audit:pending-auth',
          kind: 'audit',
          category: 'auth_required',
          title: '认证请求 · oauth2',
          description: '请完成登录',
          timestamp: '2026-03-12T12:00:00.000Z',
          status: 'pending',
        },
      ],
      isLoading: false,
    })

    render(<InboxListPane />)

    expect(screen.getByText('待认证')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /认证请求 · oauth2/i }))

    expect(selectItem).toHaveBeenCalledWith('audit:pending-auth')
  })

  it('shows generic mapped status labels for audit timeline items', () => {
    mockUseInboxItems.mockReturnValue({
      data: [
        {
          id: 'audit:runtime-completed',
          kind: 'audit',
          category: 'audit',
          title: '运行时已完成',
          description: '代码修复 · 工具 codex',
          timestamp: '2026-03-12T12:00:00.000Z',
          status: 'completed',
        },
      ],
      isLoading: false,
    })

    render(<InboxListPane />)

    expect(screen.getByText('已完成')).toBeInTheDocument()
    expect(screen.getByText('运行时已完成')).toBeInTheDocument()
  })
})
