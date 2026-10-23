import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { createConfirmedEntryTransferOverlayStore } from './entry-transfer-overlays'
import { createFilesEntryCacheCollection } from './files-entry-cache'
import { FILES_COLLECTION_QUERY_KEYS } from '../collections/query-keys'

describe('refreshing the file tree after a create', () => {
  it('invalidates the root listing the tree is seeded from, not only the entry lists', async () => {
    const cache = createFilesEntryCacheCollection(FILES_COLLECTION_QUERY_KEYS, createConfirmedEntryTransferOverlayStore())
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    await cache.invalidateResourceCreate(client, 'http://localhost:3000/test/任务.ttl')
    await cache.invalidateFolderCreate(client, { containerUri: 'http://localhost:3000/test/', name: 'work' } as any, { uri: 'http://localhost:3000/test/work/' } as any)
    await cache.invalidateDelete(client, 'http://localhost:3000/test/任务.ttl')

    const keys = invalidate.mock.calls.map((call) => JSON.stringify((call[0] as { queryKey: unknown }).queryKey))
    expect(keys.filter((key) => key === JSON.stringify(FILES_COLLECTION_QUERY_KEYS.roots)).length).toBeGreaterThanOrEqual(3)
  })
})
