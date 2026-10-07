import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockNavigate = vi.fn()
const mockUseInboxSummary = vi.fn()
const mockSetFilter = vi.fn()
const mockSelectItem = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../data/collections', () => ({
  useInboxSummary: () => mockUseInboxSummary(),
}))

vi.mock('../app/store', () => ({
  useInboxStore: (selector: (state: unknown) => unknown) => selector({
    setFilter: mockSetFilter,
    selectItem: mockSelectItem,
  }),
}))

import { InboxBellButton } from './InboxBellButton'

describe('InboxBellButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseInboxSummary.mockReturnValue({
      total: 5,
      pending: 2,
      audit: 3,
    })
  })

  it('shows pending count and opens pending inbox by default', () => {
    render(<InboxBellButton />)

    expect(screen.getByText('2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '收件箱快捷入口' }))
    fireEvent.click(screen.getByRole('button', { name: '处理待办' }))

    expect(mockSetFilter).toHaveBeenCalledWith('pending')
    expect(mockSelectItem).toHaveBeenCalledWith(null)
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/$microAppId',
      params: { microAppId: 'inbox' },
    })
  })

  it('opens audit view when selecting audit shortcut', () => {
    render(<InboxBellButton />)

    fireEvent.click(screen.getByRole('button', { name: '收件箱快捷入口' }))
    fireEvent.click(screen.getByRole('button', { name: '查看审计' }))

    expect(mockSetFilter).toHaveBeenCalledWith('audit')
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/$microAppId',
      params: { microAppId: 'inbox' },
    })
  })
})
