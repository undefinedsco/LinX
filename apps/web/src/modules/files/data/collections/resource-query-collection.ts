import type { QueryKey } from '@tanstack/react-query'
import type { SolidDatabase } from '@undefineds.co/models'
import type { FilesEntryScope } from '../../domain/list/entry-scope'
import type {
  FilesBlobResource,
  FilesDetail,
  FilesEntry,
  FilesRawTextResource,
  FilesRootData,
  FilesTreeNode,
} from '../pod-adapter'

export type FilesSelectedLocation = {
  kind: 'all' | 'recent' | 'local-workspace' | 'container'
  containerUri?: string
  localPath?: string
}

export interface FilesChatMessageProjectionInput {
  id?: string
  createdAt?: string | Date | null
  updatedAt?: string | Date | null
  richContent?: string | null
}

export interface FilesEntryListInput {
  entryScope: FilesEntryScope
  selection: FilesSelectedLocation
  workspaceUri?: string | null
  threadId?: string | null
  chatPodRootUri?: string | null
  messages?: FilesChatMessageProjectionInput[]
}

export interface FilesResourceQueryOptions<TData> {
  queryKey: QueryKey
  queryFn: () => Promise<TData>
  enabled: boolean
}

interface ResourceQueryKeyCollection {
  roots(workspaceUri?: string | null): QueryKey
  children(parentId?: string | null, containerUri?: string | null): QueryKey
  entries(input: {
    entryScope: FilesEntryScope
    selectedTreeNodeId: string
    workspaceUri?: string | null
    containerUri?: string | null
    localPath?: string | null
    chatPodRootUri?: string | null
    chatFileFingerprint?: string | null
  }): QueryKey
  detail(resourceUri?: string | null): QueryKey
  rawText(resourceUri?: string | null): QueryKey
  blob(resourceUri?: string | null): QueryKey
}

interface ResourceQueryResourceCollection {
  resolveCurrentPodRootUri(dbOverride?: SolidDatabase | null): string | null
  buildRoots(workspaceUri?: string | null, dbOverride?: SolidDatabase | null): Promise<FilesRootData>
  listChildTreeNodes(
    containerUri: string,
    parentId: string,
    podRootUri?: string | null,
    dbOverride?: SolidDatabase | null,
  ): Promise<FilesTreeNode[]>
  listEntries(input: FilesEntryListInput, dbOverride?: SolidDatabase | null): Promise<FilesEntry[]>
  readDetail(resourceUri: string, dbOverride?: SolidDatabase | null): Promise<FilesDetail>
  readRawText(resourceUri: string, dbOverride?: SolidDatabase | null): Promise<FilesRawTextResource>
  readBlob(resourceUri: string, dbOverride?: SolidDatabase | null): Promise<FilesBlobResource>
}

export interface ResourceQueryCollectionDependencies {
  filesResourceCollection: ResourceQueryResourceCollection
  filesResourceQueryKeys: ResourceQueryKeyCollection
}

export function createResourceQueryCollection(dependencies: ResourceQueryCollectionDependencies) {
  const {
    filesResourceCollection,
    filesResourceQueryKeys,
  } = dependencies

  return {
    resolveCurrentPodRootUri(dbOverride?: SolidDatabase | null): string | null {
      return filesResourceCollection.resolveCurrentPodRootUri(dbOverride)
    },

    roots(input: {
      workspaceUri?: string | null
      db?: SolidDatabase | null
    }): FilesResourceQueryOptions<FilesRootData> {
      return {
        queryKey: filesResourceQueryKeys.roots(input.workspaceUri),
        queryFn: async () => {
          if (!input.db) throw new Error('Database not connected')
          return filesResourceCollection.buildRoots(input.workspaceUri, input.db)
        },
        enabled: !!input.db,
      }
    },

    children(input: {
      parentNode?: Pick<FilesTreeNode, 'id' | 'type' | 'uri'> | null
      podRootUri?: string | null
      db?: SolidDatabase | null
    }): FilesResourceQueryOptions<FilesTreeNode[]> {
      const containerUri = input.parentNode?.uri && input.parentNode.type !== 'local-workspace'
        ? input.parentNode.uri
        : null

      return {
        queryKey: filesResourceQueryKeys.children(input.parentNode?.id, containerUri),
        queryFn: async () => {
          if (!input.db || !containerUri || !input.parentNode) return []
          return filesResourceCollection.listChildTreeNodes(
            containerUri,
            input.parentNode.id,
            input.podRootUri ?? null,
            input.db,
          )
        },
        enabled: !!input.db && !!containerUri && !!input.parentNode,
      }
    },

    entries(input: {
      entryScope: FilesEntryScope
      selectedTreeNodeId: string
      selection: FilesSelectedLocation
      workspaceUri?: string | null
      threadId?: string | null
      chatPodRootUri?: string | null
      messages?: FilesChatMessageProjectionInput[]
      chatFileFingerprint?: string | null
      db?: SolidDatabase | null
    }): FilesResourceQueryOptions<FilesEntry[]> {
      return {
        queryKey: filesResourceQueryKeys.entries({
          entryScope: input.entryScope,
          selectedTreeNodeId: input.selectedTreeNodeId,
          workspaceUri: input.workspaceUri,
          containerUri: input.selection.containerUri,
          localPath: input.selection.localPath,
          chatPodRootUri: input.chatPodRootUri,
          chatFileFingerprint: input.chatFileFingerprint,
        }),
        queryFn: async () => {
          if (!input.db) return []
          return filesResourceCollection.listEntries({
            entryScope: input.entryScope,
            selection: input.selection,
            workspaceUri: input.workspaceUri,
            threadId: input.threadId,
            chatPodRootUri: input.chatPodRootUri,
            messages: input.messages ?? [],
          }, input.db)
        },
        enabled: !!input.db && (input.entryScope !== 'chat-files' || !!input.workspaceUri || !!input.chatPodRootUri),
      }
    },

    detail(input: {
      fileUri?: string | null
      db?: SolidDatabase | null
    }): FilesResourceQueryOptions<FilesDetail> {
      return {
        queryKey: filesResourceQueryKeys.detail(input.fileUri),
        queryFn: async () => {
          if (!input.db || !input.fileUri) throw new Error('No file selected')
          return filesResourceCollection.readDetail(input.fileUri, input.db)
        },
        enabled: !!input.db && !!input.fileUri,
      }
    },

    rawText(input: {
      fileUri?: string | null
      enabled?: boolean
      db?: SolidDatabase | null
    }): FilesResourceQueryOptions<FilesRawTextResource> {
      const enabled = input.enabled ?? true
      return {
        queryKey: filesResourceQueryKeys.rawText(input.fileUri),
        queryFn: async () => {
          if (!input.db || !input.fileUri) throw new Error('No file selected')
          return filesResourceCollection.readRawText(input.fileUri, input.db)
        },
        enabled: !!input.db && !!input.fileUri && enabled,
      }
    },

    blob(input: {
      fileUri?: string | null
      enabled?: boolean
      db?: SolidDatabase | null
    }): FilesResourceQueryOptions<FilesBlobResource> {
      const enabled = input.enabled ?? true
      return {
        queryKey: filesResourceQueryKeys.blob(input.fileUri),
        queryFn: async () => {
          if (!input.db || !input.fileUri) throw new Error('No file selected')
          return filesResourceCollection.readBlob(input.fileUri, input.db)
        },
        enabled: !!input.db && !!input.fileUri && enabled,
      }
    },
  }
}
