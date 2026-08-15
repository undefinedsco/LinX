import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MessageActionDock } from './MessageActionDock'

const items = [
  { id: 'user-1', role: 'user' as const, content: 'Question', canEdit: true, canRegenerate: true },
  { id: 'assistant-1', role: 'assistant' as const, content: 'Answer', canEdit: false, canRegenerate: false },
]

describe('MessageActionDock', () => {
  it('shows edit and regenerate only for user messages', () => {
    const props = {
      items,
      onSelect: vi.fn(),
      onPreviousMessageBranch: vi.fn(),
      onNextMessageBranch: vi.fn(),
      onPreviousAnswerBranch: vi.fn(),
      onNextAnswerBranch: vi.fn(),
      onEdit: vi.fn(),
      onRegenerate: vi.fn(),
      onQuote: vi.fn(),
      onDelete: vi.fn(),
    }
    const { rerender } = render(<MessageActionDock {...props} selectedItem={items[0]!} />)
    expect(screen.getByRole('button', { name: '编辑消息' })).toBeInTheDocument()
    rerender(<MessageActionDock {...props} selectedItem={items[1]!} />)
    expect(screen.queryByRole('button', { name: '编辑消息' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '引用消息' })).toBeInTheDocument()
  })

  it('forwards selection and actions without owning workflow state', () => {
    const onSelect = vi.fn()
    const onDelete = vi.fn()
    render(<MessageActionDock
      items={items}
      selectedItem={items[1]!}
      onSelect={onSelect}
      onPreviousMessageBranch={vi.fn()}
      onNextMessageBranch={vi.fn()}
      onPreviousAnswerBranch={vi.fn()}
      onNextAnswerBranch={vi.fn()}
      onEdit={vi.fn()}
      onRegenerate={vi.fn()}
      onQuote={vi.fn()}
      onDelete={onDelete}
    />)
    fireEvent.change(screen.getByRole('combobox', { name: '选择要操作的消息' }), { target: { value: 'user-1' } })
    fireEvent.click(screen.getByRole('button', { name: '删除消息' }))
    expect(onSelect).toHaveBeenCalledWith('user-1')
    expect(onDelete).toHaveBeenCalledOnce()
  })
})
