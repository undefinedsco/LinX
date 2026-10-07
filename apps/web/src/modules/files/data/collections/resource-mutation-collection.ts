import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { SolidDatabase } from '@undefineds.co/models'
import type {
  FilesDetail,
  FilesFolderCreateInput,
  FilesRawTextResource,
  FilesResourceTransferInput,
} from '../pod-adapter'
import type { createFilesEntryCacheCollection } from '../cache/files-entry-cache'
import { runOptimisticMutation } from '../cache/optimistic-mutation'
import { createRawTextResourceWithCache } from '../cache/resource-query-cache'

type FilesEntryCacheCollection = ReturnType<typeof createFilesEntryCacheCollection>

interface ResourceMutationResourceCollection {
  resolveCurrentPodRootUri(dbOverride?: SolidDatabase | null): string | null
  saveRawText(
    resource: Pick<FilesRawTextResource, 'uri' | 'mimeType' | 'etag'>,
    content: string,
    dbOverride?: SolidDatabase | null,
  ): Promise<FilesRawTextResource>
  createRawText(
    resource: Pick<FilesRawTextResource, 'uri' | 'mimeType'>,
    content: string,
    dbOverride?: SolidDatabase | null,
  ): Promise<FilesRawTextResource>
  createBlob(
    resource: Pick<FilesRawTextResource, 'uri' | 'mimeType'>,
    content: Blob,
    dbOverride?: SolidDatabase | null,
  ): Promise<FilesDetail>
  copy(input: FilesResourceTransferInput, dbOverride?: SolidDatabase | null): Promise<FilesDetail>
  move(input: FilesResourceTransferInput, dbOverride?: SolidDatabase | null): Promise<FilesDetail>
  delete(resourceUri: string, dbOverride?: SolidDatabase | null): Promise<void>
  createFolder(input: FilesFolderCreateInput, dbOverride?: SolidDatabase | null): Promise<FilesDetail>
}

export interface ResourceMutationCollectionDependencies {
  rawTextQueryRoot: QueryKey
  filesResourceCollection: ResourceMutationResourceCollection
  filesEntryCacheCollection: FilesEntryCacheCollection
}

