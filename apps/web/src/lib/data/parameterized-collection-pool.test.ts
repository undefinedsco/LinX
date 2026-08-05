import { describe, expect, it, vi } from 'vitest'
import { createParameterizedCollectionPool } from './parameterized-collection-pool'

describe('parameterized collection pool', () => {
  it('shares an instance by scope and parameter until the final release', () => {
    const create = vi.fn((scope: string, parameter: string) => ({ scope, parameter }))
    const dispose = vi.fn()
    const pool = createParameterizedCollectionPool({ capacity: 4, create, dispose })

    const first = pool.acquire('pod-a', 'thread-1')
    const second = pool.acquire('pod-a', 'thread-1')

    expect(first.value).toBe(second.value)
    expect(create).toHaveBeenCalledOnce()
    first.release()
    expect(dispose).not.toHaveBeenCalled()
    second.release()
    expect(pool.getState()).toEqual({ size: 1, active: 0 })
  })

  it('isolates scopes and evicts only inactive least-recently-used instances', () => {
    const dispose = vi.fn()
    const pool = createParameterizedCollectionPool({
      capacity: 2,
      create: (scope: string, parameter: string) => ({ scope, parameter }),
      dispose,
    })
    const active = pool.acquire('pod-a', 'one')
    const old = pool.acquire('pod-a', 'two')
    old.release()
    const newest = pool.acquire('pod-b', 'two')

    expect(dispose).toHaveBeenCalledWith(expect.objectContaining({ scope: 'pod-a', parameter: 'two' }))
    expect(pool.getState()).toEqual({ size: 2, active: 2 })
    active.release()
    newest.release()
  })

  it('disposes inactive entries for a departed Pod scope', () => {
    const dispose = vi.fn()
    const pool = createParameterizedCollectionPool({
      capacity: 4,
      create: (scope: string, parameter: string) => ({ scope, parameter }),
      dispose,
    })
    const entry = pool.acquire('pod-a', 'one')
    entry.release()

    pool.disposeScope('pod-a')

    expect(dispose).toHaveBeenCalledOnce()
    expect(pool.getState().size).toBe(0)
  })
})
