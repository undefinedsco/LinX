export interface CollectionSnapshotStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  entries(): Promise<Array<[string, string]>>
}

export interface CollectionSnapshot<T> {
  version: number
  queryKey: readonly unknown[]
  scopeKey: string
  rows: T[]
  nextCursor: unknown | null
  residentPageCount: number
  savedAt: number
}

export interface CollectionSnapshotPersister<T> {
  load(queryKey: readonly unknown[], scopeKey: string): Promise<CollectionSnapshot<T> | null>
  save(snapshot: Omit<CollectionSnapshot<T>, 'version' | 'savedAt'>): Promise<void>
  clear(scopeKey: string): Promise<void>
  clearAll(): Promise<void>
}

type SnapshotCodec<T> = {
  encode(row: T): unknown
  decode(value: unknown): T
}

type StoredSnapshot = Omit<CollectionSnapshot<unknown>, 'rows'> & { rows: unknown[] }

const PREFIX = 'linx:collection-snapshot:'

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') {
    throw new Error('Collection snapshot keys must contain only stable JSON values.')
  }
  return JSON.stringify(value)
}

function storageKey(version: number, scopeKey: string, queryKey: readonly unknown[]) {
  return `${PREFIX}${canonicalJson([version, scopeKey, queryKey])}`
}

export function createCollectionSnapshotPersister<T>(
  storage: CollectionSnapshotStorage,
  options: {
    version: number
    codec: SnapshotCodec<T>
    ttlMs?: number
    maxEntries?: number
    maxBytes?: number
    now?: () => number
  },
): CollectionSnapshotPersister<T> {
  const now = options.now ?? Date.now
  const ttlMs = options.ttlMs ?? 7 * 24 * 60 * 60 * 1_000
  const maxEntries = options.maxEntries ?? 64
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024

  const enforceCapacity = async () => {
    const records = (await storage.entries())
      .filter(([key]) => key.startsWith(PREFIX))
      .map(([key, value]) => {
        let savedAt = 0
        try { savedAt = (JSON.parse(value) as StoredSnapshot).savedAt ?? 0 } catch { /* invalid rows are oldest */ }
        return { key, value, savedAt, bytes: new TextEncoder().encode(value).byteLength }
      })
      .sort((left, right) => right.savedAt - left.savedAt)
    let bytes = 0
    for (const [index, record] of records.entries()) {
      bytes += record.bytes
      if (index >= maxEntries || bytes > maxBytes) await storage.delete(record.key)
    }
  }

  return {
    async load(queryKey, scopeKey) {
      const key = storageKey(options.version, scopeKey, queryKey)
      const raw = await storage.get(key)
      if (!raw) return null
      try {
        const stored = JSON.parse(raw) as StoredSnapshot
        if (stored.version !== options.version || stored.scopeKey !== scopeKey || now() - stored.savedAt > ttlMs) {
          await storage.delete(key)
          return null
        }
        return {
          ...stored,
          rows: stored.rows.map(options.codec.decode),
        }
      } catch {
        await storage.delete(key)
        return null
      }
    },
    async save(snapshot) {
      const stored: StoredSnapshot = {
        ...snapshot,
        version: options.version,
        savedAt: now(),
        rows: snapshot.rows.map(options.codec.encode),
      }
      await storage.set(storageKey(options.version, snapshot.scopeKey, snapshot.queryKey), JSON.stringify(stored))
      await enforceCapacity()
    },
    async clear(scopeKey) {
      const records = await storage.entries()
      await Promise.all(records.map(async ([key, value]) => {
        if (!key.startsWith(PREFIX)) return
        try {
          if ((JSON.parse(value) as StoredSnapshot).scopeKey === scopeKey) await storage.delete(key)
        } catch {
          await storage.delete(key)
        }
      }))
    },
    async clearAll() {
      const records = await storage.entries()
      await Promise.all(records
        .filter(([key]) => key.startsWith(PREFIX))
        .map(([key]) => storage.delete(key)))
    },
  }
}

export function createIndexedDbCollectionSnapshotStorage(
  databaseName = 'linx-collection-snapshots',
): CollectionSnapshotStorage {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const request = <T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) => (
    open().then((db) => new Promise<T>((resolve, reject) => {
      const tx = db.transaction('snapshots', mode)
      const result = operation(tx.objectStore('snapshots'))
      result.onsuccess = () => resolve(result.result)
      result.onerror = () => reject(result.error)
      tx.oncomplete = () => db.close()
    }))
  )
  return {
    get: async (key) => (await request('readonly', (store) => store.get(key)) as string | undefined) ?? null,
    set: async (key, value) => { await request('readwrite', (store) => store.put(value, key)) },
    delete: async (key) => { await request('readwrite', (store) => store.delete(key)) },
    entries: async () => request('readonly', (store) => store.getAllKeys()).then(async (keys) => {
      const values = await Promise.all(keys.map(async (key) => [String(key), await request('readonly', (store) => store.get(key)) as string] as [string, string]))
      return values
    }),
  }
}
