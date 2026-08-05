type PoolOptions<T> = {
  capacity: number
  create: (scope: string, parameter: string) => T
  dispose: (value: T) => void
}

type PoolEntry<T> = {
  value: T
  references: number
  lastAccessed: number
}

export function createParameterizedCollectionPool<T>({ capacity, create, dispose }: PoolOptions<T>) {
  const entries = new Map<string, PoolEntry<T>>()
  let sequence = 0
  const entryKey = (scope: string, parameter: string) => `${scope}\u0000${parameter}`

  const evict = () => {
    while (entries.size > capacity) {
      const candidate = [...entries.entries()]
        .filter(([, entry]) => entry.references === 0)
        .sort((left, right) => left[1].lastAccessed - right[1].lastAccessed)[0]
      if (!candidate) return
      entries.delete(candidate[0])
      dispose(candidate[1].value)
    }
  }

  return {
    getOrCreate(scope: string, parameter: string) {
      const key = entryKey(scope, parameter)
      let entry = entries.get(key)
      if (!entry) {
        entry = { value: create(scope, parameter), references: 0, lastAccessed: 0 }
        entries.set(key, entry)
      }
      entry.lastAccessed = ++sequence
      evict()
      return entry.value
    },
    retain(scope: string, parameter: string) {
      const key = entryKey(scope, parameter)
      let entry = entries.get(key)
      if (!entry) {
        entry = { value: create(scope, parameter), references: 0, lastAccessed: 0 }
        entries.set(key, entry)
      }
      entry.references += 1
      entry.lastAccessed = ++sequence

      let released = false
      return () => {
        if (released) return
        released = true
        entry!.references -= 1
        entry!.lastAccessed = ++sequence
        evict()
      }
    },
    acquire(scope: string, parameter: string) {
      const value = this.getOrCreate(scope, parameter)
      return { value, release: this.retain(scope, parameter) }
    },
    disposeScope(scope: string) {
      const prefix = `${scope}\u0000`
      for (const [key, entry] of entries) {
        if (!key.startsWith(prefix) || entry.references > 0) continue
        entries.delete(key)
        dispose(entry.value)
      }
    },
    getState() {
      return {
        size: entries.size,
        active: [...entries.values()].filter((entry) => entry.references > 0).length,
      }
    },
  }
}
