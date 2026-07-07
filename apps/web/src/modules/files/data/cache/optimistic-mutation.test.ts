import { describe, expect, it, vi } from 'vitest'
import { runOptimisticMutation } from './optimistic-mutation'

describe('Files optimistic mutation helper', () => {
  it('runs stage, mutate, commit, and invalidate in order', async () => {
    const events: string[] = []
    const result = await runOptimisticMutation({
      stage: vi.fn(async () => {
        events.push('stage')
        return { previous: 'state' }
      }),
      mutate: vi.fn(async () => {
        events.push('mutate')
        return { uri: 'https://pod.example/public/notes.md' }
      }),
      commit: vi.fn(async (resource) => {
        events.push(`commit:${resource.uri}`)
      }),
      restore: vi.fn(),
      invalidate: vi.fn(async ({ result: resource, error }) => {
        events.push(`invalidate:${resource?.uri}:${String(error)}`)
      }),
    })

    expect(result).toEqual({ uri: 'https://pod.example/public/notes.md' })
    expect(events).toEqual([
      'stage',
      'mutate',
      'commit:https://pod.example/public/notes.md',
      'invalidate:https://pod.example/public/notes.md:null',
    ])
  })

  it('restores the staged snapshot and still invalidates when mutate fails', async () => {
    const events: string[] = []
    const snapshot = { previous: 'state' }
    const mutationError = new Error('pod write failed')
    const restore = vi.fn(async (stagedSnapshot: typeof snapshot, error: unknown) => {
      events.push(`restore:${stagedSnapshot.previous}:${error instanceof Error ? error.message : String(error)}`)
    })
    const invalidate = vi.fn(async ({ result, error }) => {
      events.push(`invalidate:${String(result)}:${error instanceof Error ? error.message : String(error)}`)
    })

    await expect(runOptimisticMutation({
      stage: vi.fn(async () => {
        events.push('stage')
        return snapshot
      }),
      mutate: vi.fn(async () => {
        events.push('mutate')
        throw mutationError
      }),
      commit: vi.fn(async () => {
        events.push('commit')
      }),
      restore,
      invalidate,
    })).rejects.toThrow(mutationError)

    expect(restore).toHaveBeenCalledWith(snapshot, mutationError)
    expect(invalidate).toHaveBeenCalledWith({ result: null, error: mutationError })
    expect(events).toEqual([
      'stage',
      'mutate',
      'restore:state:pod write failed',
      'invalidate:null:pod write failed',
    ])
  })
})
