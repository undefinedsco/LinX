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
  entry: null,
  groupCount: 2,
  onOpenEntry: vi.fn(),
  selectedId: null,
  sections: [{ key: 'letter' as const, title: 'A', items: [alice] }],
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
    expect(separator).toHaveClass('left-[58px]', 'h-px', 'bg-border/70')
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

  it('puts 新的朋友 and 群聊 above the list and opens them', () => {
    const onOpenEntry = vi.fn()
    render(<ContactList {...baseProps} onOpenEntry={onOpenEntry} entry="groups" />)

    fireEvent.click(screen.getByRole('button', { name: /新的朋友/ }))
    expect(onOpenEntry).toHaveBeenCalledWith('new-friends')
    expect(screen.getByRole('button', { name: /群聊/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: /群聊/ })).toHaveTextContent('2')
  })

  it('hides the entries while searching', () => {
    render(<ContactList {...baseProps} search="al" />)

    expect(screen.queryByRole('button', { name: /新的朋友/ })).not.toBeInTheDocument()
  })

  it('shows assistants in the same list, told apart only by an AI avatar', () => {
    const helper = { ...alice, id: 'helper', name: '活动小助手', displayName: '活动小助手', sourceType: 'agent' } as UnifiedContact
    render(<ContactList {...baseProps} sections={[{ key: 'letter', title: 'A', items: [alice, helper] }]} />)

    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(screen.getAllByTestId('assistant-avatar')).toHaveLength(1)
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
    expect(screen.getByRole('button', { name: '添加朋友、创建助手' })).toHaveClass('h-7', 'w-7')
    expect(toolbar).toHaveClass('border-b', 'border-border')
  })

  it('opens a create dialog only after its originating menu has closed', async () => {
    const onCreate = vi.fn()
    render(<ContactList {...baseProps} onCreate={onCreate} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '添加朋友、创建助手' }))
    fireEvent.click(await screen.findByText('创建助手'))

    expect(onCreate).not.toHaveBeenCalled()
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('agent'))
  })
})
