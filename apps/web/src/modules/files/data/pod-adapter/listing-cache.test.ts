import { describe, expect, it, vi } from 'vitest'

const adapter = vi.hoisted(() => ({
  createRawTextResource: vi.fn(async (_db: unknown, resource: { uri: string }) => ({ uri: resource.uri })),
  createFolderResource: vi.fn(async () => ({ uri: 'folder' })),
  deleteFileResource: vi.fn(async () => undefined),
  invalidateContainerListingCache: vi.fn(async () => undefined),
}))
vi.mock('../pod-adapter', () => adapter)

import { createResourceCollection } from '../collections/resource-collection'
import { invalidateContainerListingCache } from './pod-runtime'

describe('container listing cache', () => {
  it('drops drizzle-solid HTTP cache so a listing right after a Files write sees it', async () => {
    const invalidateHttpCache = vi.fn(async () => undefined)
    const db = { getDialect: () => ({ sparqlExecutor: { invalidateHttpCache } }) } as any

    await invalidateContainerListingCache(db)

    expect(invalidateHttpCache).toHaveBeenCalledTimes(1)
  })

  it('does not fail the write when the dialect has no cache to drop', async () => {
    await expect(invalidateContainerListingCache({ getDialect: () => ({}) } as any)).resolves.toBeUndefined()
  })

  it('drops the cache after creating, making a folder and deleting', async () => {
    const db = {} as any
    const collection = createResourceCollection({ getDb: () => db, confirmedEntryTransferOverlays: {} as any })

    await collection.createRawText({ uri: 'http://localhost:3000/test/a.md', mimeType: 'text/markdown' }, '# a')
    await collection.createFolder({ containerUri: 'http://localhost:3000/test/', name: 'work' } as any)
    await collection.delete('http://localhost:3000/test/a.md')

    expect(adapter.invalidateContainerListingCache).toHaveBeenCalledTimes(3)
  })
})
