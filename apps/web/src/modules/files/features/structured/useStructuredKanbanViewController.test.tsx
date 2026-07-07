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

function dragEvent(subject = '') {
  const transfer = new Map<string, string>()
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    currentTarget: { contains: vi.fn(() => false) },
    relatedTarget: null,
    dataTransfer: {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn((key: string, value: string) => transfer.set(key, value)),
      getData: vi.fn((key: string) => transfer.get(key) ?? subject),
    },
  }
}

describe('useStructuredKanbanViewController', () => {
  it('owns Kanban projection, group labels, native drag state, and drop routing outside the renderer', async () => {
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
    const startEvent = dragEvent()

    act(() => result.current.handleCardDragStart(startEvent as never, card))

    expect(startEvent.dataTransfer.effectAllowed).toBe('move')
    expect(startEvent.dataTransfer.setData).toHaveBeenCalledWith('text/plain', '#a')

    const overEvent = dragEvent()
    act(() => result.current.handleColumnDragOver(overEvent as never, doneColumn))

    expect(overEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(overEvent.dataTransfer.dropEffect).toBe('move')
    expect(result.current.isColumnNativeDragOver(doneColumn.id)).toBe(true)

    await act(async () => {
      await result.current.handleColumnDrop(dragEvent('#a') as never, doneColumn)
    })

    expect(onCommitCellWriteProposal).toHaveBeenCalledWith(expect.objectContaining({
      documentUri,
      subject: '#a',
      predicate: 'status',
      previousValues: ['"Todo"'],
      nextValues: ['"Done"'],
    }))
    expect(result.current.isColumnNativeDragOver(doneColumn.id)).toBe(false)
    expect(result.current.pendingMoveViewForSubject('#a')).toEqual({
      predicate: 'status',
      value: 'Done',
      statusLabel: '待审批',
      label: '待审批：status -> Done',
    })
  })

  it('routes same-column DnD drops to column ordering without creating cell writes', () => {
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

    act(() => result.current.handleDndDragEnd({
      active: { id: '#b' },
      over: { id: '#a' },
    }))

    expect(onColumnOrderChange).toHaveBeenCalledWith('Todo', ['#b', '#a'])
    expect(onCommitCellWriteProposal).not.toHaveBeenCalled()
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
})
