import { describe, expect, it } from 'vitest'

import { buildStructuredProjectionTableRows } from './structured-projection-table-model'

const projection = {
  predicates: ['ex:status'],
  rows: [
    { subject: '#第一行', cells: [{ predicate: 'ex:status', values: ['新建'] }] },
    { subject: '#名字', cells: [] },
  ],
}

describe('buildStructuredProjectionTableRows', () => {
  it('shows a pending row until the saved row arrives, then only the saved row', () => {
    const base = {
      classScope: 'ex:Task',
      pendingPredicateIds: [],
      projection: { predicates: projection.predicates, rows: projection.rows.slice(0, 1) },
      resolveCellValues: ({ originalValues }: { originalValues: string[] }) => originalValues,
    }
    const pending = buildStructuredProjectionTableRows({ ...base, pendingSubjects: ['#名字'] })
    expect(pending.map((row) => [row.subject, row.pending ?? false])).toEqual([['#第一行', false], ['#名字', true]])

    const landed = buildStructuredProjectionTableRows({ ...base, projection, pendingSubjects: ['#名字'] })
    expect(landed.map((row) => [row.subject, row.pending ?? false])).toEqual([['#第一行', false], ['#名字', false]])
  })

  it('matches a pending row to its saved row when the projection reports the resolved address', () => {
    const documentUri = 'http://pod.example/任务.ttl'
    const rows = buildStructuredProjectionTableRows({
      classScope: 'ex:Task',
      documentUri,
      pendingPredicateIds: [],
      pendingSubjects: ['#名字'],
      projection: { predicates: [], rows: [{ subject: `${documentUri}#%E5%90%8D%E5%AD%97`, cells: [] }] },
      resolveCellValues: ({ originalValues }) => originalValues,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].pending).toBeUndefined()
  })
})
