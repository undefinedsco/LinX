import { describe, expect, it, vi } from 'vitest'
import { createChatHydrationCache } from './chat-hydration-cache'

describe('chat hydration cache', () => {
  it('deduplicates concurrent and repeated hydration by canonical chat IRI', async () => {
    const cache = createChatHydrationCache<{ participants: string[] }>({ capacity: 4 })
    const load = vi.fn(async () => ({ participants: ['https://pod.example/alice#me'] }))

    const [first, second] = await Promise.all([
      cache.getOrLoad('https://pod.example/chats/one#it', load),
      cache.getOrLoad('https://pod.example/chats/one#it', load),
    ])
    const third = await cache.getOrLoad('https://pod.example/chats/one#it', load)

    expect(first).toEqual(second)
    expect(third).toEqual(first)
    expect(load).toHaveBeenCalledOnce()
  })

  it('invalidates before the next hydration and keeps separate Pod scopes isolated', async () => {
    const cache = createChatHydrationCache<{ revision: number }>({ capacity: 4 })
    const load = vi.fn()
      .mockResolvedValueOnce({ revision: 1 })
      .mockResolvedValueOnce({ revision: 2 })
      .mockResolvedValueOnce({ revision: 3 })

    await cache.getOrLoad('https://pod-a.example/chats/one#it', load)
    await cache.getOrLoad('https://pod-b.example/chats/one#it', load)
    cache.invalidate('https://pod-a.example/chats/one#it')

    await expect(cache.getOrLoad('https://pod-a.example/chats/one#it', load)).resolves.toEqual({ revision: 3 })
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('evicts the least recently used resolved entry', async () => {
    const cache = createChatHydrationCache<number>({ capacity: 2 })
    const load = vi.fn(async (value: number) => value)
    await cache.getOrLoad('a', () => load(1))
    await cache.getOrLoad('b', () => load(2))
    await cache.getOrLoad('a', () => load(1))
    await cache.getOrLoad('c', () => load(3))
    await cache.getOrLoad('b', () => load(2))

    expect(load).toHaveBeenCalledTimes(4)
  })
})
