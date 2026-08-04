export type CollectionSubscriptionRelease = () => void | Promise<void>

export interface CollectionSubscriptionLeaseState {
  references: number
  connected: boolean
  releasePending: boolean
}

export interface CollectionSubscriptionLease<TKey> {
  acquire(key: TKey): Promise<CollectionSubscriptionRelease>
  dispose(): Promise<void>
  getState(key: TKey): CollectionSubscriptionLeaseState
}

interface LeaseEntry {
  references: number
  connection: Promise<CollectionSubscriptionRelease>
  releaseTimer: ReturnType<typeof setTimeout> | null
}

export function createCollectionSubscriptionLease<TKey>(
  connect: (key: TKey) => Promise<CollectionSubscriptionRelease>,
  options: { graceMs?: number } = {},
): CollectionSubscriptionLease<TKey> {
  const graceMs = options.graceMs ?? 250
  const entries = new Map<TKey, LeaseEntry>()

  const disconnect = async (key: TKey, entry: LeaseEntry): Promise<void> => {
    if (entry.references > 0 || entries.get(key) !== entry) return
    const release = await entry.connection
    if (entry.references > 0 || entries.get(key) !== entry) return
    entries.delete(key)
    await release()
  }

  return {
    async acquire(key) {
      let entry = entries.get(key)
      if (!entry) {
        entry = {
          references: 0,
          connection: Promise.resolve().then(() => connect(key)),
          releaseTimer: null,
        }
        entries.set(key, entry)
        void entry.connection.catch(() => {
          if (entries.get(key) === entry) entries.delete(key)
        })
      }

      if (entry.releaseTimer) {
        clearTimeout(entry.releaseTimer)
        entry.releaseTimer = null
      }
      entry.references += 1

      try {
        await entry.connection
      } catch (error) {
        entry.references -= 1
        throw error
      }

      let released = false
      return async () => {
        if (released) return
        released = true
        entry.references -= 1
        if (entry.references > 0 || entry.releaseTimer) return

        if (graceMs <= 0) {
          await disconnect(key, entry)
        } else {
          entry.releaseTimer = setTimeout(() => {
            entry.releaseTimer = null
            void disconnect(key, entry)
          }, graceMs)
        }
      }
    },

    async dispose() {
      const pending = [...entries.entries()].map(async ([key, entry]) => {
        if (entry.releaseTimer) clearTimeout(entry.releaseTimer)
        entry.releaseTimer = null
        entry.references = 0
        await disconnect(key, entry)
      })
      await Promise.all(pending)
    },

    getState(key) {
      const entry = entries.get(key)
      return {
        references: entry?.references ?? 0,
        connected: !!entry,
        releasePending: !!entry?.releaseTimer,
      }
    },
  }
}
