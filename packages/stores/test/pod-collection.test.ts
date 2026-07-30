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

function createHarness(rows: Array<{ id: string }> = [], harnessOptions: { hasDatabase?: boolean; seed?: Array<{ id: string }> } = {}) {
  const executeSelect = vi.fn(async () => rows)
  const executeInsert = vi.fn(async () => undefined)
  const subscribe = vi.fn()
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ execute: executeSelect })),
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
  const resource = { id: {} }
  const collection = createPodCollection({
    resource: resource as any,
    queryKey: ['central-collection-test'],
    queryClient: queryClient as any,
    getDb: () => harnessOptions.hasDatabase === false ? null : db as any,
    seed: harnessOptions.seed,
  })
  const options = mocks.getOptions()
  if (!options) throw new Error('Collection options were not captured')
  return { collection, db, executeInsert, executeSelect, options, queryClient, resource }
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
