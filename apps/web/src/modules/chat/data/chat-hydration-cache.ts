type ChatHydrationCacheOptions = {
  capacity: number
}

export function createChatHydrationCache<T>({ capacity }: ChatHydrationCacheOptions) {
  const entries = new Map<string, Promise<T>>()

  const touch = (key: string, value: Promise<T>) => {
    entries.delete(key)
    entries.set(key, value)
  }

  const evict = () => {
    while (entries.size > capacity) {
      const oldest = entries.keys().next().value
      if (oldest === undefined) return
      entries.delete(oldest)
    }
  }

  return {
    getOrLoad(key: string, load: () => Promise<T>): Promise<T> {
      const cached = entries.get(key)
      if (cached) {
        touch(key, cached)
        return cached
      }

      const pending = load().catch((error) => {
        if (entries.get(key) === pending) entries.delete(key)
        throw error
      })
      touch(key, pending)
      evict()
      return pending
    },
    invalidate(key: string) {
      entries.delete(key)
    },
    clear() {
      entries.clear()
    },
  }
}
