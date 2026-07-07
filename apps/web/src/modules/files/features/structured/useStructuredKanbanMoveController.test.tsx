import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { StructuredCardProjection, StructuredKanbanColumn } from '../../domain/structured/structured-projections'
import { useStructuredKanbanMoveController } from './useStructuredKanbanMoveController'

const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
const cardA: StructuredCardProjection = {
  subject: '#a',
  title: 'Alpha',
  className: 'udfs:Task',
  summary: '',
  tags: [],
}
const cardB: StructuredCardProjection = {
  subject: '#b',
  title: 'Beta',
  className: 'udfs:Task',
  summary: '',
  tags: [],
}
const todoColumn: StructuredKanbanColumn = {
  id: 'todo',
  label: 'Todo',
  value: '"Todo"',
  cards: [cardA, cardB],
}
const doneColumn: StructuredKanbanColumn = {
  id: 'done',
  label: 'Done',
  value: '"Done"',
  cards: [],
}

describe('useStructuredKanbanMoveController', () => {
  it('owns pending cross-column move staging, approval state, rollback, and same-column ordering outside the Kanban renderer', async () => {
    const onColumnOrderChange = vi.fn()
    const onCommitCellWriteProposal = vi.fn(async () => true)
    const { result } = renderHook(() => useStructuredKanbanMoveController({
      documentUri,
      groupPredicate: 'status',
      columns: [todoColumn, doneColumn],
      projectionRows: [
        { subject: '#a', cells: [{ predicate: 'status', values: ['"Todo"'] }] },
        { subject: '#b', cells: [{ predicate: 'status', values: ['"Todo"'] }] },
      ],
      onColumnOrderChange,
      onCommitCellWriteProposal,
    }))

    expect(result.current.displayColumns[0]?.cards.map((card) => card.subject)).toEqual(['#a', '#b'])
    expect(result.current.displayColumns[1]?.cards.map((card) => card.subject)).toEqual([])

    await act(async () => {
      await result.current.commitKanbanMove(cardA, doneColumn)
    })

    expect(onCommitCellWriteProposal).toHaveBeenCalledWith(expect.objectContaining({
      documentUri,
      subject: '#a',
      predicate: 'status',
      previousValues: ['"Todo"'],
      nextValues: ['"Done"'],
    }))
    expect(result.current.pendingMoveForSubject('#a')).toEqual({
      columnId: 'done',
      columnLabel: 'Done',
      predicate: 'status',
      status: 'approval-staged',
    })
    expect(result.current.displayColumns[0]?.cards.map((card) => card.subject)).toEqual(['#b'])
    expect(result.current.displayColumns[1]?.cards.map((card) => card.subject)).toEqual(['#a'])

    act(() => result.current.reorderColumnSubjects('todo', '#b', '#a'))
    expect(onColumnOrderChange).not.toHaveBeenCalled()

    act(() => result.current.reorderColumnSubjects('done', '#a', '#a'))
    expect(onColumnOrderChange).not.toHaveBeenCalled()
  })

  it('rolls back the pending overlay when the move proposal is rejected', async () => {
    const onCommitCellWriteProposal = vi.fn(async () => false)
    const { result } = renderHook(() => useStructuredKanbanMoveController({
      documentUri,
      groupPredicate: 'status',
      columns: [todoColumn, doneColumn],
      projectionRows: [
        { subject: '#a', cells: [{ predicate: 'status', values: ['"Todo"'] }] },
      ],
      onColumnOrderChange: vi.fn(),
      onCommitCellWriteProposal,
    }))

    await act(async () => {
      await result.current.commitKanbanMove(cardA, doneColumn)
    })

    expect(result.current.pendingMoveForSubject('#a')).toBeUndefined()
    expect(result.current.displayColumns[0]?.cards.map((card) => card.subject)).toEqual(['#a', '#b'])
    expect(result.current.displayColumns[1]?.cards.map((card) => card.subject)).toEqual([])
  })

  it('projects pending move display labels in the move workflow owner', async () => {
    const onCommitCellWriteProposal = vi.fn(async () => true)
    const { result } = renderHook(() => useStructuredKanbanMoveController({
      documentUri,
      groupPredicate: 'https://schema.org/status',
      columns: [todoColumn, doneColumn],
      projectionRows: [
        { subject: '#a', cells: [{ predicate: 'https://schema.org/status', values: ['"Todo"'] }] },
      ],
      onColumnOrderChange: vi.fn(),
      onCommitCellWriteProposal,
    }))

    await act(async () => {
      await result.current.commitKanbanMove(cardA, doneColumn)
    })

    expect(result.current.pendingMoveForSubject('#a')).toEqual({
      columnId: 'done',
      columnLabel: 'Done',
      predicate: 'https://schema.org/status',
      status: 'approval-staged',
    })
    expect(result.current.pendingMoveViewForSubject('#a')).toEqual({
      predicate: 'status',
      value: 'Done',
      statusLabel: '待审批',
      label: '待审批：status -> Done',
    })
  })
})
