import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCollectionSubscriptionLease } from '../src/collection-subscription-lease'

describe('createCollectionSubscriptionLease', () => {
  afterEach(() => vi.useRealTimers())

  it('shares one connection between concurrent consumers and releases it once', async () => {
    vi.useFakeTimers()
    const disconnect = vi.fn()
    const connect = vi.fn().mockResolvedValue(disconnect)
    const lease = createCollectionSubscriptionLease(connect, { graceMs: 100 })
    const db = {}

    const [releaseA, releaseB] = await Promise.all([lease.acquire(db), lease.acquire(db)])

    expect(connect).toHaveBeenCalledTimes(1)
    expect(lease.getState(db)).toEqual({ references: 2, connected: true, releasePending: false })
    await releaseA()
    await releaseA()
    expect(lease.getState(db).references).toBe(1)
    await releaseB()
    expect(lease.getState(db).releasePending).toBe(true)
    await vi.advanceTimersByTimeAsync(100)
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(lease.getState(db).connected).toBe(false)
  })

  it('cancels the final release when Strict Mode reacquires during the grace period', async () => {
    vi.useFakeTimers()
    const disconnect = vi.fn()
    const connect = vi.fn().mockResolvedValue(disconnect)
    const lease = createCollectionSubscriptionLease(connect, { graceMs: 100 })
    const db = {}

    const releaseFirst = await lease.acquire(db)
    await releaseFirst()
    const releaseSecond = await lease.acquire(db)
    await vi.advanceTimersByTimeAsync(100)

    expect(connect).toHaveBeenCalledTimes(1)
    expect(disconnect).not.toHaveBeenCalled()
    await releaseSecond()
    await vi.advanceTimersByTimeAsync(100)
    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it('keeps database identities isolated', async () => {
    vi.useFakeTimers()
    const releases = new Map<object, ReturnType<typeof vi.fn>>()
    const connect = vi.fn(async (db: object) => {
      const release = vi.fn()
      releases.set(db, release)
      return release
    })
    const lease = createCollectionSubscriptionLease(connect, { graceMs: 0 })
    const firstDb = {}
    const secondDb = {}

    const releaseFirst = await lease.acquire(firstDb)
    const releaseSecond = await lease.acquire(secondDb)
    expect(connect).toHaveBeenCalledTimes(2)
    await releaseFirst()
    await vi.runAllTimersAsync()
    expect(releases.get(firstDb)).toHaveBeenCalledTimes(1)
    expect(releases.get(secondDb)).not.toHaveBeenCalled()
    await releaseSecond()
  })

  it('clears a failed connection so the next acquire can retry', async () => {
    const disconnect = vi.fn()
    const connect = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(disconnect)
    const lease = createCollectionSubscriptionLease(connect)
    const db = {}

    await expect(lease.acquire(db)).rejects.toThrow('offline')
    const release = await lease.acquire(db)
    expect(connect).toHaveBeenCalledTimes(2)
    await release()
    await lease.dispose()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it('dispose immediately tears down every active identity', async () => {
    const disconnect = vi.fn()
    const lease = createCollectionSubscriptionLease(async () => disconnect)
    await lease.acquire({})
    await lease.acquire({})

    await lease.dispose()

    expect(disconnect).toHaveBeenCalledTimes(2)
  })
})
