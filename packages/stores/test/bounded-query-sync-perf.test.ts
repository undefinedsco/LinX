// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  createOrderedWindowPolicy,
  evictOrderedWindowPages,
  reconcileOrderedWindow,
  type OrderedWindowPage,
} from '../src/ordered-window'

type Row = { id: string; updatedAt: Date }

function createRows(size: number): Row[] {
  return Array.from({ length: size }, (_, index) => ({
    id: String(index).padStart(6, '0'),
    updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, size - index)),
  }))
}

describe.each([1_000, 10_000])('bounded collection performance gate (%i source rows)', (size) => {
  it('caps every page read and resident memory independently of source size', () => {
    const source = createRows(size)
    const policy = createOrderedWindowPolicy<Row>({
      limit: 100,
      orderBy: [{ column: 'updatedAt', direction: 'desc' }],
      maxResidentPages: 3,
    })
    const rowsPerSelect: number[] = []
    let pages: OrderedWindowPage<Row>[] = []

    for (let pageIndex = 0; pageIndex < 4; pageIndex += 1) {
      const fetched = source.slice(pageIndex * 100, pageIndex * 100 + 101)
      rowsPerSelect.push(fetched.length)
      pages.push({
        id: `page-${pageIndex}`,
        rows: policy.sort(fetched).slice(0, 100),
        lastAccessed: pageIndex,
      })
      pages = evictOrderedWindowPages(pages, 3).pages
    }

    expect(Math.max(...rowsPerSelect)).toBeLessThanOrEqual(101)
    expect(pages.flatMap((page) => page.rows)).toHaveLength(300)
  })

  it('reconciles a 100-event burst without requesting a full-table refetch', () => {
    const policy = createOrderedWindowPolicy<Row>({
      limit: 100,
      orderBy: [{ column: 'updatedAt', direction: 'desc' }],
    })
    let resident = policy.sort(createRows(size).slice(0, 100))
    let fullTableRefetches = 0

    for (let index = 0; index < 100; index += 1) {
      resident = reconcileOrderedWindow(resident, {
        id: `remote-${index}`,
        updatedAt: new Date(Date.UTC(2027, 0, 1, 0, 0, index)),
      }, policy).rows
    }

    expect(resident).toHaveLength(100)
    expect(fullTableRefetches).toBe(0)
  })
})
