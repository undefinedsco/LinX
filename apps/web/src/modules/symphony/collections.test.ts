import { beforeEach, describe, expect, it, vi } from 'vitest'

const collectionRecords: Array<{
  options: { resource: unknown; queryKey: string[]; getDb: () => unknown; orderBy?: unknown; getKey?: (item: { id?: string }) => string }
  fetch: ReturnType<typeof vi.fn>
  subscribeToPod: ReturnType<typeof vi.fn>
}> = []

vi.mock('@/lib/data/pod-collection', () => ({
  createPodCollection: vi.fn((options) => {
    const record = {
      options,
      fetch: vi.fn(async () => []),
      subscribeToPod: vi.fn(async () => () => undefined),
    }
    collectionRecords.push(record)
    return record
  }),
}))

vi.mock('@/providers/query-provider', () => ({
  queryClient: { invalidateQueries: vi.fn() },
}))

describe('symphony control collections', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('declares Web-readable control resources for Symphony Pod state', async () => {
    const module = await import('./collections')

    expect(collectionRecords.map((record) => record.options.queryKey)).toEqual([
      ['symphony', 'issues'],
      ['symphony', 'tasks'],
      ['symphony', 'deliveries'],
      ['symphony', 'sessions'],
      ['symphony', 'runs'],
      ['symphony', 'runSteps'],
      ['symphony', 'evidence'],
      ['symphony', 'reports'],
    ])

    const db = { id: 'db' }
    module.initializeSymphonyControlCollections(db as never)
    const unsubscribe = await module.symphonyControlOps.subscribeToPod()

    expect(collectionRecords.map((record) => record.options.getDb())).toEqual([db, db, db, db, db, db, db, db])
    for (const record of collectionRecords) {
      expect(record.subscribeToPod).toHaveBeenCalledTimes(1)
      expect(record.subscribeToPod).toHaveBeenCalledWith(db)
    }
    unsubscribe()
  })

  it('fetches a shared control snapshot without CLI-only archive access', async () => {
    const module = await import('./collections')
    const names = ['issues', 'tasks', 'deliveries', 'sessions', 'runs', 'runSteps', 'evidence', 'reports']
    for (const [index, record] of collectionRecords.entries()) {
      record.fetch.mockResolvedValueOnce([{ id: `${names[index]}-1` }])
    }

    const snapshot = await module.symphonyControlOps.fetchSnapshot()

    expect(snapshot).toEqual({
      issues: [{ id: 'issues-1' }],
      tasks: [{ id: 'tasks-1' }],
      deliveries: [{ id: 'deliveries-1' }],
      sessions: [{ id: 'sessions-1' }],
      runs: [{ id: 'runs-1' }],
      runSteps: [{ id: 'runSteps-1' }],
      evidence: [{ id: 'evidence-1' }],
      reports: [{ id: 'reports-1' }],
    })
  })
})
