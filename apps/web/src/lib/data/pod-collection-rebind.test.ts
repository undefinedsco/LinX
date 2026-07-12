import { describe, expect, it, vi } from 'vitest'
import { rebindPodCollection } from './pod-collection-rebind'

describe('rebindPodCollection', () => {
  it('clears rows from the previous database before refetching the next database', async () => {
    const writeDelete = vi.fn()
    const refetch = vi.fn(async () => [])
    const collection = {
      startSyncImmediate: vi.fn(),
      keys: () => ['old-contact', 'old-agent'].values(),
      utils: { writeDelete, refetch },
    }

    await rebindPodCollection(collection, true)

    expect(collection.startSyncImmediate).toHaveBeenCalledOnce()
    expect(writeDelete).toHaveBeenCalledWith(['old-contact', 'old-agent'])
    expect(refetch).toHaveBeenCalledWith({ throwOnError: true })
  })

  it('clears rows without refetching when the database is removed', async () => {
    const writeDelete = vi.fn()
    const refetch = vi.fn(async () => [])
    const collection = {
      startSyncImmediate: vi.fn(),
      keys: () => ['private-credential'].values(),
      utils: { writeDelete, refetch },
    }

    await rebindPodCollection(collection, false)

    expect(writeDelete).toHaveBeenCalledWith(['private-credential'])
    expect(refetch).not.toHaveBeenCalled()
  })

  it('fails explicitly when the collection lacks query rebind utilities', async () => {
    const collection = {
      startSyncImmediate: vi.fn(),
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
      startSyncImmediate: vi.fn(),
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
})
