import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  selectedIndex: -1,
  onItemKeyDown: vi.fn(),
  registerItemRef: vi.fn(),
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

  it('draws each contact separator from the text column instead of through the avatar', () => {
    render(<ContactList {...baseProps} />)

    const separator = screen.getByRole('option', { name: /Alice/ }).querySelector('[aria-hidden="true"]')
    expect(separator).toHaveClass('left-16', 'h-px', 'bg-border/70')
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

  it('keeps contact type filtering out of the compact list header', () => {
    render(<ContactList {...baseProps} />)

    expect(screen.queryByText('个人')).not.toBeInTheDocument()
  })

  it('uses the shared 48px list toolbar geometry', () => {
    render(<ContactList {...baseProps} />)

    const toolbar = screen.getByPlaceholderText('搜索联系人').parentElement?.parentElement
    expect(toolbar).toHaveClass('h-12')
    expect(screen.getByPlaceholderText('搜索联系人')).toHaveClass('h-7')
    expect(screen.getByRole('button', { name: '添加联系人' })).toHaveClass('h-7', 'w-7')
    expect(toolbar).toHaveClass('border-b', 'border-border')
  })

  it('opens a create dialog only after its originating menu has closed', async () => {
    const onCreate = vi.fn()
    render(<ContactList {...baseProps} onCreate={onCreate} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '添加联系人' }))
    fireEvent.click(await screen.findByText('新建助手'))

    expect(onCreate).not.toHaveBeenCalled()
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('agent'))
  })
})
