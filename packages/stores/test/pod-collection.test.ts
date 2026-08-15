// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  let options: Record<string, any> | null = null
  const collection = {
    isReady: vi.fn(() => false),
    preload: vi.fn(async () => undefined),
    toArray: [],
    insert: vi.fn(),
    utils: {
      refetch: vi.fn(async () => undefined),
      writeUpsert: vi.fn(),
      writeDelete: vi.fn(),
      writeBatch: vi.fn((callback: () => void) => callback()),
    },
  }
  return {
    collection,
    getOptions: () => options,
    setOptions: (next: Record<string, any>) => {
      options = next
    },
    updateExactRecord: vi.fn(async () => undefined),
    deleteExactRecord: vi.fn(async () => undefined),
  }
})

vi.mock('@tanstack/react-db', () => ({
  createCollection: vi.fn((options: Record<string, any>) => {
    mocks.setOptions(options)
    return mocks.collection
  }),
}))

vi.mock('@tanstack/query-db-collection', () => ({
  queryCollectionOptions: (options: Record<string, any>) => options,
}))

vi.mock('../src/exact-records', () => ({
  updateExactRecord: mocks.updateExactRecord,
  deleteExactRecord: mocks.deleteExactRecord,
}))

import { createPodCollection } from '../src/pod-collection'

function createHarness(rows: Array<{ id: string; projected?: boolean; updatedAt?: Date; name?: string }> = [], harnessOptions: {
  hasDatabase?: boolean
  seed?: Array<{ id: string }>
  transformRows?: (rows: Array<{ id: string; projected?: boolean }>) => Promise<Array<{ id: string; projected?: boolean }>>
  window?: {
    limit: number
    orderBy: Array<{ column: 'updatedAt' | 'name'; direction: 'asc' | 'desc' }>
    maxResidentPages?: number
  }
  selectResults?: Array<Array<{ id: string; projected?: boolean; updatedAt?: Date; name?: string }>>
} = {}) {
  let selectIndex = 0
  const executeSelect = vi.fn(async () => (
    harnessOptions.selectResults?.[selectIndex++] ?? rows
  ))
  const executeInsert = vi.fn(async () => undefined)
  const subscribe = vi.fn()
  const selectQuery: Record<string, any> = {}
  selectQuery.execute = executeSelect
  selectQuery.orderBy = vi.fn(() => selectQuery)
  selectQuery.where = vi.fn(() => selectQuery)
  selectQuery.whereCursor = vi.fn(() => selectQuery)
  selectQuery.limit = vi.fn(() => selectQuery)
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => selectQuery),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ execute: executeInsert })),
    })),
    subscribe,
    findByIri: vi.fn(),
    findById: vi.fn(),
  }
  const queryClient = {
    invalidateQueries: vi.fn(async () => undefined),
  }
  const resource = {
    id: { name: 'id' },
    updatedAt: { name: 'updatedAt' },
    name: { name: 'name' },
    createdAt: { name: 'createdAt' },
    favoredAt: { name: 'favoredAt' },
  }
  const collection = createPodCollection({
    resource: resource as any,
    queryKey: ['central-collection-test'],
    queryClient: queryClient as any,
    getDb: () => harnessOptions.hasDatabase === false ? null : db as any,
    seed: harnessOptions.seed,
    transformRows: harnessOptions.transformRows,
    window: harnessOptions.window,
  })
  const options = mocks.getOptions()
  if (!options) throw new Error('Collection options were not captured')
  return { collection, db, executeInsert, executeSelect, options, queryClient, resource, selectQuery }
}

function transaction(original: Record<string, unknown>, modified = original) {
  return { mutations: [{ original, modified }] }
}

