import { describe, expect, it } from 'vitest'

import type { StructuredTableProjection } from '../../domain/structured/structured-table'
import {
  findStructuredKanbanColumnForSubject,
  findStructuredKanbanTargetColumnForDndOverId,
  createStructuredKanbanNativeDragState,
  hasStructuredKanbanMoveTargets,
  projectStructuredKanbanCardBySubject,
  projectStructuredKanbanDndDragEndPlan,
  projectStructuredKanbanDisplayColumns,
  projectStructuredKanbanNativeDragCleared,
  projectStructuredKanbanNativeDragLeftColumn,
  projectStructuredKanbanNativeDragOverColumn,
  projectStructuredKanbanNativeDragStarted,
  projectStructuredKanbanMoveTargets,
  projectStructuredKanbanSourceModel,
} from './structured-kanban-view-model'

const projection: StructuredTableProjection = {
  predicates: ['status', 'schema:name', 'schema:keywords'],
  rows: [
    {
      subject: '#a',
      cells: [
        { predicate: 'status', values: ['"Todo"'] },
        { predicate: 'schema:name', values: ['"Alpha"'] },
        { predicate: 'schema:keywords', values: ['"urgent"', '"design"', '"review"', '"later"'] },
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

describe('structured-kanban-view-model', () => {
  it('projects source Kanban columns, group labels, and predicate menu rows', () => {
    const model = projectStructuredKanbanSourceModel({
      projection,
      groupPredicate: 'status',
      kanbanOrder: {},
    })

    expect(model.kanban.groupPredicate).toBe('status')
    expect(model.kanban.columns.map((column) => column.id)).toEqual(['Todo', 'Done'])
    expect(model.hasColumns).toBe(true)
    expect(model.hasPredicateOptions).toBe(true)
    expect(model.groupLabel).toBe('按 status 分组')
    expect(model.groupTriggerLabel).toBe('status')
    expect(model.chrome).toEqual({
      emptyStateMessage: '没有可投影到 Kanban 的 subject。',
      groupPredicateButtonAriaLabel: 'Kanban 分组 predicate',
    })
    expect(model.predicateOptions).toEqual([
      { predicate: 'status', label: 'status' },
      { predicate: 'schema:name', label: 'name' },
      { predicate: 'schema:keywords', label: 'keywords' },
    ])
  })

  it('projects display column counts, card lookup, source column, and DnD target column', () => {
    const sourceModel = projectStructuredKanbanSourceModel({
      projection,
      groupPredicate: 'status',
      kanbanOrder: {},
    })
    const displayColumns = projectStructuredKanbanDisplayColumns(sourceModel.kanban.columns)
    const cardBySubject = projectStructuredKanbanCardBySubject(displayColumns)

    expect(displayColumns.map((column) => column.cardCountLabel)).toEqual(['2', '1'])
    expect(displayColumns.map((column) => column.ariaLabel)).toEqual(['Kanban column Todo', 'Kanban column Done'])
    expect(displayColumns[0]?.cardSubjects).toEqual(['#a', '#b'])
    expect(displayColumns[0]?.cards[0]).toMatchObject({
      openAriaLabel: '打开 subject #a',
      moveButtonAriaLabel: 'Move #a',
      visibleTags: ['urgent', 'design', 'review'],
    })
    expect(cardBySubject.get('#a')?.title).toBe('Alpha')
    expect(findStructuredKanbanColumnForSubject(displayColumns, '#a')?.id).toBe('Todo')
    expect(findStructuredKanbanTargetColumnForDndOverId(displayColumns, '#a')?.id).toBe('Todo')
    expect(findStructuredKanbanTargetColumnForDndOverId(displayColumns, 'Done')?.id).toBe('Done')
    expect(findStructuredKanbanTargetColumnForDndOverId(displayColumns, 'missing')).toBeUndefined()
  })

  it('projects DnD drag-end routing without the controller branching over columns', () => {
    const sourceModel = projectStructuredKanbanSourceModel({
      projection,
      groupPredicate: 'status',
      kanbanOrder: {},
    })
    const displayColumns = projectStructuredKanbanDisplayColumns(sourceModel.kanban.columns)

    expect(projectStructuredKanbanDndDragEndPlan({
      displayColumns,
      overId: null,
      subject: '#a',
    })).toEqual({ kind: 'none' })

    expect(projectStructuredKanbanDndDragEndPlan({
      displayColumns,
      overId: '#a',
      subject: '#b',
    })).toEqual({
      kind: 'reorder',
      columnId: 'Todo',
      overSubject: '#a',
      subject: '#b',
    })

    expect(projectStructuredKanbanDndDragEndPlan({
      displayColumns,
      overId: 'Done',
      subject: '#a',
    })).toEqual({
      kind: 'cross-column',
      subject: '#a',
      targetColumn: expect.objectContaining({ id: 'Done', value: '"Done"' }),
    })

    expect(projectStructuredKanbanDndDragEndPlan({
      displayColumns,
      overId: 'missing',
      subject: '#a',
    })).toEqual({ kind: 'none' })
  })

  it('projects per-column move target availability from workflow capability and target columns', () => {
    const sourceModel = projectStructuredKanbanSourceModel({
      projection,
      groupPredicate: 'status',
      kanbanOrder: {},
    })

    expect(projectStructuredKanbanMoveTargets({
      canCommitCrossColumnMoves: false,
      columns: sourceModel.kanban.columns,
      columnId: 'Todo',
    })).toEqual([])
    expect(projectStructuredKanbanMoveTargets({
      canCommitCrossColumnMoves: true,
      columns: sourceModel.kanban.columns,
      columnId: 'Todo',
    }).map((column) => [column.id, column.moveMenuItemLabel])).toEqual([
      ['Done', '移动到 Done'],
    ])
    expect(hasStructuredKanbanMoveTargets([
      { id: 'Done', label: 'Done', value: '"Done"' },
    ])).toBe(true)
    expect(hasStructuredKanbanMoveTargets([])).toBe(false)
  })

  it('projects native drag state without requiring the controller to inline state patches', () => {
    const initialState = createStructuredKanbanNativeDragState()

    expect(initialState).toEqual({
      draggingSubject: null,
      dragOverColumnId: null,
    })
    expect(projectStructuredKanbanNativeDragOverColumn({
      current: initialState,
      columnId: 'Todo',
    })).toEqual(initialState)

    const draggingState = projectStructuredKanbanNativeDragStarted({ subject: '#a' })

    expect(draggingState).toEqual({
      draggingSubject: '#a',
      dragOverColumnId: null,
    })

    const overTodoState = projectStructuredKanbanNativeDragOverColumn({
      current: draggingState,
      columnId: 'Todo',
    })

    expect(overTodoState).toEqual({
      draggingSubject: '#a',
      dragOverColumnId: 'Todo',
    })
    expect(projectStructuredKanbanNativeDragLeftColumn({
      current: overTodoState,
      columnId: 'Done',
    })).toBe(overTodoState)
    expect(projectStructuredKanbanNativeDragLeftColumn({
      current: overTodoState,
      columnId: 'Todo',
    })).toEqual({
      draggingSubject: '#a',
      dragOverColumnId: null,
    })
    expect(projectStructuredKanbanNativeDragCleared()).toEqual(initialState)
  })
})
