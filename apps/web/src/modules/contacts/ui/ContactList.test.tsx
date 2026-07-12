import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UnifiedContact } from '../domain/types'
import { ContactList } from './ContactList'

const alice = {
  id: 'alice',
  name: 'Alice',
  displayName: 'Alice',
  displayAvatar: '',
  initial: 'A',
  sourceType: 'solid',
  contactType: 'solid',
} as UnifiedContact

const baseProps = {
  search: '',
  onSearchChange: vi.fn(),
  filter: 'all' as const,
  onFilterChange: vi.fn(),
  selectedId: null,
  sections: [{ key: 'contacts' as const, title: 'A', items: [alice] }],
  letters: ['A'],
  isLoading: false,
  error: null,
  onRetry: vi.fn(),
  onSelect: vi.fn(),
  onCreate: vi.fn(),
}

describe('ContactList', () => {
  it('uses keyboard-reachable option semantics for contact rows', () => {
    const onSelect = vi.fn()
    render(<ContactList {...baseProps} selectedId="alice" onSelect={onSelect} />)

    const option = screen.getByRole('option', { name: /Alice/ })
    expect(option.tagName).toBe('BUTTON')
    expect(option).toHaveAttribute('aria-selected', 'true')
    option.focus()
    expect(option).toHaveFocus()
    fireEvent.click(option)
    expect(onSelect).toHaveBeenCalledWith('alice')
  })

  it('renders query failures instead of the empty state and exposes retry', () => {
    const onRetry = vi.fn()
    render(
      <ContactList
        {...baseProps}
        sections={[]}
        letters={[]}
        error="联系人加载失败"
        onRetry={onRetry}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('联系人加载失败')
    expect(screen.queryByText('暂无联系人')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
