import type { SolidDatabase } from '@undefineds.co/models'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { mergeChatFileEntries, projectChatFileEntries } from '../../domain/list/chat-files-projection'
import { getParentContainerUri } from '../../domain/resource/resource-semantics'
import type { ConfirmedEntryTransferOverlayStore } from '../cache/entry-transfer-overlays'
import {
  buildRootNodes,
  copyFileResource,
  createBlobResource,
  createFolderResource,
  createRawTextResource,
  deleteFileResource,
  listAllBrowsableEntries,
  listContainerChildNodes,
  listContainerEntries,
  moveFileResource,
  readBlobResource,
  readFileDetail,
  readFilesAccessBasics,
  readFilesMetaSidecar,
  readRawTextResource,
  saveRawTextResource,
  type FilesBlobResource,
  type FilesDetail,
  type FilesEntry,
  type FilesFolderCreateInput,
  type FilesRawTextResource,
  type FilesResourceTransferInput,
  type FilesRootData,
  type FilesTreeNode,
} from '../pod-adapter'
import type { FilesEntryListInput } from './resource-query-collection'

export interface ResourceCollectionDependencies {
  getDb: () => SolidDatabase | null
  confirmedEntryTransferOverlays: ConfirmedEntryTransferOverlayStore
}

export function createResourceCollection(dependencies: ResourceCollectionDependencies) {
  const {
    getDb,
    confirmedEntryTransferOverlays,
  } = dependencies

  function requireFilesDb(dbOverride?: SolidDatabase | null): SolidDatabase {
    const db = dbOverride ?? getDb()
    if (!db) throw new Error('Database not connected')
    return db
  }

  return {
    resolveCurrentPodRootUri(dbOverride?: SolidDatabase | null): string | null {
      const db = dbOverride ?? getDb()
      return db ? resolveCurrentPodBaseUrl(db) : null
    },

    async buildRoots(workspaceUri?: string | null, dbOverride?: SolidDatabase | null): Promise<FilesRootData> {
      return buildRootNodes(requireFilesDb(dbOverride), workspaceUri)
    },

    async listChildTreeNodes(
      containerUri: string,
      parentId: string,
      podRootUri?: string | null,
      dbOverride?: SolidDatabase | null,
    ): Promise<FilesTreeNode[]> {
      return listContainerChildNodes(requireFilesDb(dbOverride), containerUri, parentId, podRootUri)
    },

    async listEntries(input: FilesEntryListInput, dbOverride?: SolidDatabase | null): Promise<FilesEntry[]> {
      const db = requireFilesDb(dbOverride)
      let entries: FilesEntry[]

      if (input.entryScope === 'chat-files') {
        if (!input.threadId || !input.chatPodRootUri) return []
        const chatEntries = projectChatFileEntries(input.messages ?? [], input.chatPodRootUri)
        if (!input.workspaceUri) return chatEntries
        const workspaceEntries = await listAllBrowsableEntries(db, input.workspaceUri, { recursive: true })
        entries = mergeChatFileEntries(chatEntries, workspaceEntries)
        return confirmedEntryTransferOverlays.merge(entries)
      }

      if (input.selection.kind === 'local-workspace') return []
      if (input.selection.kind === 'all') {
        entries = await listAllBrowsableEntries(db, input.workspaceUri, {})
        return confirmedEntryTransferOverlays.merge(entries, { includeAll: true })
      }
      if (input.selection.kind === 'recent') {
        entries = await listAllBrowsableEntries(db, input.workspaceUri, { recursive: true })
        return confirmedEntryTransferOverlays.merge(entries, { includeAll: true })
      }
      if (!input.selection.containerUri) return []
      entries = await listContainerEntries(
        db,
        input.selection.containerUri,
        input.selection.containerUri === input.workspaceUri ? '当前话题' : undefined,
      )
      return confirmedEntryTransferOverlays.merge(entries, { containerUri: input.selection.containerUri })
    },

    async listAllEntries(
      workspaceUri?: string | null,
      options: { recursive?: boolean } = {},
      dbOverride?: SolidDatabase | null,
    ): Promise<FilesEntry[]> {
      return listAllBrowsableEntries(requireFilesDb(dbOverride), workspaceUri, options)
    },

    async listContainerEntries(
      containerUri: string,
      sourceLabel?: string,
      dbOverride?: SolidDatabase | null,
      options?: { enrichMetadata?: boolean },
    ): Promise<FilesEntry[]> {
      return listContainerEntries(requireFilesDb(dbOverride), containerUri, sourceLabel, options)
    },

    async readDetail(resourceUri: string, dbOverride?: SolidDatabase | null): Promise<FilesDetail> {
      return readFileDetail(requireFilesDb(dbOverride), resourceUri, { includeContainerEntries: false })
    },

    async readRawText(resourceUri: string, dbOverride?: SolidDatabase | null): Promise<FilesRawTextResource> {
      return readRawTextResource(requireFilesDb(dbOverride), resourceUri)
    },

    async readBlob(resourceUri: string, dbOverride?: SolidDatabase | null): Promise<FilesBlobResource> {
      return readBlobResource(requireFilesDb(dbOverride), resourceUri)
    },

    async readAccessBasics(
      file: Pick<FilesDetail, 'uri' | 'kind'>,
      dbOverride?: SolidDatabase | null,
    ) {
      return readFilesAccessBasics(requireFilesDb(dbOverride), file)
    },

    async readMetaSidecar(
      file: Pick<FilesDetail, 'uri' | 'kind'>,
      dbOverride?: SolidDatabase | null,
    ) {
      return readFilesMetaSidecar(requireFilesDb(dbOverride), file)
    },

    async saveRawText(
      resource: Pick<FilesRawTextResource, 'uri' | 'mimeType' | 'etag'>,
      content: string,
      dbOverride?: SolidDatabase | null,
    ): Promise<FilesRawTextResource> {
      return saveRawTextResource(requireFilesDb(dbOverride), resource, content)
    },

    async createRawText(
      resource: Pick<FilesRawTextResource, 'uri' | 'mimeType'>,
      content: string,
      dbOverride?: SolidDatabase | null,
    ): Promise<FilesRawTextResource> {
      return createRawTextResource(requireFilesDb(dbOverride), resource, content)
    },

    async createBlob(
      resource: Pick<FilesRawTextResource, 'uri' | 'mimeType'>,
      content: Blob,
      dbOverride?: SolidDatabase | null,
    ): Promise<FilesDetail> {
      return createBlobResource(requireFilesDb(dbOverride), resource, content)
    },

    async copy(input: FilesResourceTransferInput, dbOverride?: SolidDatabase | null): Promise<FilesDetail> {
      return copyFileResource(requireFilesDb(dbOverride), input)
    },

    async move(input: FilesResourceTransferInput, dbOverride?: SolidDatabase | null): Promise<FilesDetail> {
      return moveFileResource(requireFilesDb(dbOverride), input)
    },

    async delete(resourceUri: string, dbOverride?: SolidDatabase | null): Promise<void> {
      await deleteFileResource(requireFilesDb(dbOverride), resourceUri)
    },

    async createFolder(input: FilesFolderCreateInput, dbOverride?: SolidDatabase | null): Promise<FilesDetail> {
      return createFolderResource(requireFilesDb(dbOverride), input)
    },

    getParentContainerUri,
  }
}
