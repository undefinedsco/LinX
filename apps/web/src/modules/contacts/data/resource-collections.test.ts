import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const createCollection = () => ({
    startSyncImmediate: vi.fn(),
    keys: vi.fn(() => [][Symbol.iterator]()),
    utils: {
      writeDelete: vi.fn(),
      refetch: vi.fn(async () => []),
    },
  })
  return {
    collections: [createCollection(), createCollection()],
    createIndex: 0,
    rebind: vi.fn(async (_collection: unknown, _hasDatabase: boolean, options?: { cancelInFlight?: () => Promise<unknown> }) => {
      await options?.cancelInFlight?.()
    }),
    cancelQueries: vi.fn(async () => undefined),
  }
})

vi.mock('@/lib/data/pod-collection', () => ({
  createPodCollection: vi.fn(() => mocks.collections[mocks.createIndex++]),
}))

vi.mock('@/lib/data/pod-collection-rebind', () => ({
  rebindPodCollection: (...args: unknown[]) => mocks.rebind(...args),
}))

vi.mock('@/providers/query-provider', () => ({
  queryClient: { cancelQueries: (...args: unknown[]) => mocks.cancelQueries(...args) },
}))

import { initializeContactCollections } from './resource-collections'

describe('initializeContactCollections', () => {
  it('clears and refetches both collections exactly once per database identity', async () => {
    const firstDatabase = {} as any
    const secondDatabase = {} as any

    await initializeContactCollections(firstDatabase)
    expect(mocks.rebind).toHaveBeenCalledTimes(2)
    expect(mocks.cancelQueries).toHaveBeenCalledTimes(2)
    expect(mocks.rebind.mock.calls.every((call) => call[1] === true)).toBe(true)

    await initializeContactCollections(firstDatabase)
    expect(mocks.rebind).toHaveBeenCalledTimes(2)
    expect(mocks.cancelQueries).toHaveBeenCalledTimes(2)

    await initializeContactCollections(secondDatabase)
    expect(mocks.rebind).toHaveBeenCalledTimes(4)
    expect(mocks.cancelQueries).toHaveBeenCalledTimes(4)

    await initializeContactCollections(null)
    expect(mocks.rebind).toHaveBeenCalledTimes(6)
    expect(mocks.cancelQueries).toHaveBeenCalledTimes(6)
    expect(mocks.rebind.mock.calls.slice(-2).every((call) => call[1] === false)).toBe(true)
  })
})