export function createResourceMutationCollection(dependencies: ResourceMutationCollectionDependencies) {
  const {
    rawTextQueryRoot,
    filesResourceCollection,
    filesEntryCacheCollection,
  } = dependencies

  return {
    async saveRawText(input: {
      cacheClient: QueryClient
      db?: SolidDatabase | null
      resource: Pick<FilesRawTextResource, 'uri' | 'mimeType' | 'etag'>
      content: string
    }): Promise<FilesRawTextResource> {
      return runOptimisticMutation({
        stage: () => filesEntryCacheCollection.stageRawTextSave(input.cacheClient, {
          resource: input.resource,
          content: input.content,
        }),
        mutate: () => filesResourceCollection.saveRawText(input.resource, input.content, input.db),
        commit: (resource) => filesEntryCacheCollection.commitRawTextSave(input.cacheClient, resource),
        restore: (snapshot) => {
          filesEntryCacheCollection.restore(input.cacheClient, snapshot)
        },
        invalidate: ({ result }) => result
          ? filesEntryCacheCollection.invalidateRawTextResource(input.cacheClient, result.uri)
          : undefined,
      })
    },

    async createRawText(input: {
      cacheClient: QueryClient
      db?: SolidDatabase | null
      resource: Pick<FilesRawTextResource, 'uri' | 'mimeType'>
      content: string
    }): Promise<FilesRawTextResource> {
      const podRootUri = filesResourceCollection.resolveCurrentPodRootUri(input.db)
      return createRawTextResourceWithCache({
        cacheClient: input.cacheClient,
        rawTextQueryRoot,
        entryCacheCollection: filesEntryCacheCollection,
        podRootUri,
        resource: input.resource,
        content: input.content,
        create: () => filesResourceCollection.createRawText(input.resource, input.content, input.db),
      })
    },

    async createBlob(input: {
      cacheClient: QueryClient
      db?: SolidDatabase | null
      resource: Pick<FilesRawTextResource, 'uri' | 'mimeType'>
      content: Blob
    }): Promise<FilesDetail> {
      const podRootUri = filesResourceCollection.resolveCurrentPodRootUri(input.db)
      return runOptimisticMutation({
        stage: () => filesEntryCacheCollection.stageResourceCreate(input.cacheClient, {
          uri: input.resource.uri,
          kind: 'resource',
          mimeType: input.resource.mimeType,
          podRootUri,
          size: input.content.size,
        }),
        mutate: () => filesResourceCollection.createBlob(input.resource, input.content, input.db),
        commit: (resource) => filesEntryCacheCollection.commitResourceCreate(input.cacheClient, {
          uri: resource.uri,
          kind: 'resource',
          mimeType: resource.mimeType,
          podRootUri,
          size: resource.size,
        }),
        restore: (snapshot) => filesEntryCacheCollection.restore(input.cacheClient, snapshot),
        invalidate: () => filesEntryCacheCollection.invalidateResourceCreate(input.cacheClient, input.resource.uri),
      })
    },

    async copy(input: {
      cacheClient: QueryClient
      db?: SolidDatabase | null
      transfer: FilesResourceTransferInput
    }): Promise<FilesDetail> {
      return runOptimisticMutation({
        stage: () => filesEntryCacheCollection.stageTransfer(input.cacheClient, input.transfer, 'copy'),
        mutate: () => filesResourceCollection.copy(input.transfer, input.db),
        commit: (resource) => filesEntryCacheCollection.commitTransfer(input.cacheClient, resource, input.transfer, 'copy'),
        restore: (snapshot) => filesEntryCacheCollection.restore(input.cacheClient, snapshot),
        invalidate: () => filesEntryCacheCollection.invalidateTransfer(input.cacheClient, input.transfer),
      })
    },

    async move(input: {
      cacheClient: QueryClient
      db?: SolidDatabase | null
      transfer: FilesResourceTransferInput
    }): Promise<FilesDetail> {
      return runOptimisticMutation({
        stage: () => filesEntryCacheCollection.stageTransfer(input.cacheClient, input.transfer, 'move'),
        mutate: () => filesResourceCollection.move(input.transfer, input.db),
        commit: (resource) => filesEntryCacheCollection.commitTransfer(input.cacheClient, resource, input.transfer, 'move'),
        restore: (snapshot) => filesEntryCacheCollection.restore(input.cacheClient, snapshot),
        invalidate: () => filesEntryCacheCollection.invalidateTransfer(input.cacheClient, input.transfer),
      })
    },

    async delete(input: {
      cacheClient: QueryClient
      db?: SolidDatabase | null
      resourceUri: string
    }): Promise<string> {
      return runOptimisticMutation({
        stage: () => filesEntryCacheCollection.stageDelete(input.cacheClient, input.resourceUri),
        mutate: async () => {
          await filesResourceCollection.delete(input.resourceUri, input.db)
          return input.resourceUri
        },
        restore: (snapshot) => filesEntryCacheCollection.restore(input.cacheClient, snapshot),
        invalidate: () => filesEntryCacheCollection.invalidateDelete(input.cacheClient, input.resourceUri),
      })
    },

    async createFolder(input: {
      cacheClient: QueryClient
      db?: SolidDatabase | null
      folder: FilesFolderCreateInput
    }): Promise<FilesDetail> {
      const podRootUri = filesResourceCollection.resolveCurrentPodRootUri(input.db)
      return runOptimisticMutation({
        stage: () => filesEntryCacheCollection.stageFolderCreate(
          input.cacheClient,
          input.folder,
          podRootUri,
        ),
        mutate: () => filesResourceCollection.createFolder(input.folder, input.db),
        commit: (folder) => filesEntryCacheCollection.commitFolderCreate(input.cacheClient, folder),
        restore: (snapshot) => filesEntryCacheCollection.restore(input.cacheClient, snapshot),
        invalidate: ({ result }) => filesEntryCacheCollection.invalidateFolderCreate(input.cacheClient, input.folder, result),
      })
    },
  }
}
