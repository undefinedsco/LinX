import {
  createCollectionSnapshotPersister,
  createIndexedDbCollectionSnapshotStorage,
} from '@linx/stores'

let storage: ReturnType<typeof createIndexedDbCollectionSnapshotStorage> | null = null

function getStorage() {
  if (!storage) {
    storage = typeof indexedDB === 'undefined'
      ? {
        get: async () => null,
        set: async () => undefined,
        delete: async () => undefined,
        entries: async () => [],
      }
      : createIndexedDbCollectionSnapshotStorage()
  }
  return storage
}

function encodeSnapshotValue(isDate: boolean, value: unknown): unknown {
  return isDate && value instanceof Date ? value.toISOString() : value
}

export function createPodCollectionSnapshot<T extends { id?: string }>(
  scopeKey: () => string | null,
  dateFields: readonly (keyof T & string)[],
) {
  const dates = new Set<string>(dateFields)
  return {
    scopeKey,
    persister: createCollectionSnapshotPersister<T>(getStorage(), {
      version: 1,
      maxEntries: 96,
      maxBytes: 8 * 1024 * 1024,
      codec: {
        encode: (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [
          key,
          encodeSnapshotValue(dates.has(key), value),
        ])),
        decode: (value) => {
          if (!value || typeof value !== 'object' || typeof (value as { id?: unknown }).id !== 'string') {
            throw new Error('Invalid collection snapshot row.')
          }
          return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
            key,
            dates.has(key) && typeof item === 'string' ? new Date(item) : item,
          ])) as T
        },
      },
    }),
  }
}

export async function clearAllPodCollectionSnapshots() {
  const persister = createCollectionSnapshotPersister<never>(getStorage(), {
    version: 1,
    codec: {
      encode: () => null,
      decode: () => { throw new Error('Snapshot decoding is not used during clear.') },
    },
  })
  await persister.clearAll()
}
