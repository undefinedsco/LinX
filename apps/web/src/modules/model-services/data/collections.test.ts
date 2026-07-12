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
    collections: [createCollection(), createCollection(), createCollection()],
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

import { initializeModelCollections } from './collections'

describe('initializeModelCollections', () => {
  it('clears and refetches every collection exactly once per database identity', async () => {
    const firstDatabase = {} as any
    const secondDatabase = {} as any

    await initializeModelCollections(firstDatabase)
    expect(mocks.rebind).toHaveBeenCalledTimes(3)
    expect(mocks.cancelQueries).toHaveBeenCalledTimes(3)
    expect(mocks.rebind.mock.calls.every((call) => call[1] === true)).toBe(true)

    await initializeModelCollections(firstDatabase)
    expect(mocks.rebind).toHaveBeenCalledTimes(3)
    expect(mocks.cancelQueries).toHaveBeenCalledTimes(3)

    await initializeModelCollections(secondDatabase)
    expect(mocks.rebind).toHaveBeenCalledTimes(6)
    expect(mocks.cancelQueries).toHaveBeenCalledTimes(6)

    await initializeModelCollections(null)
    expect(mocks.rebind).toHaveBeenCalledTimes(9)
    expect(mocks.cancelQueries).toHaveBeenCalledTimes(9)
    expect(mocks.rebind.mock.calls.slice(-3).every((call) => call[1] === false)).toBe(true)
  })
})
