import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StructuredTableProjection } from '../../domain/structured/structured-table'
import { StructuredKanbanView } from './StructuredKanbanView'

const projection: StructuredTableProjection = {
  predicates: ['status', 'schema:name'],
  rows: [
    {
      subject: '#a',
      cells: [
        { predicate: 'status', values: ['"Todo"'] },
        { predicate: 'schema:name', values: ['"Alpha"'] },
      ],
    },
    {
      subject: '#b',
      cells: [
        { predicate: 'status', values: ['"Done"'] },
        { predicate: 'schema:name', values: ['"Beta"'] },
      ],
    },
  ],
}

describe('StructuredKanbanView', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('renders a horizontal lane strip with resource-backed cards', () => {
    const { container } = render(
      <StructuredKanbanView
        documentUri="https://pod.example/tasks.ttl"
        projection={projection}
        groupPredicate="status"
        kanbanOrder={{}}
        onGroupPredicateChange={vi.fn()}
        onColumnOrderChange={vi.fn()}
        onCommitCellWriteProposal={vi.fn()}
        onCreateSubject={vi.fn(async () => true)}
        onOpenSubject={vi.fn()}
      />,
    )

    expect(container.querySelector('[data-kanban-board="horizontal"]')).toBeInTheDocument()
    expect(screen.getByLabelText('Kanban column Todo')).toHaveAttribute('data-lane-width', '288')
    expect(screen.getByText('Alpha')).toBeVisible()
    expect(screen.getByRole('button', { name: '添加 Subject 到 Todo' })).toBeVisible()
  })

  it('applies persisted chrome state and reports settled horizontal scroll', () => {
    vi.useFakeTimers()
    const onHorizontalScrollLeftChange = vi.fn()
    const { container } = render(
      <StructuredKanbanView
        documentUri="https://pod.example/tasks.ttl"
        projection={projection}
        groupPredicate="status"
        kanbanOrder={{}}
        laneOrder={['Done']}
        initialCollapsedLaneIds={['Done']}
        initialScrollLeft={180}
        onGroupPredicateChange={vi.fn()}
        onColumnOrderChange={vi.fn()}
        onCommitCellWriteProposal={vi.fn()}
        onHorizontalScrollLeftChange={onHorizontalScrollLeftChange}
      />,
    )
    const board = container.querySelector('[data-kanban-board="horizontal"]') as HTMLDivElement

    expect(screen.getByLabelText('Kanban column Done')).toHaveAttribute('data-lane-collapsed', 'true')
    expect(screen.getAllByLabelText(/^Kanban column /).map((lane) => lane.getAttribute('data-kanban-column'))).toEqual(['Done', 'Todo'])
    expect(board.scrollLeft).toBe(180)

    board.scrollLeft = 240
    fireEvent.scroll(board)

    expect(onHorizontalScrollLeftChange).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(160)
    })

    expect(onHorizontalScrollLeftChange).toHaveBeenCalledWith(240)
  })

  it('renders compact lane reorder handles and persists keyboard lane order changes', () => {
    const onLaneOrderChange = vi.fn()
    render(
      <StructuredKanbanView
        documentUri="https://pod.example/tasks.ttl"
        projection={projection}
        groupPredicate="status"
        kanbanOrder={{}}
        onGroupPredicateChange={vi.fn()}
        onColumnOrderChange={vi.fn()}
        onLaneOrderChange={onLaneOrderChange}
        onCommitCellWriteProposal={vi.fn()}
      />,
    )

    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder lane Done' }), { key: 'ArrowLeft' })

    expect(onLaneOrderChange).toHaveBeenCalledWith(['Done', 'Todo'])
  })

  it('selects cards on click or Space without opening and opens explicitly on double click or Enter', () => {
    const onOpenSubject = vi.fn()
    render(
      <StructuredKanbanView
        documentUri="https://pod.example/tasks.ttl"
        projection={projection}
        groupPredicate="status"
        kanbanOrder={{}}
        onGroupPredicateChange={vi.fn()}
        onColumnOrderChange={vi.fn()}
        onCommitCellWriteProposal={vi.fn()}
        onOpenSubject={onOpenSubject}
      />,
    )

    const alphaCard = screen.getByRole('button', { name: 'Alpha' })
    const betaCard = screen.getByRole('button', { name: 'Beta' })

    fireEvent.click(alphaCard)

    expect(onOpenSubject).not.toHaveBeenCalled()
    expect(alphaCard).toHaveAttribute('aria-pressed', 'true')
    expect(betaCard).toHaveAttribute('aria-pressed', 'false')

    fireEvent.keyDown(betaCard, { key: ' ' })

    expect(onOpenSubject).not.toHaveBeenCalled()
    expect(alphaCard).toHaveAttribute('aria-pressed', 'false')
    expect(betaCard).toHaveAttribute('aria-pressed', 'true')

    fireEvent.doubleClick(betaCard)
    fireEvent.keyDown(betaCard, { key: 'Enter' })

    expect(onOpenSubject).toHaveBeenCalledTimes(2)
    expect(onOpenSubject).toHaveBeenNthCalledWith(1, '#b', { navigate: true })
    expect(onOpenSubject).toHaveBeenNthCalledWith(2, '#b', { navigate: false })
  })

  it('extends card selection with Shift without opening either card', () => {
    const onOpenSubject = vi.fn()
    render(
      <StructuredKanbanView
        documentUri="https://pod.example/tasks.ttl"
        projection={projection}
        groupPredicate="status"
        kanbanOrder={{}}
        onGroupPredicateChange={vi.fn()}
        onColumnOrderChange={vi.fn()}
        onCommitCellWriteProposal={vi.fn()}
        onOpenSubject={onOpenSubject}
      />,
    )

    const alphaCard = screen.getByRole('button', { name: 'Alpha' })
    const betaCard = screen.getByRole('button', { name: 'Beta' })
    fireEvent.click(alphaCard)
    fireEvent.click(betaCard, { shiftKey: true })

    expect(alphaCard).toHaveAttribute('aria-pressed', 'true')
    expect(betaCard).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('已选 2')).toBeVisible()
    expect(onOpenSubject).not.toHaveBeenCalled()
  })

  it('supports Alt plus arrow card movement without requiring pointer coordinates', async () => {
    const onColumnOrderChange = vi.fn()
    const onCommitCellWriteProposal = vi.fn(async () => true)
    render(
      <StructuredKanbanView
        documentUri="https://pod.example/tasks.ttl"
        projection={projection}
        groupPredicate="status"
        kanbanOrder={{}}
        onGroupPredicateChange={vi.fn()}
        onColumnOrderChange={onColumnOrderChange}
        onCommitCellWriteProposal={onCommitCellWriteProposal}
      />,
    )

    fireEvent.keyDown(screen.getByRole('button', { name: 'Beta' }), { key: 'ArrowLeft', altKey: true })

    await waitFor(() => {
      expect(onCommitCellWriteProposal).toHaveBeenCalledWith(expect.objectContaining({
        subject: '#b',
        nextValues: ['"Todo"'],
      }))
    })
    expect(onColumnOrderChange).not.toHaveBeenCalled()
  })

  it('exposes card movement commands in the move menu for no-coordinate workflows', async () => {
    const onColumnOrderChange = vi.fn()
    const onCommitCellWriteProposal = vi.fn(async () => true)
    const reorderProjection: StructuredTableProjection = {
      predicates: ['status', 'schema:name'],
      rows: [
        {
          subject: '#a',
          cells: [
            { predicate: 'status', values: ['"Todo"'] },
            { predicate: 'schema:name', values: ['"Alpha"'] },
          ],
        },
        {
          subject: '#b',
          cells: [
            { predicate: 'status', values: ['"Todo"'] },
            { predicate: 'schema:name', values: ['"Beta"'] },
          ],
        },
        {
          subject: '#c',
          cells: [
            { predicate: 'status', values: ['"Done"'] },
            { predicate: 'schema:name', values: ['"Gamma"'] },
          ],
        },
      ],
    }
    render(
      <StructuredKanbanView
        documentUri="https://pod.example/tasks.ttl"
        projection={reorderProjection}
        groupPredicate="status"
        kanbanOrder={{}}
        onGroupPredicateChange={vi.fn()}
        onColumnOrderChange={onColumnOrderChange}
        onCommitCellWriteProposal={onCommitCellWriteProposal}
      />,
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move #a' }), {
      button: 0,
      ctrlKey: false,
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: '下移' }))

    await waitFor(() => {
      expect(onColumnOrderChange).toHaveBeenCalledWith('Todo', ['#b', '#a'])
    })
    expect(onCommitCellWriteProposal).not.toHaveBeenCalled()
  })

  it('keeps group selection and subject creation reachable on an empty board', async () => {
    const onCreateSubject = vi.fn(async () => true)
    render(
      <StructuredKanbanView
        documentUri="https://pod.example/tasks.ttl"
        projection={{ predicates: ['status'], rows: [] }}
        groupPredicate="status"
        kanbanOrder={{}}
        onGroupPredicateChange={vi.fn()}
        onColumnOrderChange={vi.fn()}
        onCreateSubject={onCreateSubject}
      />,
    )

    expect(screen.getByRole('button', { name: 'Kanban 分组 predicate' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '添加 Subject 到 Unassigned' }))
    const input = screen.getByRole('textbox', { name: 'Subject title for Unassigned' })
    fireEvent.change(input, { target: { value: '#first' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(onCreateSubject).toHaveBeenCalledWith({
        columnId: 'unassigned',
        columnValue: null,
        subject: '#first',
      })
    })
  })

})
