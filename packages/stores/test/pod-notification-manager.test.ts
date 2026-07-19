import { describe, expect, it, vi } from 'vitest'
import { PodNotificationManager } from '../src/pod-notification-manager'

describe('PodNotificationManager', () => {
  it('shares one underlying channel for duplicate resource registrations', async () => {
    const unsubscribe = vi.fn()
    const subscribe = vi.fn().mockResolvedValue({ unsubscribe })
    const manager = new PodNotificationManager({ subscribe } as any)
    const resource = {}

    const first = await manager.register(resource, {})
    const second = await manager.register(resource, {})

    expect(subscribe).toHaveBeenCalledOnce()
    expect(manager.activeChannelCount).toBe(1)
    first()
    expect(unsubscribe).not.toHaveBeenCalled()
    second()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('fans notifications out to every resource listener', async () => {
    let callbacks: any
    const subscribe = vi.fn(async (_resource: object, nextCallbacks: unknown) => {
      callbacks = nextCallbacks
      return { unsubscribe: vi.fn() }
    })
    const manager = new PodNotificationManager({ subscribe } as any)
    const first = vi.fn()
    const second = vi.fn()
    const resource = {}

    await manager.register(resource, { onUpdate: first })
    await manager.register(resource, { onUpdate: second })
    callbacks.onUpdate({ object: 'urn:test' })

    expect(first).toHaveBeenCalledWith({ object: 'urn:test' })
    expect(second).toHaveBeenCalledWith({ object: 'urn:test' })
  })

  it('enforces its channel budget without disturbing existing channels', async () => {
    const subscribe = vi.fn().mockResolvedValue({ unsubscribe: vi.fn() })
    const manager = new PodNotificationManager({ subscribe } as any, 1)
    await manager.register({}, {})

    await expect(manager.register({}, {})).rejects.toThrow('channel budget exceeded')
    expect(manager.activeChannelCount).toBe(1)
  })
})
