import { describe, expect, it } from 'vitest'

import {
  DEFAULT_STRUCTURED_KANBAN_BOARD_STATE,
  reconcileStructuredKanbanBoardState,
} from './structured-kanban-board-state'

describe('structured-kanban-board-state', () => {
  it('reconciles saved lane order, collapsed lanes, scroll, and card order against live lanes', () => {
    expect(reconcileStructuredKanbanBoardState({
      saved: {
        version: 1,
        laneOrder: ['doing', 'done'],
        collapsedLaneIds: ['done'],
        scrollLeft: 260,
        cardOrder: { doing: ['a', 'gone'] },
      },
      lanes: [
        { id: 'todo', subjects: ['b'] },
        { id: 'doing', subjects: ['a', 'c'] },
        { id: 'done', subjects: [] },
      ],
    })).toEqual({
      version: 1,
      laneOrder: ['doing', 'done', 'todo'],
      collapsedLaneIds: ['done'],
      scrollLeft: 260,
      cardOrder: { doing: ['a', 'c'], done: [], todo: ['b'] },
    })
  })

  it('deduplicates ids, drops unknown lane data, clamps scroll, and falls back for corrupt metadata', () => {
    expect(reconcileStructuredKanbanBoardState({
      saved: {
        version: 1,
        laneOrder: ['done', 'done', 'missing'],
        collapsedLaneIds: ['done', 'done', 'missing'],
        scrollLeft: -8,
        cardOrder: {
          done: ['c', 'c', 'missing'],
          missing: ['x'],
        },
      },
      lanes: [
        { id: 'todo', subjects: ['a', 'b'] },
        { id: 'done', subjects: ['c', 'd'] },
      ],
    })).toEqual({
      version: 1,
      laneOrder: ['done', 'todo'],
      collapsedLaneIds: ['done'],
      scrollLeft: 0,
      cardOrder: {
        done: ['c', 'd'],
        todo: ['a', 'b'],
      },
    })

    expect(reconcileStructuredKanbanBoardState({
      saved: { version: 2 },
      lanes: [],
    })).toEqual(DEFAULT_STRUCTURED_KANBAN_BOARD_STATE)
  })
})
