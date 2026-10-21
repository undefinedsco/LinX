import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StructuredKanbanLane } from './StructuredKanbanLane'

describe('StructuredKanbanLane', () => {
  it('renders stable expanded and collapsed lane chrome with quick create affordance', () => {
    const { rerender } = render(
      <StructuredKanbanLane
        column={{
          id: 'todo',
          label: 'Todo',
          value: '"Todo"',
          ariaLabel: '看板列 Todo',
          cardCountLabel: '2',
          cardSubjects: ['a', 'b'],
          cards: [],
        }}
        collapsed={false}
        isDropTarget={false}
        onToggleCollapsed={vi.fn()}
        onQuickCreate={vi.fn()}
      >
        <div>Card body</div>
      </StructuredKanbanLane>,
    )

    expect(screen.getByLabelText('看板列 Todo')).toHaveAttribute('data-lane-width', '288')
    expect(screen.getByText('Card body')).toBeVisible()
    expect(screen.getByRole('button', { name: '添加卡片到 Todo' })).toBeVisible()

    rerender(
      <StructuredKanbanLane
        column={{
          id: 'todo',
          label: 'Todo',
          value: '"Todo"',
          ariaLabel: '看板列 Todo',
          cardCountLabel: '2',
          cardSubjects: ['a', 'b'],
          cards: [],
        }}
        collapsed
        isDropTarget={false}
        onToggleCollapsed={vi.fn()}
        onQuickCreate={vi.fn()}
      >
        <div>Card body</div>
      </StructuredKanbanLane>,
    )

    expect(screen.getByLabelText('看板列 Todo')).toHaveAttribute('data-lane-width', '56')
    expect(screen.queryByText('Card body')).not.toBeInTheDocument()
  })

  it('commits quick create on Enter and cancels on Escape', async () => {
    const onQuickCreate = vi.fn()
    render(
      <StructuredKanbanLane
        column={{
          id: 'done',
          label: 'Done',
          value: '"Done"',
          ariaLabel: '看板列 Done',
          cardCountLabel: '0',
          cardSubjects: [],
          cards: [],
        }}
        collapsed={false}
        isDropTarget={false}
        onToggleCollapsed={vi.fn()}
        onQuickCreate={onQuickCreate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '添加卡片到 Done' }))
    const input = screen.getByRole('textbox', { name: 'Done 里新卡片的标题' })
    fireEvent.change(input, { target: { value: 'New subject' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onQuickCreate).toHaveBeenCalledWith('done', 'New subject')

    await waitFor(() => expect(screen.getByRole('button', { name: '添加卡片到 Done' })).toBeVisible())
    fireEvent.click(screen.getByRole('button', { name: '添加卡片到 Done' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Done 里新卡片的标题' }), { key: 'Escape' })

    expect(screen.queryByRole('textbox', { name: 'Done 里新卡片的标题' })).not.toBeInTheDocument()
  })

  it('keeps the quick-create draft visible when creation fails', async () => {
    render(
      <StructuredKanbanLane
        column={{
          id: 'todo',
          label: 'Todo',
          value: '"Todo"',
          ariaLabel: '看板列 Todo',
          cardCountLabel: '0',
          cardSubjects: [],
          cards: [],
        }}
        collapsed={false}
        isDropTarget={false}
        onToggleCollapsed={vi.fn()}
        onQuickCreate={vi.fn(async () => false)}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '添加卡片到 Todo' }))
    const input = screen.getByRole('textbox', { name: 'Todo 里新卡片的标题' })
    fireEvent.change(input, { target: { value: 'Keep me' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(screen.getByText('创建失败，请重试')).toBeVisible())
    expect(screen.getByRole('textbox', { name: 'Todo 里新卡片的标题' })).toHaveValue('Keep me')
  })

  it('shows an explicit insertion marker while a card is over the lane', () => {
    render(
      <StructuredKanbanLane
        column={{
          id: 'todo',
          label: 'Todo',
          value: '"Todo"',
          ariaLabel: '看板列 Todo',
          cardCountLabel: '1',
          cardSubjects: ['#a'],
          cards: [],
        }}
        collapsed={false}
        isDropTarget
        onToggleCollapsed={vi.fn()}
      >
        <div>Card body</div>
      </StructuredKanbanLane>,
    )

    expect(screen.getByLabelText('将卡片放入 Todo')).toBeVisible()
    expect(screen.getByLabelText('看板列 Todo')).toHaveAttribute('data-drop-target', 'true')
  })
})
