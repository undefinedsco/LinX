import {
  approvalResource,
  type SolidDatabase,
} from '@undefineds.co/models'
import type { createFilesResourceCacheInvalidationCollection } from '../cache/files-query-invalidation'

type FilesResourceCacheInvalidationCollection = ReturnType<typeof createFilesResourceCacheInvalidationCollection>

export interface FilesSubscriptionCollectionDeps {
  getDb: () => SolidDatabase | null
  filesResourceCacheInvalidationCollection: FilesResourceCacheInvalidationCollection
}

export function createFilesSubscriptionCollection({
  getDb,
  filesResourceCacheInvalidationCollection,
}: FilesSubscriptionCollectionDeps) {
  return {
    async subscribeToPod(): Promise<() => void> {
      const db = getDb()
      if (!db || typeof (db as any).subscribe !== 'function') {
        return () => undefined
      }

      try {
        const subscription = await (db as any).subscribe(approvalResource, {
          onCreate: () => { void filesResourceCacheInvalidationCollection.invalidateAllFilesRoots() },
          onUpdate: () => { void filesResourceCacheInvalidationCollection.invalidateAllFilesRoots() },
          onDelete: () => { void filesResourceCacheInvalidationCollection.invalidateAllFilesRoots() },
        })
        return () => subscription.unsubscribe()
      } catch (error) {
        console.warn('[filesOps] Failed to subscribe Files proposal dependencies:', error)
        return () => undefined
      }
    },
  }
}
