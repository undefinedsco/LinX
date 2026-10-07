import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { StructuredCellWriteProposal, StructuredTableProjection } from '../../domain/structured/structured-table'
import { useStructuredKanbanViewController } from './useStructuredKanbanViewController'

const documentUri = 'https://pod.example/.data/workspaces/state.ttl'
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

describe('useStructuredKanbanViewController', () => {
  it('owns Kanban projection, group labels, overlay state, and dnd drop routing outside the renderer', async () => {
    const onColumnOrderChange = vi.fn()
    const onCommitCellWriteProposal = vi.fn(async (_proposal: StructuredCellWriteProposal) => true)
    const { result } = renderHook(() => useStructuredKanbanViewController({
      documentUri,
      projection,
      groupPredicate: 'status',
      kanbanOrder: {},
      onColumnOrderChange,
      onCommitCellWriteProposal,
    }))

    expect(result.current.hasColumns).toBe(true)
    expect(result.current.groupLabel).toBe('按 status 分组')
    expect(result.current.groupTriggerLabel).toBe('status')
    expect(result.current.hasPredicateOptions).toBe(true)
    expect(result.current.canMoveCardsInColumn('Todo')).toBe(true)
    expect(result.current.predicateOptions).toEqual([
      { predicate: 'status', label: 'status' },
      { predicate: 'schema:name', label: 'name' },
    ])
    expect(result.current.displayColumns.map((column) => column.id)).toEqual(['Todo', 'Done'])
    expect(result.current.displayColumns.map((column) => column.cardCountLabel)).toEqual(['2', '1'])

    const card = result.current.displayColumns[0]!.cards[0]!
    const doneColumn = result.current.displayColumns[1]!

    act(() => result.current.handleDndDragStart({ active: { id: card.subject } }))

    expect(result.current.activeDragCard).toMatchObject({ subject: '#a', title: 'Alpha' })
    act(() => result.current.handleDndDragOver({
      active: { id: card.subject },
      over: { id: doneColumn.id },
    }))
    expect(result.current.activeDropColumnId).toBe('Done')
    expect(result.current.isLaneDropTarget('Done')).toBe(true)
    await act(async () => {
      await result.current.handleDndDragEnd({
        active: { id: '#a' },
        over: { id: doneColumn.id },
      })
    })

    expect(onCommitCellWriteProposal).toHaveBeenCalledWith(expect.objectContaining({
      documentUri,
      subject: '#a',
      predicate: 'status',
      previousValues: ['"Todo"'],
      nextValues: ['"Done"'],
    }))
    expect(result.current.activeDragCard).toBeUndefined()
    expect(result.current.activeDropColumnId).toBeNull()
    expect(result.current.pendingMoveViewForSubject('#a')).toEqual({
      predicate: 'status',
      value: 'Done',
      statusLabel: '待审批',
      label: '待审批：status -> Done',
    })
  })

  it('resolves a card hover to its containing lane and clears drop feedback on cancel', () => {
    const { result } = renderHook(() => useStructuredKanbanViewController({
      documentUri,
      projection,
      groupPredicate: 'status',
      kanbanOrder: {},
      onColumnOrderChange: vi.fn(),
    }))

    act(() => result.current.handleDndDragOver({
      active: { id: '#a' },
      over: { id: '#c' },
    }))
    expect(result.current.activeDropColumnId).toBe('Done')
    expect(result.current.activeDropSubject).toBe('#c')

    act(() => result.current.clearDragState())
    expect(result.current.activeDropColumnId).toBeNull()
    expect(result.current.activeDropSubject).toBeNull()
  })

  it('routes same-column DnD drops to column ordering without creating cell writes', async () => {
    const onColumnOrderChange = vi.fn()
    const onCommitCellWriteProposal = vi.fn()
    const { result } = renderHook(() => useStructuredKanbanViewController({
      documentUri,
      projection,
      groupPredicate: 'status',
      kanbanOrder: {},
      onColumnOrderChange,
      onCommitCellWriteProposal,
    }))

    await act(async () => {
      await result.current.handleDndDragEnd({
        active: { id: '#b' },
        over: { id: '#a' },
      })
    })

    expect(onColumnOrderChange).toHaveBeenCalledWith('Todo', ['#b', '#a'])
    expect(onCommitCellWriteProposal).not.toHaveBeenCalled()
  })

  it('persists a cross-column drop before the hovered target card', async () => {
    const onColumnOrderChange = vi.fn()
    const onCommitCellWriteProposal = vi.fn(async () => true)
    const { result } = renderHook(() => useStructuredKanbanViewController({
      documentUri,
      projection,
      groupPredicate: 'status',
      kanbanOrder: {},
      onColumnOrderChange,
      onCommitCellWriteProposal,
    }))

    await act(async () => {
      await result.current.handleDndDragEnd({
        active: { id: '#a' },
        over: { id: '#c' },
      })
    })

    expect(onColumnOrderChange).toHaveBeenCalledWith('Done', ['#a', '#c'])
  })

  it('moves cards with keyboard commands through the same reorder and proposal paths', async () => {
    const onColumnOrderChange = vi.fn()
    const onCommitCellWriteProposal = vi.fn(async () => true)
    const { result } = renderHook(() => useStructuredKanbanViewController({
      documentUri,
      projection,
      groupPredicate: 'status',
      kanbanOrder: {},
      onColumnOrderChange,
      onCommitCellWriteProposal,
    }))

    await act(async () => {
      await result.current.moveCardByKeyboard('#b', 'up')
    })
    expect(onColumnOrderChange).toHaveBeenCalledWith('Todo', ['#b', '#a'])

    await act(async () => {
      await result.current.moveCardByKeyboard('#c', 'left')
    })
    expect(onCommitCellWriteProposal).toHaveBeenCalledWith(expect.objectContaining({
      subject: '#c',
      predicate: 'status',
      previousValues: ['"Done"'],
      nextValues: ['"Todo"'],
    }))
  })

  it('projects group predicate menu visibility instead of leaving raw projection checks in the renderer', () => {
    const { result } = renderHook(() => useStructuredKanbanViewController({
      documentUri,
      projection: {
        predicates: [],
        rows: [],
      },
      groupPredicate: null,
      kanbanOrder: {},
      onColumnOrderChange: vi.fn(),
    }))

    expect(result.current.hasPredicateOptions).toBe(false)
    expect(result.current.predicateOptions).toEqual([])
  })

  it('projects per-column card move menu availability', () => {
    const { result, rerender } = renderHook(
      ({ onCommitCellWriteProposal }) => useStructuredKanbanViewController({
        documentUri,
        projection,
        groupPredicate: 'status',
        kanbanOrder: {},
        onColumnOrderChange: vi.fn(),
        onCommitCellWriteProposal,
      }),
      { initialProps: { onCommitCellWriteProposal: undefined as undefined | ((proposal: StructuredCellWriteProposal) => boolean) } },
    )

    expect(result.current.moveTargetColumnsFor('Todo')).toEqual([])
    expect(result.current.canMoveCardsInColumn('Todo')).toBe(false)

    rerender({ onCommitCellWriteProposal: () => true })

    expect(result.current.moveTargetColumnsFor('Todo').map((column) => column.id)).toEqual(['Done'])
    expect(result.current.canMoveCardsInColumn('Todo')).toBe(true)
  })

  it('tracks lane collapse locally for lane chrome', () => {
    const { result } = renderHook(() => useStructuredKanbanViewController({
      documentUri,
      projection,
      groupPredicate: 'status',
      kanbanOrder: {},
      onColumnOrderChange: vi.fn(),
    }))

    expect(result.current.collapsedLaneIds).toEqual([])
    expect(result.current.isLaneCollapsed('Todo')).toBe(false)

    act(() => result.current.toggleLaneCollapsed('Todo'))

    expect(result.current.collapsedLaneIds).toEqual(['Todo'])
    expect(result.current.isLaneCollapsed('Todo')).toBe(true)

    act(() => result.current.toggleLaneCollapsed('Todo'))

    expect(result.current.collapsedLaneIds).toEqual([])
    expect(result.current.isLaneCollapsed('Todo')).toBe(false)
  })

  it('hydrates collapsed lanes and publishes the full next collapsed lane state on toggle', () => {
    const onCollapsedLaneIdsChange = vi.fn()
    const { result } = renderHook(() => useStructuredKanbanViewController({
      documentUri,
      projection,
      groupPredicate: 'status',
      kanbanOrder: {},
      initialCollapsedLaneIds: ['Done'],
      onColumnOrderChange: vi.fn(),
      onCollapsedLaneIdsChange,
    }))

    expect(result.current.collapsedLaneIds).toEqual(['Done'])
    expect(result.current.isLaneCollapsed('Done')).toBe(true)

    act(() => result.current.toggleLaneCollapsed('Todo'))

    expect(result.current.collapsedLaneIds).toEqual(['Done', 'Todo'])
    expect(onCollapsedLaneIdsChange).toHaveBeenCalledWith(['Done', 'Todo'])

    act(() => result.current.toggleLaneCollapsed('Done'))

    expect(result.current.collapsedLaneIds).toEqual(['Todo'])
    expect(onCollapsedLaneIdsChange).toHaveBeenLastCalledWith(['Todo'])
  })

  it('applies collapsed lane metadata that hydrates after the first render', () => {
    const common = {
      documentUri,
      projection,
      groupPredicate: 'status',
      kanbanOrder: {},
      onColumnOrderChange: vi.fn(),
    }
    const { result, rerender } = renderHook(
      ({ collapsed }: { collapsed: string[] }) => useStructuredKanbanViewController({
        ...common,
        initialCollapsedLaneIds: collapsed,
      }),
      { initialProps: { collapsed: [] } },
    )

    rerender({ collapsed: ['Done'] })

    expect(result.current.isLaneCollapsed('Done')).toBe(true)
  })

  it('orders displayed lanes by persisted lane order and publishes the reconciled live lane order', () => {
    const onLaneOrderChange = vi.fn()
    const { result, rerender } = renderHook(() => useStructuredKanbanViewController({
      documentUri,
      projection,
      groupPredicate: 'status',
      kanbanOrder: {},
      laneOrder: ['Done'],
      onColumnOrderChange: vi.fn(),
      onLaneOrderChange,
    }))

    expect(result.current.displayColumns.map((column) => column.id)).toEqual(['Done', 'Todo'])
    expect(onLaneOrderChange).toHaveBeenCalledWith(['Done', 'Todo'])

    rerender()
    expect(onLaneOrderChange).toHaveBeenCalledTimes(1)
  })

  it('persists mouse lane reordering from lane DnD drops without touching card order or cell writes', async () => {
    const onColumnOrderChange = vi.fn()
    const onLaneOrderChange = vi.fn()
    const onCommitCellWriteProposal = vi.fn()
    const { result } = renderHook(() => useStructuredKanbanViewController({
      documentUri,
      projection,
      groupPredicate: 'status',
      kanbanOrder: {},
      onColumnOrderChange,
      onLaneOrderChange,
      onCommitCellWriteProposal,
    }))

    await act(async () => {
      await result.current.handleDndDragEnd({
        active: { id: 'lane:Done' },
        over: { id: 'lane:Todo' },
      })
    })

    expect(onLaneOrderChange).toHaveBeenCalledWith(['Done', 'Todo'])
    expect(onColumnOrderChange).not.toHaveBeenCalled()
    expect(onCommitCellWriteProposal).not.toHaveBeenCalled()
  })

  it('persists keyboard lane reordering against the current displayed lane order', () => {
    const onLaneOrderChange = vi.fn()
    const { result } = renderHook(() => useStructuredKanbanViewController({
      documentUri,
      projection,
      groupPredicate: 'status',
      kanbanOrder: {},
      onColumnOrderChange: vi.fn(),
      onLaneOrderChange,
    }))

    act(() => result.current.reorderLaneByKeyboard('Done', 'left'))

    expect(onLaneOrderChange).toHaveBeenCalledWith(['Done', 'Todo'])
  })

  it('routes lane quick-create through the parent subject approval command', async () => {
    const onCreateSubject = vi.fn(async () => true)
    const { result } = renderHook(() => useStructuredKanbanViewController({
      documentUri,
      projection,
      groupPredicate: 'status',
      kanbanOrder: {},
      onColumnOrderChange: vi.fn(),
      onCreateSubject,
    }))

    await act(async () => {
      await result.current.quickCreateSubject('Todo', '#delta')
    })

    expect(onCreateSubject).toHaveBeenCalledWith({
      columnId: 'Todo',
      columnValue: '"Todo"',
      subject: '#delta',
    })
  })

  it('owns the selected Kanban card subject for renderer visual state', () => {
    const { result } = renderHook(() => useStructuredKanbanViewController({
      documentUri,
      projection,
      groupPredicate: 'status',
      kanbanOrder: {},
      onColumnOrderChange: vi.fn(),
    }))

    expect(result.current.selectedCardSubject).toBeNull()
    expect(result.current.isCardSelected('#a')).toBe(false)

    act(() => result.current.selectCard('#a'))

    expect(result.current.selectedCardSubject).toBe('#a')
    expect(result.current.isCardSelected('#a')).toBe(true)
    expect(result.current.isCardSelected('#b')).toBe(false)
  })

  it('supports additive selection and moves the selected cards as one batch', async () => {
    const onCommitCellWriteProposal = vi.fn(async () => true)
    const { result } = renderHook(() => useStructuredKanbanViewController({
      documentUri,
      projection,
      groupPredicate: 'status',
      kanbanOrder: {},
      onColumnOrderChange: vi.fn(),
      onCommitCellWriteProposal,
    }))

    act(() => result.current.selectCard('#a'))
    act(() => result.current.selectCard('#b', { extend: true }))

    expect(result.current.selectedCardSubjects).toEqual(['#a', '#b'])
    expect(result.current.selectedCardCount).toBe(2)

    await act(async () => {
      await result.current.moveSelectionToColumn('#a', result.current.displayColumns[1]!)
    })

    expect(onCommitCellWriteProposal).toHaveBeenCalledTimes(2)
    expect(onCommitCellWriteProposal).toHaveBeenNthCalledWith(1, expect.objectContaining({ subject: '#a', nextValues: ['"Done"'] }))
    expect(onCommitCellWriteProposal).toHaveBeenNthCalledWith(2, expect.objectContaining({ subject: '#b', nextValues: ['"Done"'] }))
  })
})
