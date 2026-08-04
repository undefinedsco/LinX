import { describe, expect, it } from 'vitest'

import type { StructuredCardProjection, StructuredKanbanColumn } from '../../domain/structured/structured-projections'
import {
  projectStructuredApprovalStagedKanbanPendingMoves,
  projectStructuredKanbanColumnSubjectReorder,
  projectStructuredDiscardedKanbanPendingMoves,
  projectStructuredKanbanMoveModel,
  projectStructuredKanbanPendingMoveView,
  projectStructuredStagedKanbanPendingMoves,
  type StructuredKanbanMove,
} from './structured-kanban-move-model'

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
const cardC: StructuredCardProjection = {
  subject: '#c',
  title: 'Gamma',
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
  cards: [cardC],
}

describe('structured-kanban-move-model', () => {
  it('projects target columns and pending move display columns without mutating source columns', () => {
    const pendingMoves: Record<string, StructuredKanbanMove> = {
      '#a': {
        columnId: 'done',
        columnLabel: 'Done',
        predicate: 'https://schema.org/status',
        status: 'approval-staged',
      },
    }

    const model = projectStructuredKanbanMoveModel({
      sourceColumns: [todoColumn, doneColumn],
      pendingMoves,
    })

    expect(model.columns).toEqual([
      { id: 'todo', label: 'Todo', value: '"Todo"' },
      { id: 'done', label: 'Done', value: '"Done"' },
    ])
    expect(model.displayColumns[0]?.cards.map((card) => card.subject)).toEqual(['#b'])
    expect(model.displayColumns[1]?.cards.map((card) => card.subject)).toEqual(['#c', '#a'])
    expect(todoColumn.cards.map((card) => card.subject)).toEqual(['#a', '#b'])
    expect(doneColumn.cards.map((card) => card.subject)).toEqual(['#c'])
  })

  it('projects pending move labels from predicate URI and target column label', () => {
    expect(projectStructuredKanbanPendingMoveView({
      columnId: 'done',
      columnLabel: 'Done',
      predicate: 'https://schema.org/status',
      status: 'pending',
    })).toEqual({
      predicate: 'status',
      value: 'Done',
      statusLabel: '提交中',
      label: '提交中：status -> Done',
    })

    expect(projectStructuredKanbanPendingMoveView({
      columnId: 'done',
      columnLabel: 'Done',
      predicate: 'https://schema.org/status',
      status: 'approval-staged',
    })).toEqual({
      predicate: 'status',
      value: 'Done',
      statusLabel: '待审批',
      label: '待审批：status -> Done',
    })

    expect(projectStructuredKanbanPendingMoveView(undefined)).toBeUndefined()
  })

  it('projects a pending cross-column move before its hovered target card', () => {
    const model = projectStructuredKanbanMoveModel({
      sourceColumns: [todoColumn, doneColumn],
      pendingMoves: {
        '#a': {
          columnId: 'done',
          columnLabel: 'Done',
          overSubject: '#c',
          predicate: 'https://schema.org/status',
          status: 'pending',
        },
      },
    })

    expect(model.displayColumns[1]?.cards.map((card) => card.subject)).toEqual(['#a', '#c'])
  })

  it('projects pending move staging, approval staging, and discard transitions', () => {
    const staged = projectStructuredStagedKanbanPendingMoves({
      current: {},
      predicate: 'https://schema.org/status',
      subject: '#a',
      targetColumn: doneColumn,
    })

    expect(staged).toEqual({
      '#a': {
        columnId: 'done',
        columnLabel: 'Done',
        predicate: 'https://schema.org/status',
        status: 'pending',
      },
    })
    expect(projectStructuredApprovalStagedKanbanPendingMoves({
      current: staged,
      subject: '#a',
    })).toEqual({
      '#a': {
        columnId: 'done',
        columnLabel: 'Done',
        predicate: 'https://schema.org/status',
        status: 'approval-staged',
      },
    })
    expect(projectStructuredDiscardedKanbanPendingMoves({
      current: staged,
      subject: '#a',
    })).toEqual({})
  })

  it('projects same-column subject order changes and ignores invalid reorder attempts', () => {
    const displayColumns = [
      { ...todoColumn, cards: [cardA, cardB] },
      doneColumn,
    ]

    expect(projectStructuredKanbanColumnSubjectReorder({
      displayColumns,
      columnId: 'todo',
      subject: '#b',
      overSubject: '#a',
    })).toEqual(['#b', '#a'])

    expect(projectStructuredKanbanColumnSubjectReorder({
      displayColumns,
      columnId: 'missing',
      subject: '#b',
      overSubject: '#a',
    })).toBeNull()
    expect(projectStructuredKanbanColumnSubjectReorder({
      displayColumns,
      columnId: 'todo',
      subject: '#b',
      overSubject: '#b',
    })).toBeNull()
    expect(projectStructuredKanbanColumnSubjectReorder({
      displayColumns,
      columnId: 'todo',
      subject: '#missing',
      overSubject: '#a',
    })).toBeNull()
  })
})
