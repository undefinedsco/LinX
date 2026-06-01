import { describe, expect, it } from 'vitest'
import { createPodCollectionSyncTracker } from './pod-collection-sync'

describe('PodCollectionSyncTracker', () => {
  it('models collection fetch as core-to-local projection sync', async () => {
    const tracker = createPodCollectionSyncTracker({
      queryKey: ['inbox', 'approvals'],
      now: () => new Date('2026-05-21T00:00:00.000Z'),
    })

    const rows = await tracker.runCoreRead('fetch', () => [{ id: 'approval-1' }])
    const result = tracker.getLastResult()

    expect(rows).toEqual([{ id: 'approval-1' }])
    expect(result).toMatchObject({
      source: 'pod',
      target: 'app-collection:inbox/approvals',
      direction: 'core-to-local',
      plane: 'projection',
      authority: 'core',
      status: 'completed',
      attempted: 1,
      applied: 1,
    })
  })

  it('models collection mutations as local-to-core projection sync and preserves failures', async () => {
    const tracker = createPodCollectionSyncTracker({
      queryKey: ['inbox', 'approvals'],
      now: () => new Date('2026-05-21T00:00:00.000Z'),
    })

    await expect(tracker.runCoreWrite('update', () => {
      throw new Error('pod unavailable')
    })).rejects.toThrow('pod unavailable')

    const result = tracker.getLastResult()
    expect(result).toMatchObject({
      source: 'app-collection:inbox/approvals',
      target: 'pod',
      direction: 'local-to-core',
      plane: 'projection',
      authority: 'core',
      status: 'failed',
      attempted: 1,
      failed: 1,
    })
    expect(result?.failures[0]?.message).toContain('pod unavailable')
  })

  it('models Pod subscription invalidation as core-to-local sync', async () => {
    const tracker = createPodCollectionSyncTracker({
      queryKey: ['inbox', 'notifications'],
      now: () => new Date('2026-05-21T00:00:00.000Z'),
    })
    let invalidated = false

    await tracker.runCoreRead('subscription.update', () => {
      invalidated = true
    }, {
      object: 'https://pod.example/.data/inbox/1.ttl',
    })

    expect(invalidated).toBe(true)
    expect(tracker.getLastResult()).toMatchObject({
      source: 'pod',
      target: 'app-collection:inbox/notifications',
      direction: 'core-to-local',
      plane: 'projection',
      authority: 'core',
      status: 'completed',
    })
  })
})
