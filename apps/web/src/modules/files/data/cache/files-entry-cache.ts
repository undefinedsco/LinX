import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type {
  FilesEntry,
  FilesFolderCreateInput,
  FilesRawTextResource,
  FilesResourceTransferInput,
} from '../../domain/resource/resource-model'
import {
  classifyFilesEntry,
  getEntryName,
  getParentContainerUri,
} from '../../domain/resource/resource-semantics'
import type { ConfirmedEntryTransferOverlayStore } from './entry-transfer-overlays'
import {
  restoreQuerySnapshot,
  setCachedEntryLists,
} from './resource-query-cache'

export type FilesEntryCacheSnapshot = Array<[QueryKey, FilesEntry[] | undefined]>

export type FilesEntryCacheQueryRoots = {
  entries: QueryKey
  containerEntries: QueryKey
  children: QueryKey
  detail: QueryKey
  rawText: QueryKey
  metaSidecar: QueryKey
  structuredViewMetadata: QueryKey
}

function findEntryInSnapshot(snapshot: FilesEntryCacheSnapshot, resourceUri: string): FilesEntry | null {
  for (const [, entries] of snapshot) {
    const match = entries?.find((entry) => entry.uri === resourceUri)
    if (match) return match
  }
  return null
}

export function createFilesEntryCacheCollection(
  queryKeys: FilesEntryCacheQueryRoots,
  confirmedEntryTransferOverlays: ConfirmedEntryTransferOverlayStore,
) {
  const entryListQueryRoots = [queryKeys.entries, queryKeys.containerEntries] as const

  const collection = {
    snapshot(cacheClient: QueryClient): FilesEntryCacheSnapshot {
      return entryListQueryRoots.flatMap((queryKey) => (
        cacheClient.getQueriesData<FilesEntry[]>({ queryKey })
      ))
    },

    restore(cacheClient: QueryClient, snapshot?: FilesEntryCacheSnapshot) {
      restoreQuerySnapshot(cacheClient, snapshot)
    },

    upsert(cacheClient: QueryClient, entry: FilesEntry) {
      const upsertEntry = (queryKey: QueryKey) => {
        setCachedEntryLists(cacheClient, queryKey, (current) => {
          const existingIndex = current.findIndex((candidate) => candidate.uri === entry.uri)
          if (existingIndex >= 0) {
            const next = [...current]
            next[existingIndex] = entry
            return next
          }
          return [...current, entry]
        })
      }
      upsertEntry(queryKeys.entries)
      upsertEntry([...queryKeys.containerEntries, entry.parentUri])
    },

    remove(cacheClient: QueryClient, resourceUri: string) {
      entryListQueryRoots.forEach((queryKey) => {
        setCachedEntryLists(cacheClient, queryKey, (current) => current.filter((entry) => entry.uri !== resourceUri))
      })
    },

    updateRawText(
      cacheClient: QueryClient,
      input: {
        uri: string
        mimeType: string
        size: number
        modifiedAt?: string | null
      },
    ) {
      entryListQueryRoots.forEach((queryKey) => {
        setCachedEntryLists(cacheClient, queryKey, (current) => current.map((entry) => {
          if (entry.uri !== input.uri) return entry
          const parentUri = getParentContainerUri(input.uri) ?? entry.parentUri
          return {
            ...entry,
            parentUri,
            semanticKind: classifyFilesEntry(input.uri, entry.kind === 'container', parentUri, input.mimeType),
            mimeType: input.mimeType,
            size: input.size,
            modifiedAt: input.modifiedAt ?? new Date().toISOString(),
          }
        }))
      })
    },

    async stageRawTextSave(
      cacheClient: QueryClient,
      input: {
        resource: Pick<FilesRawTextResource, 'uri' | 'mimeType'>
        content: string
      },
    ): Promise<FilesEntryCacheSnapshot> {
      await cacheClient.cancelQueries({ queryKey: queryKeys.entries })
      await cacheClient.cancelQueries({ queryKey: queryKeys.containerEntries })
      const entriesSnapshot = collection.snapshot(cacheClient)
      collection.updateRawText(cacheClient, {
        uri: input.resource.uri,
        mimeType: input.resource.mimeType,
        size: input.content.length,
      })
      return entriesSnapshot
    },

    commitRawTextSave(
      cacheClient: QueryClient,
      resource: Pick<FilesRawTextResource, 'uri' | 'mimeType' | 'content' | 'headers'>,
    ) {
      collection.updateRawText(cacheClient, {
        uri: resource.uri,
        mimeType: resource.mimeType,
        size: resource.content.length,
        modifiedAt: resource.headers['last-modified'] ?? null,
      })
    },

    async invalidateRawTextResource(cacheClient: QueryClient, resourceUri: string) {
      const parentContainerUri = getParentContainerUri(resourceUri)
      await Promise.all([
        cacheClient.invalidateQueries({ queryKey: queryKeys.entries }),
        cacheClient.invalidateQueries({ queryKey: queryKeys.containerEntries }),
        cacheClient.invalidateQueries({ queryKey: queryKeys.children }),
        cacheClient.invalidateQueries({ queryKey: [...queryKeys.rawText, resourceUri] }),
        cacheClient.invalidateQueries({ queryKey: [...queryKeys.detail, resourceUri] }),
        parentContainerUri
          ? cacheClient.invalidateQueries({ queryKey: [...queryKeys.detail, parentContainerUri] })
          : Promise.resolve(),
      ])
    },

    async stageResourceCreate(
      cacheClient: QueryClient,
      input: {
        uri: string
        kind: FilesEntry['kind']
        mimeType: string | null
        size?: number | null
        parentUri?: string | null
        podRootUri?: string | null
      },
    ): Promise<FilesEntryCacheSnapshot> {
      await cacheClient.cancelQueries({ queryKey: queryKeys.entries })
      await cacheClient.cancelQueries({ queryKey: queryKeys.containerEntries })
      const entriesSnapshot = collection.snapshot(cacheClient)
      collection.commitResourceCreate(cacheClient, input)
      return entriesSnapshot
    },

    commitResourceCreate(
      cacheClient: QueryClient,
      input: {
        uri: string
        kind: FilesEntry['kind']
        mimeType: string | null
        size?: number | null
        parentUri?: string | null
        podRootUri?: string | null
      },
    ) {
      const parentUri = input.parentUri ?? getParentContainerUri(input.uri) ?? input.uri
      collection.upsert(cacheClient, collection.optimisticEntryForResource({
        uri: input.uri,
        kind: input.kind,
        mimeType: input.mimeType,
        parentUri,
        podRootUri: input.podRootUri ?? null,
        size: input.size ?? null,
      }))
    },

    async invalidateResourceCreate(
      cacheClient: QueryClient,
      resourceUri: string,
      options: { includeRawText?: boolean } = {},
    ) {
      const parentContainerUri = getParentContainerUri(resourceUri)
      await Promise.all([
        cacheClient.invalidateQueries({ queryKey: queryKeys.entries }),
        cacheClient.invalidateQueries({ queryKey: queryKeys.containerEntries }),
        cacheClient.invalidateQueries({ queryKey: queryKeys.children }),
        options.includeRawText
          ? cacheClient.invalidateQueries({ queryKey: [...queryKeys.rawText, resourceUri] })
          : Promise.resolve(),
        cacheClient.invalidateQueries({ queryKey: [...queryKeys.detail, resourceUri] }),
        parentContainerUri
          ? cacheClient.invalidateQueries({ queryKey: [...queryKeys.detail, parentContainerUri] })
          : Promise.resolve(),
      ])
    },

    async stageTransfer(
      cacheClient: QueryClient,
      input: FilesResourceTransferInput,
      operation: 'copy' | 'move',
    ): Promise<FilesEntryCacheSnapshot> {
      await cacheClient.cancelQueries({ queryKey: queryKeys.entries })
      await cacheClient.cancelQueries({ queryKey: queryKeys.containerEntries })
      const entriesSnapshot = collection.snapshot(cacheClient)
      collection.applyTransfer(
        cacheClient,
        collection.optimisticEntryForTransfer(input, entriesSnapshot),
        input,
        operation,
      )
      return entriesSnapshot
    },

    commitTransfer(
      cacheClient: QueryClient,
      resource: FilesEntry,
      input: FilesResourceTransferInput,
      operation: 'copy' | 'move',
    ) {
      confirmedEntryTransferOverlays.remember(resource, input, operation)
      collection.applyTransfer(cacheClient, resource, input, operation)
    },

    async invalidateTransfer(cacheClient: QueryClient, input: FilesResourceTransferInput) {
      await Promise.all([
        cacheClient.invalidateQueries({ queryKey: queryKeys.entries }),
        cacheClient.invalidateQueries({ queryKey: queryKeys.containerEntries }),
        cacheClient.invalidateQueries({ queryKey: queryKeys.children }),
        cacheClient.invalidateQueries({ queryKey: [...queryKeys.detail, input.sourceUri] }),
        cacheClient.invalidateQueries({ queryKey: [...queryKeys.detail, input.destinationUri] }),
        cacheClient.invalidateQueries({ queryKey: [...queryKeys.rawText, input.sourceUri] }),
        cacheClient.invalidateQueries({ queryKey: [...queryKeys.rawText, input.destinationUri] }),
      ])
    },

    async stageDelete(cacheClient: QueryClient, resourceUri: string): Promise<FilesEntryCacheSnapshot> {
      await cacheClient.cancelQueries({ queryKey: queryKeys.entries })
      await cacheClient.cancelQueries({ queryKey: queryKeys.containerEntries })
      const entriesSnapshot = collection.snapshot(cacheClient)
      confirmedEntryTransferOverlays.forget(resourceUri)
      collection.remove(cacheClient, resourceUri)
      return entriesSnapshot
    },

    async invalidateDelete(cacheClient: QueryClient, resourceUri: string) {
      const parentContainerUri = getParentContainerUri(resourceUri)
      await Promise.all([
        cacheClient.invalidateQueries({ queryKey: queryKeys.entries }),
        cacheClient.invalidateQueries({ queryKey: queryKeys.containerEntries }),
        cacheClient.invalidateQueries({ queryKey: queryKeys.children }),
        cacheClient.invalidateQueries({ queryKey: [...queryKeys.detail, resourceUri] }),
        cacheClient.invalidateQueries({ queryKey: [...queryKeys.rawText, resourceUri] }),
        cacheClient.invalidateQueries({ queryKey: [...queryKeys.metaSidecar, resourceUri, 'resource'] }),
        cacheClient.invalidateQueries({ queryKey: [...queryKeys.structuredViewMetadata, resourceUri, 'resource'] }),
        parentContainerUri
          ? cacheClient.invalidateQueries({ queryKey: [...queryKeys.detail, parentContainerUri] })
          : Promise.resolve(),
      ])
    },

    async stageFolderCreate(
      cacheClient: QueryClient,
      input: FilesFolderCreateInput,
      podRootUri?: string | null,
    ): Promise<FilesEntryCacheSnapshot> {
      await cacheClient.cancelQueries({ queryKey: queryKeys.entries })
      await cacheClient.cancelQueries({ queryKey: queryKeys.containerEntries })
      const entriesSnapshot = collection.snapshot(cacheClient)
      const uri = collection.optimisticFolderUri(input)
      collection.commitResourceCreate(cacheClient, {
        uri,
        kind: 'container',
        mimeType: 'inode/container',
        parentUri: input.containerUri,
        podRootUri: podRootUri ?? null,
        size: null,
      })
      return entriesSnapshot
    },

    commitFolderCreate(cacheClient: QueryClient, folder: FilesEntry) {
      collection.upsert(cacheClient, folder)
    },

    async invalidateFolderCreate(
      cacheClient: QueryClient,
      input: FilesFolderCreateInput,
      folder?: Pick<FilesEntry, 'uri'> | null,
    ) {
      await Promise.all([
        cacheClient.invalidateQueries({ queryKey: queryKeys.entries }),
        cacheClient.invalidateQueries({ queryKey: queryKeys.containerEntries }),
        cacheClient.invalidateQueries({ queryKey: queryKeys.children }),
        cacheClient.invalidateQueries({ queryKey: queryKeys.detail }),
        cacheClient.invalidateQueries({ queryKey: [...queryKeys.detail, input.containerUri] }),
        folder
          ? cacheClient.invalidateQueries({ queryKey: [...queryKeys.detail, folder.uri] })
          : Promise.resolve(),
      ])
    },

    optimisticEntryForResource(input: {
      uri: string
      kind: FilesEntry['kind']
      mimeType: string | null
      parentUri: string
      podRootUri?: string | null
      size?: number | null
    }): FilesEntry {
      return {
        id: input.uri,
        uri: input.uri,
        name: getEntryName(input.uri),
        kind: input.kind,
        semanticKind: classifyFilesEntry(
          input.uri,
          input.kind === 'container',
          input.podRootUri ?? input.parentUri,
          input.mimeType,
        ),
        parentUri: input.parentUri,
        mimeType: input.mimeType,
        size: input.size ?? null,
        modifiedAt: new Date().toISOString(),
      }
    },

    optimisticEntryForTransfer(
      input: FilesResourceTransferInput,
      snapshot: FilesEntryCacheSnapshot,
    ): FilesEntry {
      const sourceEntry = findEntryInSnapshot(snapshot, input.sourceUri)
      const parentUri = getParentContainerUri(input.destinationUri)
        ?? sourceEntry?.parentUri
        ?? input.destinationUri
      return {
        id: input.destinationUri,
        uri: input.destinationUri,
        name: getEntryName(input.destinationUri),
        kind: sourceEntry?.kind ?? 'resource',
        semanticKind: sourceEntry
          ? classifyFilesEntry(input.destinationUri, sourceEntry.kind === 'container', parentUri, sourceEntry.mimeType)
          : classifyFilesEntry(input.destinationUri, false, parentUri, null),
        parentUri,
        mimeType: sourceEntry?.mimeType ?? null,
        size: sourceEntry?.size ?? null,
        modifiedAt: new Date().toISOString(),
        metadataState: sourceEntry?.metadataState,
        metadataErrorKind: sourceEntry?.metadataErrorKind,
        metadataError: sourceEntry?.metadataError,
        sourceLabel: sourceEntry?.sourceLabel,
        summary: sourceEntry?.summary,
        tags: sourceEntry?.tags,
      }
    },

    applyTransfer(
      cacheClient: QueryClient,
      resource: FilesEntry,
      input: FilesResourceTransferInput,
      operation: 'copy' | 'move',
    ) {
      setCachedEntryLists(cacheClient, queryKeys.entries, (current) => {
        const withoutSource = operation === 'move'
          ? current.filter((entry) => entry.uri !== input.sourceUri)
          : current
        const existingIndex = withoutSource.findIndex((entry) => entry.uri === resource.uri)
        if (existingIndex >= 0) {
          const next = [...withoutSource]
          next[existingIndex] = resource
          return next
        }
        return [...withoutSource, resource]
      })
    },

    optimisticFolderUri(input: FilesFolderCreateInput): string {
      const containerUri = input.containerUri.endsWith('/') ? input.containerUri : `${input.containerUri}/`
      return new URL(`${encodeURIComponent(input.name)}/`, containerUri).href
    },
  }

  return collection
}