describe('createPodCollection request contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.collection.isReady.mockReturnValue(false)
  })

  it('performs one select for one hydration request', async () => {
    const { executeSelect, options } = createHarness([{ id: 'one.ttl' }])

    await options.queryFn()

    expect(executeSelect).toHaveBeenCalledOnce()
  })

  it('treats a missing Pod collection container as an empty collection', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { executeSelect, options } = createHarness()
    executeSelect.mockRejectedValueOnce(new Error(
      'Could not retrieve http://localhost:5737/alice/.data/sessions/ (HTTP status 404): NotFoundHttpError',
    ))

    await expect(options.queryFn()).resolves.toEqual([])

    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('still reports and rejects unexpected Pod collection failures', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { executeSelect, options } = createHarness()
    const failure = new Error('Could not retrieve Pod collection (HTTP status 500)')
    executeSelect.mockRejectedValueOnce(failure)

    await expect(options.queryFn()).rejects.toBe(failure)

    expect(consoleError).toHaveBeenCalledWith(
      '[PodCollection] central-collection-test fetch failed:',
      failure,
    )
    consoleError.mockRestore()
  })

  it('hydrates only the first bounded page and exposes the next-page state', async () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({
      id: `${index}.ttl`,
      updatedAt: new Date(2026, 0, 1, 0, 0, 101 - index),
    }))
    const { collection, options, selectQuery } = createHarness(rows, {
      window: {
        limit: 100,
        orderBy: [{ column: 'updatedAt', direction: 'desc' }],
        maxResidentPages: 3,
      },
    })

    await expect(options.queryFn()).resolves.toHaveLength(100)

    expect(selectQuery.orderBy).toHaveBeenCalled()
    expect(selectQuery.limit).toHaveBeenCalledWith(101)
    expect(collection.window.hasNextPage).toBe(true)
    expect(collection.window.residentPages).toBe(1)
    expect(collection.window.loadNextPage).toBeTypeOf('function')
  })

  it('loads the next page with a cursor query and merges it without refetching', async () => {
    const firstPage = Array.from({ length: 101 }, (_, index) => ({
      id: `${index}.ttl`,
      updatedAt: new Date(2026, 0, 1, 0, 0, 201 - index),
    }))
    const secondPage = Array.from({ length: 2 }, (_, index) => ({
      id: `${100 + index}.ttl`,
      updatedAt: new Date(2026, 0, 1, 0, 0, 101 - index),
    }))
    const { collection, options, selectQuery } = createHarness([], {
      selectResults: [firstPage, secondPage],
      window: {
        limit: 100,
        orderBy: [{ column: 'updatedAt', direction: 'desc' }],
        maxResidentPages: 3,
      },
    })

    await options.queryFn()
    const loaded = await collection.window.loadNextPage()

    expect(loaded.map((row: { id: string }) => row.id)).toEqual(['100.ttl', '101.ttl'])
    expect(selectQuery.whereCursor).toHaveBeenCalledOnce()
    // One initial read plus the three lexicographic cursor branches.
    expect(selectQuery.limit).toHaveBeenCalledTimes(4)
    expect(collection.window.residentPages).toBe(2)
    expect(collection.window.hasNextPage).toBe(false)
    expect(mocks.collection.utils.writeUpsert).toHaveBeenCalledTimes(2)
    expect(mocks.collection.utils.refetch).not.toHaveBeenCalled()
  })

  it('builds a lexicographic cursor across every sort column and id', async () => {
    const firstPage = [
      { id: 'a.ttl', updatedAt: new Date(2026, 0, 2), name: 'A' },
      { id: 'b.ttl', updatedAt: new Date(2026, 0, 1), name: 'B' },
    ]
    const { collection, options, selectQuery } = createHarness([], {
      selectResults: [firstPage, []],
      window: {
        limit: 1,
        orderBy: [
          { column: 'updatedAt', direction: 'desc' },
          { column: 'name', direction: 'asc' },
        ],
      },
    })
    await options.queryFn()
    await collection.window.loadNextPage()

    const condition = selectQuery.whereCursor.mock.calls[0][0]
    const columns = new Set<string>()
    const visit = (value: any) => {
      if (!value || typeof value !== 'object') return
      if (typeof value.name === 'string') columns.add(value.name)
      if (Array.isArray(value.expressions)) value.expressions.forEach(visit)
      if ('left' in value) visit(value.left)
      if ('right' in value) visit(value.right)
      if ('value' in value) visit(value.value)
    }
    visit(condition)
    expect(columns).toEqual(new Set(['updatedAt', 'name', 'id']))
  })

  it('moves a qualifying remote row into the active window and evicts its boundary', async () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({
      id: `${index}.ttl`,
      updatedAt: new Date(2026, 0, 1, 0, 0, 101 - index),
    }))
    const { collection, db, options, queryClient } = createHarness(rows, {
      window: {
        limit: 100,
        orderBy: [{ column: 'updatedAt', direction: 'desc' }],
        maxResidentPages: 3,
      },
    })
    const callbacks: Record<string, (activity: any) => Promise<void> | void> = {}
    db.subscribe.mockImplementation(async (_resource: unknown, handlers: typeof callbacks) => {
      Object.assign(callbacks, handlers)
      return { unsubscribe: vi.fn() }
    })
    db.findByIri.mockResolvedValue({
      id: 'remote.ttl',
      updatedAt: new Date(2026, 0, 1, 0, 10, 0),
    })
    await options.queryFn()
    vi.clearAllMocks()
    db.subscribe.mockImplementation(async (_resource: unknown, handlers: typeof callbacks) => {
      Object.assign(callbacks, handlers)
      return { unsubscribe: vi.fn() }
    })

    await collection.subscribeToPod(db as any)
    await callbacks.onUpdate({ object: 'https://pod.example/remote.ttl' })

    expect(mocks.collection.utils.writeUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'remote.ttl' }),
    )
    expect(mocks.collection.utils.writeDelete).toHaveBeenCalledWith('99.ttl')
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
  })

  it('backfills once when a subscribed delete removes an active-window row', async () => {
    const firstPage = Array.from({ length: 101 }, (_, index) => ({
      id: `${index}.ttl`,
      updatedAt: new Date(2026, 0, 1, 0, 0, 101 - index),
    }))
    const backfill = [{
      id: '100.ttl',
      updatedAt: new Date(2026, 0, 1, 0, 0, 1),
    }]
    const { collection, db, options, selectQuery } = createHarness([], {
      selectResults: [firstPage, backfill],
      window: {
        limit: 100,
        orderBy: [{ column: 'updatedAt', direction: 'desc' }],
        maxResidentPages: 3,
      },
    })
    const callbacks: Record<string, (activity: any) => Promise<void> | void> = {}
    db.subscribe.mockImplementation(async (_resource: unknown, handlers: typeof callbacks) => {
      Object.assign(callbacks, handlers)
      return { unsubscribe: vi.fn() }
    })
    await options.queryFn()
    await collection.subscribeToPod(db as any)
    vi.clearAllMocks()

    await callbacks.onDelete({ object: '0.ttl' })

    expect(mocks.collection.utils.writeDelete).toHaveBeenCalledWith('0.ttl')
    expect(mocks.collection.utils.writeUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: '100.ttl' }),
    )
    expect(selectQuery.whereCursor).toHaveBeenCalledOnce()
    expect(options.queryFn).toBeTypeOf('function')
  })

  it('reconciles a full-IRI delete when the row is resident', async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({
      id: `${index}.ttl`,
      updatedAt: new Date(2026, 0, 1, 0, 0, 3 - index),
    }))
    const { collection, db, options, queryClient } = createHarness(rows, {
      window: {
        limit: 2,
        orderBy: [{ column: 'updatedAt', direction: 'desc' }],
      },
    })
    const callbacks: Record<string, (activity: any) => Promise<void> | void> = {}
    db.subscribe.mockImplementation(async (_resource: unknown, handlers: typeof callbacks) => {
      Object.assign(callbacks, handlers)
      return { unsubscribe: vi.fn() }
    })
    await options.queryFn()
    await collection.subscribeToPod(db as any)
    vi.clearAllMocks()

    await callbacks.onDelete({ object: 'https://pod.example/0.ttl' })

    expect(mocks.collection.utils.writeDelete).toHaveBeenCalledWith('0.ttl')
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
  })

  it('removes a promoted row from later page metadata before LRU eviction', async () => {
    const firstPage = Array.from({ length: 3 }, (_, index) => ({
      id: `${index}.ttl`,
      updatedAt: new Date(2026, 0, 1, 0, 0, 6 - index),
    }))
    const secondPage = Array.from({ length: 3 }, (_, index) => ({
      id: `${2 + index}.ttl`,
      updatedAt: new Date(2026, 0, 1, 0, 0, 3 - index),
    }))
    const thirdPage = [{ id: '4.ttl', updatedAt: new Date(2026, 0, 1) }]
    const { collection, db, options } = createHarness([], {
      selectResults: [firstPage, secondPage, thirdPage],
      window: {
        limit: 2,
        orderBy: [{ column: 'updatedAt', direction: 'desc' }],
        maxResidentPages: 2,
      },
    })
    const callbacks: Record<string, (activity: any) => Promise<void> | void> = {}
    db.subscribe.mockImplementation(async (_resource: unknown, handlers: typeof callbacks) => {
      Object.assign(callbacks, handlers)
      return { unsubscribe: vi.fn() }
    })
    await options.queryFn()
    await collection.window.loadNextPage()
    await collection.subscribeToPod(db as any)
    db.findByIri.mockResolvedValue({
      id: '2.ttl',
      updatedAt: new Date(2026, 0, 1, 0, 10, 0),
    })
    await callbacks.onUpdate({ object: 'https://pod.example/2.ttl' })
    vi.clearAllMocks()

    await collection.window.loadNextPage()

    expect(mocks.collection.utils.writeDelete).not.toHaveBeenCalledWith('2.ttl')
  })

  it('reconciles a local insert into the active window without refetching', async () => {
    const firstPage = Array.from({ length: 101 }, (_, index) => ({
      id: `${index}.ttl`,
      updatedAt: new Date(2026, 0, 1, 0, 0, 101 - index),
    }))
    const { options } = createHarness(firstPage, {
      window: {
        limit: 100,
        orderBy: [{ column: 'updatedAt', direction: 'desc' }],
      },
    })
    await options.queryFn()
    vi.clearAllMocks()

    await options.onInsert({ transaction: transaction({}, {
      id: 'new.ttl',
      updatedAt: new Date(2026, 0, 1, 0, 10, 0),
    }) })

    expect(mocks.collection.utils.writeUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new.ttl' }),
    )
    expect(mocks.collection.utils.writeDelete).toHaveBeenCalledWith('99.ttl')
    expect(mocks.collection.utils.refetch).not.toHaveBeenCalled()
  })

  it('backfills a local update that moves an active row beyond the window boundary', async () => {
    const firstPage = Array.from({ length: 101 }, (_, index) => ({
      id: `${index}.ttl`,
      updatedAt: new Date(2026, 0, 1, 0, 0, 101 - index),
    }))
    const backfill = [{
      id: '100.ttl',
      updatedAt: new Date(2026, 0, 1, 0, 0, 1),
    }]
    const { options, selectQuery } = createHarness([], {
      selectResults: [firstPage, backfill],
      window: {
        limit: 100,
        orderBy: [{ column: 'updatedAt', direction: 'desc' }],
      },
    })
    await options.queryFn()
    vi.clearAllMocks()

    await options.onUpdate({ transaction: transaction(firstPage[0], {
      ...firstPage[0],
      updatedAt: new Date(2025, 0, 1),
    }) })

    expect(mocks.collection.utils.writeDelete).toHaveBeenCalledWith('0.ttl')
    expect(mocks.collection.utils.writeUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: '100.ttl' }),
    )
    expect(selectQuery.whereCursor).toHaveBeenCalledOnce()
    expect(mocks.collection.utils.refetch).not.toHaveBeenCalled()
  })

  it('releases a temporarily pinned resident page when persistence fails', async () => {
    const firstPage = [
      { id: 'a.ttl', updatedAt: new Date(2026, 0, 3) },
      { id: 'b.ttl', updatedAt: new Date(2026, 0, 2) },
    ]
    const secondPage = [
      { id: 'b.ttl', updatedAt: new Date(2026, 0, 2) },
      { id: 'c.ttl', updatedAt: new Date(2026, 0, 1) },
    ]
    const { collection, options } = createHarness([], {
      selectResults: [
        firstPage,
        secondPage,
        [],
        [],
        [{ id: 'c.ttl', updatedAt: new Date(2026, 0, 1) }],
        [],
        [],
      ],
      window: {
        limit: 1,
        orderBy: [{ column: 'updatedAt', direction: 'desc' }],
        maxResidentPages: 2,
      },
    })
    await options.queryFn()
    await collection.window.loadNextPage()
    mocks.updateExactRecord.mockRejectedValueOnce(new Error('persistence failed'))

    await expect(options.onUpdate({
      transaction: transaction(secondPage[0], {
        ...secondPage[0],
        updatedAt: new Date(2026, 0, 4),
      }),
    })).rejects.toThrow('persistence failed')
    vi.clearAllMocks()

    await collection.window.loadNextPage()

    expect(mocks.collection.utils.writeDelete).toHaveBeenCalledWith('b.ttl')
    expect(mocks.collection.utils.writeDelete).not.toHaveBeenCalledWith('c.ttl')
  })

  it('backfills once after a local delete removes an active row', async () => {
    const firstPage = Array.from({ length: 101 }, (_, index) => ({
      id: `${index}.ttl`,
      updatedAt: new Date(2026, 0, 1, 0, 0, 101 - index),
    }))
    const backfill = [{
      id: '100.ttl',
      updatedAt: new Date(2026, 0, 1, 0, 0, 1),
    }]
    const { options, selectQuery } = createHarness([], {
      selectResults: [firstPage, backfill],
      window: {
        limit: 100,
        orderBy: [{ column: 'updatedAt', direction: 'desc' }],
      },
    })
    await options.queryFn()
    vi.clearAllMocks()

    await options.onDelete({ transaction: transaction(firstPage[0]) })

    expect(mocks.collection.utils.writeDelete).toHaveBeenCalledWith('0.ttl')
    expect(mocks.collection.utils.writeUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: '100.ttl' }),
    )
    expect(selectQuery.whereCursor).toHaveBeenCalledOnce()
    expect(mocks.collection.utils.refetch).not.toHaveBeenCalled()
  })

  it('projects initial and remote rows through one collection-owned transform', async () => {
    const transformRows = vi.fn(async (rows: Array<{ id: string; projected?: boolean }>) => (
      rows.map((row) => ({ ...row, projected: true }))
    ))
    const { collection, db, options } = createHarness([{ id: 'one.ttl' }], { transformRows })

    await expect(options.queryFn()).resolves.toEqual([{ id: 'one.ttl', projected: true }])

    let callbacks: Record<string, (activity: unknown) => Promise<void>> = {}
    db.subscribe.mockImplementation(async (_resource: unknown, handlers: typeof callbacks) => {
      callbacks = handlers
      return { unsubscribe: vi.fn() }
    })
    db.findByIri.mockResolvedValue({ id: 'two.ttl' })
    await collection.subscribeToPod(db as any)
    await callbacks.onCreate({ object: 'https://pod.example/two.ttl' })

    expect(mocks.collection.utils.writeUpsert).toHaveBeenCalledWith({ id: 'two.ttl', projected: true })
    expect(transformRows).toHaveBeenCalledTimes(2)
  })

  it('still projects local fallback rows when the database cannot query a document collection', async () => {
    const transformRows = vi.fn(async () => [{ id: 'local-fallback.ttl', projected: true }])
    const { executeSelect, options } = createHarness([], { transformRows })
    executeSelect.mockRejectedValueOnce(new Error(
      'Document-mode collection queries over plain LDP are not supported.',
    ))

    await expect(options.queryFn()).resolves.toEqual([
      { id: 'local-fallback.ttl', projected: true },
    ])
    expect(transformRows).toHaveBeenCalledWith([], expect.anything())
  })

  it('keeps a disconnected collection lazy without issuing a select', async () => {
    const { executeSelect, options } = createHarness([], { hasDatabase: false })

    await expect(options.queryFn()).resolves.toEqual([])

    expect(executeSelect).not.toHaveBeenCalled()
  })

  it('seeds an empty resource once and never reseeds later reads', async () => {
    const { executeInsert, options } = createHarness([], {
      seed: [{ id: 'seed.ttl' }],
    })

    await options.queryFn()
    await options.queryFn()

    expect(executeInsert).toHaveBeenCalledOnce()
  })

  it('returns hydrated rows without refetching unless explicitly requested', async () => {
    const { collection } = createHarness()
    const hydratedRows = [{ id: 'cached.ttl' }]
    mocks.collection.isReady.mockReturnValue(true)
    mocks.collection.toArray = hydratedRows

    const cachedReads = await Promise.all(
      Array.from({ length: 20 }, () => collection.fetch()),
    )
    expect(cachedReads.every((rows) => rows === hydratedRows)).toBe(true)
    expect(mocks.collection.utils.refetch).not.toHaveBeenCalled()

    await expect(collection.fetch({ refetch: true })).resolves.toBe(hydratedRows)
    expect(mocks.collection.utils.refetch).toHaveBeenCalledOnce()
  })

  it('persists local insert/update/delete without any collection refetch', async () => {
    const { executeInsert, options } = createHarness()
    const row = { id: 'one.ttl', name: 'One' }

    await expect(options.onInsert({ transaction: transaction({}, row) }))
      .resolves.toEqual({ refetch: false })
    await expect(options.onUpdate({ transaction: transaction(row, { ...row, name: 'Two' }) }))
      .resolves.toEqual({ refetch: false })
    await expect(options.onDelete({ transaction: transaction(row) }))
      .resolves.toEqual({ refetch: false })

    expect(executeInsert).toHaveBeenCalledOnce()
    expect(mocks.updateExactRecord).toHaveBeenCalledOnce()
    expect(mocks.deleteExactRecord).toHaveBeenCalledOnce()
    expect(mocks.collection.utils.writeUpsert).toHaveBeenCalledTimes(2)
    expect(mocks.collection.utils.writeDelete).toHaveBeenCalledWith('one.ttl')
  })

  it('detaches array updates from reactive collection drafts before persistence', async () => {
    const { options } = createHarness()
    const original = { id: 'provider.ttl', capabilities: ['responses'] }
    const capabilities = ['responses', 'image_input']

    await options.onUpdate({
      transaction: transaction(original, { ...original, capabilities }),
    })

    const persisted = mocks.updateExactRecord.mock.calls[0][3].capabilities
    expect(persisted).toEqual(capabilities)
    expect(persisted).not.toBe(capabilities)
  })

  it('uses the resource-built id consistently across insert update and delete', async () => {
    const { options, resource } = createHarness()
    Object.assign(resource, {
      buildId: ({ id }: { id: string }) => `${id}.ttl`,
    })
    const original = { id: 'provider-1', label: 'Before' }
    const modified = { ...original, label: 'After' }

    await options.onInsert({ transaction: transaction({}, original) })
    await options.onUpdate({ transaction: transaction(original, modified) })
    await options.onDelete({ transaction: transaction(modified) })

    expect(mocks.updateExactRecord).toHaveBeenCalledWith(
      expect.anything(),
      resource,
      expect.objectContaining({ id: 'provider-1.ttl' }),
      { label: 'After' },
    )
    expect(mocks.deleteExactRecord).toHaveBeenCalledWith(
      expect.anything(),
      resource,
      expect.objectContaining({ id: 'provider-1.ttl' }),
    )
  })

  it('applies remote create/update rows directly and deletes by base-relative id', async () => {
    const { collection, db, options, queryClient } = createHarness()
    const callbacks: Record<string, (activity: any) => Promise<void> | void> = {}
    db.subscribe.mockImplementation(async (_resource: unknown, handlers: typeof callbacks) => {
      Object.assign(callbacks, handlers)
      return { unsubscribe: vi.fn() }
    })
    db.findByIri.mockResolvedValue({ id: 'one.ttl', name: 'Remote' })

    await collection.subscribeToPod(db as any)
    await callbacks.onCreate({ object: 'https://pod.example/one.ttl' })
    await callbacks.onUpdate({ object: 'https://pod.example/one.ttl' })
    callbacks.onDelete({ object: 'one.ttl' })

    expect(db.findByIri).toHaveBeenCalledTimes(2)
    expect(mocks.collection.utils.writeUpsert).toHaveBeenCalledTimes(2)
    expect(mocks.collection.utils.writeDelete).toHaveBeenCalledWith('one.ttl')
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
    expect(options.queryFn).toBeTypeOf('function')
  })

  it.each([
    {
      label: 'object id',
      object: { id: 'one.ttl' },
      exactDelete: true,
    },
    {
      label: 'full IRI string',
      object: 'https://pod.example/one.ttl',
      exactDelete: false,
    },
    {
      label: 'object @id IRI',
      object: { '@id': 'https://pod.example/one.ttl' },
      exactDelete: false,
    },
  ])('handles remote delete activity expressed as $label', async ({ object, exactDelete }) => {
    const { collection, db, queryClient } = createHarness()
    const callbacks: Record<string, (activity: any) => Promise<void> | void> = {}
    db.subscribe.mockImplementation(async (_resource: unknown, handlers: typeof callbacks) => {
      Object.assign(callbacks, handlers)
      return { unsubscribe: vi.fn() }
    })

    await collection.subscribeToPod(db as any)
    callbacks.onDelete({ object })

    if (exactDelete) {
      expect(mocks.collection.utils.writeDelete).toHaveBeenCalledWith('one.ttl')
      expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
    } else {
      expect(mocks.collection.utils.writeDelete).not.toHaveBeenCalled()
      expect(queryClient.invalidateQueries).toHaveBeenCalledOnce()
    }
  })

  it('falls back to one invalidation when a remote activity cannot be resolved exactly', async () => {
    const { collection, db, queryClient } = createHarness()
    const callbacks: Record<string, (activity: any) => Promise<void> | void> = {}
    db.subscribe.mockImplementation(async (_resource: unknown, handlers: typeof callbacks) => {
      Object.assign(callbacks, handlers)
      return { unsubscribe: vi.fn() }
    })
    db.findByIri.mockResolvedValue(null)

    await collection.subscribeToPod(db as any)
    await callbacks.onUpdate({ object: 'https://pod.example/missing.ttl' })

    expect(queryClient.invalidateQueries).toHaveBeenCalledOnce()
  })

  it('coalesces concurrent remote upserts for the same resource into one lookup', async () => {
    const { collection, db, queryClient } = createHarness()
    const callbacks: Record<string, (activity: any) => Promise<void> | void> = {}
    let resolveRow: ((row: { id: string; name: string }) => void) | undefined
    const rowPromise = new Promise<{ id: string; name: string }>((resolve) => {
      resolveRow = resolve
    })
    db.subscribe.mockImplementation(async (_resource: unknown, handlers: typeof callbacks) => {
      Object.assign(callbacks, handlers)
      return { unsubscribe: vi.fn() }
    })
    db.findByIri.mockReturnValue(rowPromise)

    await collection.subscribeToPod(db as any)
    const create = callbacks.onCreate({ object: 'https://pod.example/one.ttl' })
    const update = callbacks.onUpdate({ object: 'https://pod.example/one.ttl' })
    resolveRow?.({ id: 'one.ttl', name: 'Remote' })
    await Promise.all([create, update])

    expect(db.findByIri).toHaveBeenCalledOnce()
    expect(mocks.collection.utils.writeUpsert).toHaveBeenCalledOnce()
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
  })

  it('coalesces concurrent unresolved activities into one collection invalidation', async () => {
    const { collection, db, queryClient } = createHarness()
    const callbacks: Record<string, (activity: any) => Promise<void> | void> = {}
    let resolveRow: ((row: null) => void) | undefined
    const rowPromise = new Promise<null>((resolve) => {
      resolveRow = resolve
    })
    db.subscribe.mockImplementation(async (_resource: unknown, handlers: typeof callbacks) => {
      Object.assign(callbacks, handlers)
      return { unsubscribe: vi.fn() }
    })
    db.findByIri.mockReturnValue(rowPromise)

    await collection.subscribeToPod(db as any)
    const activities = Array.from({ length: 20 }, () => (
      callbacks.onUpdate({ object: 'https://pod.example/missing.ttl' })
    ))
    resolveRow?.(null)
    await Promise.all(activities)

    expect(db.findByIri).toHaveBeenCalledOnce()
    expect(queryClient.invalidateQueries).toHaveBeenCalledOnce()
  })

  it('coalesces an unresolved multi-resource burst into one collection invalidation', async () => {
    const { collection, db, queryClient } = createHarness()
    const callbacks: Record<string, (activity: any) => Promise<void> | void> = {}
    let resolveRows: ((row: null) => void) | undefined
    const rowPromise = new Promise<null>((resolve) => {
      resolveRows = resolve
    })
    db.subscribe.mockImplementation(async (_resource: unknown, handlers: typeof callbacks) => {
      Object.assign(callbacks, handlers)
      return { unsubscribe: vi.fn() }
    })
    db.findByIri.mockReturnValue(rowPromise)

    await collection.subscribeToPod(db as any)
    const activities = Array.from({ length: 20 }, (_, index) => (
      callbacks.onUpdate({ object: `https://pod.example/missing-${index}.ttl` })
    ))
    resolveRows?.(null)
    await Promise.all(activities)

    expect(db.findByIri).toHaveBeenCalledTimes(20)
    expect(queryClient.invalidateQueries).toHaveBeenCalledOnce()
  })

  it('commits a resolved multi-resource burst in one synced-state batch', async () => {
    const { collection, db, queryClient } = createHarness()
    const callbacks: Record<string, (activity: any) => Promise<void> | void> = {}
    db.subscribe.mockImplementation(async (_resource: unknown, handlers: typeof callbacks) => {
      Object.assign(callbacks, handlers)
      return { unsubscribe: vi.fn() }
    })
    db.findByIri.mockImplementation(async (_resource: unknown, iri: string) => ({
      id: iri.split('/').pop(),
      name: 'Remote',
    }))

    await collection.subscribeToPod(db as any)
    const activities = Array.from({ length: 100 }, (_, index) => (
      callbacks.onUpdate({ object: `https://pod.example/${index}.ttl` })
    ))
    await Promise.all(activities)

    expect(db.findByIri).toHaveBeenCalledTimes(100)
    expect(mocks.collection.utils.writeBatch).toHaveBeenCalledTimes(1)
    expect(mocks.collection.utils.writeUpsert).toHaveBeenCalledTimes(100)
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
  })

  it('shares one physical subscription across concurrent consumers', async () => {
    const { collection, db } = createHarness()
    const unsubscribe = vi.fn()
    db.subscribe.mockResolvedValue({ unsubscribe })

    const [releaseFirst, releaseSecond] = await Promise.all([
      collection.subscribeToPod(db as any),
      collection.subscribeToPod(db as any),
    ])

    expect(db.subscribe).toHaveBeenCalledOnce()
    await releaseFirst()
    expect(unsubscribe).not.toHaveBeenCalled()
    await releaseSecond()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('reuses an in-flight subscription when Strict Mode remounts during cleanup', async () => {
    const { collection, db } = createHarness()
    let finishConnection: ((value: { unsubscribe: () => void }) => void) | undefined
    const unsubscribe = vi.fn()
    db.subscribe.mockImplementation(() => new Promise((resolve) => {
      finishConnection = resolve
    }))

    const firstReleasePromise = collection.subscribeToPod(db as any)
    await Promise.resolve()
    finishConnection?.({ unsubscribe })
    const firstRelease = await firstReleasePromise

    const cleanup = firstRelease()
    const secondRelease = await collection.subscribeToPod(db as any)
    await cleanup

    expect(db.subscribe).toHaveBeenCalledOnce()
    expect(unsubscribe).not.toHaveBeenCalled()
    await secondRelease()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
