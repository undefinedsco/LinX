import type { QueryClient } from '@tanstack/react-query'
import type { SolidDatabase } from '@undefineds.co/models'
import type { StructuredViewMetadata } from '../../domain/structured/structured-view-metadata'
import {
  saveStructuredViewMetadata as saveStructuredViewMetadataResource,
  type FilesDetail,
  type FilesStructuredViewMetadataSidecar,
} from '../pod-adapter'
import { runOptimisticMutation } from '../cache/optimistic-mutation'
import type { createStructuredViewMetadataCacheCollection } from '../cache/structured-view-metadata-cache'

type FilesStructuredViewMetadataCacheCollection = ReturnType<typeof createStructuredViewMetadataCacheCollection>

export interface SidecarMutationCollectionDependencies {
  filesStructuredViewMetadataCacheCollection: FilesStructuredViewMetadataCacheCollection
}

export function createSidecarMutationCollection(dependencies: SidecarMutationCollectionDependencies) {
  const {
    filesStructuredViewMetadataCacheCollection,
  } = dependencies

  function requireFilesDb(db?: SolidDatabase | null): SolidDatabase {
    if (!db) throw new Error('Database not connected')
    return db
  }

  return {
    async saveStructuredViewMetadata(input: {
      cacheClient: QueryClient
      db?: SolidDatabase | null
      file: Pick<FilesDetail, 'uri' | 'kind'>
      metadata: StructuredViewMetadata
    }): Promise<FilesStructuredViewMetadataSidecar> {
      return runOptimisticMutation({
        stage: () => filesStructuredViewMetadataCacheCollection.stageSave(
          input.cacheClient,
          input.file,
          input.metadata,
        ),
        mutate: () => saveStructuredViewMetadataResource(
          requireFilesDb(input.db),
          input.file,
          input.metadata,
        ),
        commit: (sidecar) => filesStructuredViewMetadataCacheCollection.commitSave(input.cacheClient, sidecar),
        restore: (snapshot) => filesStructuredViewMetadataCacheCollection.restore(input.cacheClient, snapshot),
        invalidate: ({ result }) => result
          ? filesStructuredViewMetadataCacheCollection.invalidateSave(input.cacheClient, result)
          : undefined,
      })
    },
  }
}
