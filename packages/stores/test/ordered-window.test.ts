import { describe, expect, it } from 'vitest'
import {
  captureOrderedWindowSnapshot,
  createOrderedWindowPolicy,
  evictOrderedWindowPages,
  reconcileOrderedWindow,
  removeFromOrderedWindow,
  restoreOrderedWindowSnapshot,
} from '../src/ordered-window'

type Row = {
  id: string
  name?: string | null
  updatedAt?: Date | null
}

describe('ordered window', () => {
  it('uses id ASC to stabilize equal descending sort values', () => {
    const policy = createOrderedWindowPolicy<Row>({
      limit: 3,
      orderBy: [{ column: 'updatedAt', direction: 'desc' }],
    })
    const newest = { id: 'newest', updatedAt: new Date('2026-08-01T12:00:00Z') }
    const sameTimeA = { id: 'a', updatedAt: new Date('2026-08-01T11:00:00Z') }
    const sameTimeB = { id: 'b', updatedAt: new Date('2026-08-01T11:00:00Z') }

    expect(policy.sort([sameTimeB, newest, sameTimeA])).toEqual([
      newest,
      sameTimeA,
      sameTimeB,
    ])
    expect(policy.cursorFor(sameTimeA)).toEqual({
      values: [sameTimeA.updatedAt],
      id: 'a',
    })
    expect(policy.compare(sameTimeA, sameTimeB)).toBeLessThan(0)
    expect(policy.compare(sameTimeB, sameTimeA)).toBeGreaterThan(0)
    expect(policy.belongsBeforeOrAt(sameTimeA, policy.cursorFor(sameTimeB))).toBe(true)
  })

  it('sorts ascending strings and leaves null values after concrete values', () => {
    const policy = createOrderedWindowPolicy<Row>({
      limit: 3,
      orderBy: [{ column: 'name', direction: 'asc' }],
    })

    expect(policy.sort([
      { id: 'null', name: null },
      { id: 'b', name: 'Beta' },
      { id: 'a', name: 'Alpha' },
    ]).map((row) => row.id)).toEqual(['a', 'b', 'null'])
  })

  it('leaves null values after concrete values for descending order', () => {
    const policy = createOrderedWindowPolicy<Row>({
      limit: 2,
      orderBy: [{ column: 'updatedAt', direction: 'desc' }],
    })

    expect(policy.sort([
      { id: 'null', updatedAt: null },
      { id: 'dated', updatedAt: new Date('2026-08-01T00:00:00Z') },
    ]).map((row) => row.id)).toEqual(['dated', 'null'])
  })

  it('inserts a qualifying row and evicts the boundary row', () => {
    const policy = createOrderedWindowPolicy<Row>({
      limit: 3,
      orderBy: [{ column: 'updatedAt', direction: 'desc' }],
    })
    const rows = [3, 2, 1].map((hour) => ({
      id: String(hour),
      updatedAt: new Date(`2026-08-01T0${hour}:00:00Z`),
    }))

    const result = reconcileOrderedWindow(rows, {
      id: '4',
      updatedAt: new Date('2026-08-01T04:00:00Z'),
    }, policy)

    expect(result.entered).toBe(true)
    expect(result.evicted?.id).toBe('1')
    expect(result.rows.map((row) => row.id)).toEqual(['4', '3', '2'])
  })

  it('removes a row and uses one boundary row to backfill', () => {
    const policy = createOrderedWindowPolicy<Row>({
      limit: 3,
      orderBy: [{ column: 'name', direction: 'asc' }],
    })

    const result = removeFromOrderedWindow([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ], 'b', { id: 'd', name: 'D' }, policy)

    expect(result.removed?.id).toBe('b')
    expect(result.rows.map((row) => row.id)).toEqual(['a', 'c', 'd'])
  })

  it('does not backfill when the removed id is not resident', () => {
    const policy = createOrderedWindowPolicy<Row>({
      limit: 3,
      orderBy: [{ column: 'name', direction: 'asc' }],
    })
    const rows = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]

    const result = removeFromOrderedWindow(rows, 'outside', { id: 'c', name: 'C' }, policy)

    expect(result.removed).toBeUndefined()
    expect(result.rows).toEqual(rows)
    expect(result.rows).not.toBe(rows)
  })

  it('restores an immutable snapshot after a rejected optimistic reorder', () => {
    const original = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
    const snapshot = captureOrderedWindowSnapshot(original)
    original[0].name = 'Changed'

    expect(restoreOrderedWindowSnapshot(snapshot)).toEqual([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ])
  })

  it('evicts the least recently used settled page and preserves pinned pages', () => {
    const result = evictOrderedWindowPages([
      { id: 'page-1', rows: [{ id: '1' }], lastAccessed: 1, pinned: false },
      { id: 'page-2', rows: [{ id: '2' }], lastAccessed: 2, pinned: true },
      { id: 'page-3', rows: [{ id: '3' }], lastAccessed: 3, pinned: false },
      { id: 'page-4', rows: [{ id: '4' }], lastAccessed: 4, pinned: false },
    ], 3)

    expect(result.pages.map((page) => page.id)).toEqual(['page-2', 'page-3', 'page-4'])
    expect(result.evictedPages.map((page) => page.id)).toEqual(['page-1'])
    expect(result.residentRows).toHaveLength(3)
  })
})
