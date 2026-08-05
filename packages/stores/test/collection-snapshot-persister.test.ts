// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  createCollectionSnapshotPersister,
  type CollectionSnapshotStorage,
} from '../src/collection-snapshot-persister'

function createMemoryStorage(): CollectionSnapshotStorage {
  const values = new Map<string, string>()
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value) },
    delete: async (key) => { values.delete(key) },
    entries: async () => [...values.entries()],
  }
}

const codec = {
  encode: (row: { id: string; updatedAt: Date }) => ({ id: row.id, updatedAt: row.updatedAt.toISOString() }),
  decode: (value: unknown) => {
    const row = value as { id?: unknown; updatedAt?: unknown }
    if (typeof row.id !== 'string' || typeof row.updatedAt !== 'string') throw new Error('invalid row')
    return { id: row.id, updatedAt: new Date(row.updatedAt) }
  },
}

describe('collection snapshot persister', () => {
  it('round-trips rows with an explicit codec and isolates Pod scopes', async () => {
    const persister = createCollectionSnapshotPersister(createMemoryStorage(), {
      version: 2,
      codec,
      now: () => 1_000,
    })
    await persister.save({
      scopeKey: 'pod-a', queryKey: ['messages', 'thread/a'],
      rows: [{ id: 'one', updatedAt: new Date('2026-01-01T00:00:00Z') }],
      nextCursor: null, residentPageCount: 1,
    })

    await expect(persister.load(['messages', 'thread/a'], 'pod-a')).resolves.toEqual(expect.objectContaining({
      rows: [{ id: 'one', updatedAt: new Date('2026-01-01T00:00:00Z') }],
      savedAt: 1_000,
    }))
    await expect(persister.load(['messages', 'thread/a'], 'pod-b')).resolves.toBeNull()
  })

  it('expires old or differently versioned records', async () => {
    const storage = createMemoryStorage()
    const first = createCollectionSnapshotPersister(storage, { version: 1, codec, now: () => 1_000, ttlMs: 100 })
    await first.save({ scopeKey: 'pod', queryKey: ['chat'], rows: [], nextCursor: null, residentPageCount: 0 })

    const expired = createCollectionSnapshotPersister(storage, { version: 1, codec, now: () => 1_101, ttlMs: 100 })
    await expect(expired.load(['chat'], 'pod')).resolves.toBeNull()
    const upgraded = createCollectionSnapshotPersister(storage, { version: 2, codec, now: () => 1_000 })
    await expect(upgraded.load(['chat'], 'pod')).resolves.toBeNull()
  })

  it('uses canonical keys and clears only the requested scope', async () => {
    const storage = createMemoryStorage()
    const persister = createCollectionSnapshotPersister(storage, { version: 1, codec })
    const row = { id: 'one', updatedAt: new Date(0) }
    await persister.save({ scopeKey: 'pod-a', queryKey: ['a/b', 'c'], rows: [row], nextCursor: null, residentPageCount: 1 })
    await persister.save({ scopeKey: 'pod-a', queryKey: ['a', 'b/c'], rows: [row], nextCursor: null, residentPageCount: 1 })
    await persister.save({ scopeKey: 'pod-b', queryKey: ['a/b', 'c'], rows: [row], nextCursor: null, residentPageCount: 1 })

    await persister.clear('pod-a')

    await expect(persister.load(['a/b', 'c'], 'pod-a')).resolves.toBeNull()
    await expect(persister.load(['a', 'b/c'], 'pod-a')).resolves.toBeNull()
    await expect(persister.load(['a/b', 'c'], 'pod-b')).resolves.not.toBeNull()
    await persister.clearAll()
    await expect(persister.load(['a/b', 'c'], 'pod-b')).resolves.toBeNull()
  })
})
