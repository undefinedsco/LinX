import { describe, expect, it, vi } from 'vitest'
import { rebindPodCollection, rebindPodCollections } from './pod-collection-rebind'

describe('rebindPodCollection', () => {
  it('clears rows from the previous database before refetching the next database', async () => {
    const writeDelete = vi.fn()
    const refetch = vi.fn(async () => [])
    const collection = {
      isReady: vi.fn(() => true),
      keys: () => ['old-contact', 'old-agent'].values(),
      utils: { writeDelete, refetch },
    }

    await rebindPodCollection(collection, true)

    expect(writeDelete).toHaveBeenCalledWith(['old-contact', 'old-agent'])
    expect(refetch).toHaveBeenCalledWith({ throwOnError: true })
  })

  it('keeps a fresh collection lazy until its owning module consumes it', async () => {
    const writeDelete = vi.fn()
    const refetch = vi.fn(async () => [])
    const collection = {
      isReady: vi.fn(() => false),
      keys: () => [][Symbol.iterator](),
      utils: { writeDelete, refetch },
    }

    await rebindPodCollection(collection, true)

    expect(refetch).not.toHaveBeenCalled()
  })

  it('clears rows without refetching when the database is removed', async () => {
    const writeDelete = vi.fn()
    const refetch = vi.fn(async () => [])
    const collection = {
      isReady: vi.fn(() => true),
      keys: () => ['private-credential'].values(),
      utils: { writeDelete, refetch },
    }

    await rebindPodCollection(collection, false)

    expect(writeDelete).toHaveBeenCalledWith(['private-credential'])
    expect(refetch).not.toHaveBeenCalled()
  })

  it('fails explicitly when the collection lacks query rebind utilities', async () => {
    const collection = {
      isReady: vi.fn(() => true),
      keys: () => [][Symbol.iterator](),
      utils: {},
    }

    await expect(rebindPodCollection(collection, true))
      .rejects.toThrow('Pod collection does not expose query rebind utilities.')
  })

  it('clears visible rows immediately and waits for stale requests to cancel before refetching', async () => {
    let finishCancellation: (() => void) | undefined
    const cancellation = new Promise<void>((resolve) => {
      finishCancellation = resolve
    })
    const writeDelete = vi.fn()
    const refetch = vi.fn(async () => [])
    const collection = {
      isReady: vi.fn(() => true),
      keys: () => ['previous-account-row'].values(),
      utils: { writeDelete, refetch },
    }

    const rebind = rebindPodCollection(collection, true, {
      cancelInFlight: vi.fn(() => cancellation),
    })

    expect(writeDelete).toHaveBeenCalledWith(['previous-account-row'])
    expect(refetch).not.toHaveBeenCalled()

    finishCancellation?.()
    await rebind

    expect(refetch).toHaveBeenCalledWith({ throwOnError: true })
  })

  it.each([1, 2, 3, 17])(
    'keeps %i fresh collections lazy while cancelling each stale request once',
    async (count) => {
      const cancellations = Array.from({ length: count }, () => vi.fn(async () => undefined))
      const refetches = Array.from({ length: count }, () => vi.fn(async () => []))
      const bindings = refetches.map((refetch, index) => ({
        collection: {
          isReady: () => false,
          keys: () => [][Symbol.iterator](),
          utils: { writeDelete: vi.fn(), refetch },
        },
        cancelInFlight: cancellations[index],
      }))

      await rebindPodCollections(bindings, true)

      for (const cancellation of cancellations) {
        expect(cancellation).toHaveBeenCalledOnce()
      }
      for (const refetch of refetches) {
        expect(refetch).not.toHaveBeenCalled()
      }
    },
  )

  it.each([1, 2, 3, 17])(
    'refetches %i already hydrated collections exactly once after a database switch',
    async (count) => {
      const refetches = Array.from({ length: count }, () => vi.fn(async () => []))
      const bindings = refetches.map((refetch, index) => ({
        collection: {
          isReady: () => true,
          keys: () => [`old-${index}`].values(),
          utils: { writeDelete: vi.fn(), refetch },
        },
      }))

      await rebindPodCollections(bindings, true)

      for (const refetch of refetches) {
        expect(refetch).toHaveBeenCalledOnce()
        expect(refetch).toHaveBeenCalledWith({ throwOnError: true })
      }
    },
  )
})
