import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type {
  FilesDetail,
  FilesStructuredViewMetadataSidecar,
} from '../../domain/resource/resource-model'
import type { StructuredViewMetadata } from '../../domain/structured/structured-view-metadata'
import {
  normalizeStructuredKanbanBoardMetadata,
  normalizeStructuredWhiteboardSnapshotMetadata,
} from '../../domain/structured/structured-view-metadata'
import { restoreQuerySnapshot } from './resource-query-cache'

export type FilesStructuredViewMetadataCacheSnapshot = {
  queryKey: QueryKey
  previous: FilesStructuredViewMetadataSidecar | undefined
}

export type StructuredViewMetadataCacheQueryRoots = {
  structuredViewMetadata: QueryKey
  metaSidecar: QueryKey
}

function structuredViewMetadataKind(ownerUri: string): 'container' | 'resource' {
  return ownerUri.endsWith('/') ? 'container' : 'resource'
}

function completeStructuredViewMetadata(metadata: StructuredViewMetadata): Required<StructuredViewMetadata> {
  return {
    documentUri: metadata.documentUri,
    viewMode: metadata.viewMode,
    classScope: metadata.classScope,
    searchText: metadata.searchText,
    sortKey: metadata.sortKey,
    sortDirection: metadata.sortDirection,
    hiddenPredicates: metadata.hiddenPredicates,
    kanbanGroupPredicate: metadata.kanbanGroupPredicate,
    kanbanOrder: metadata.kanbanOrder ?? {},
    kanbanBoard: metadata.kanbanBoard
      ? normalizeStructuredKanbanBoardMetadata(metadata.kanbanBoard, metadata.kanbanOrder ?? {})
      : null,
    columnSizing: metadata.columnSizing,
    whiteboard: {
      selectedSubjects: metadata.whiteboard.selectedSubjects,
      positions: metadata.whiteboard.positions,
      visualRelations: metadata.whiteboard.visualRelations ?? [],
      snapshot: metadata.whiteboard.snapshot
        ? normalizeStructuredWhiteboardSnapshotMetadata(metadata.whiteboard.snapshot, {
          positions: metadata.whiteboard.positions,
          visualRelations: metadata.whiteboard.visualRelations ?? [],
        })
        : null,
    },
    writesCanonicalData: false,
  }
}

export function createStructuredViewMetadataCacheCollection(queryRoots: StructuredViewMetadataCacheQueryRoots) {
  function structuredViewMetadataQueryKey(file: Pick<FilesDetail, 'uri' | 'kind'>) {
    return [...queryRoots.structuredViewMetadata, file.uri, file.kind] as const
  }

  function structuredViewMetadataQueryKeyForSidecar(sidecar: Pick<FilesStructuredViewMetadataSidecar, 'ownerUri'>) {
    return [
      ...queryRoots.structuredViewMetadata,
      sidecar.ownerUri,
      structuredViewMetadataKind(sidecar.ownerUri),
    ] as const
  }

  const collection = {
    queryKey: structuredViewMetadataQueryKey,

    async stageSave(
      cacheClient: QueryClient,
      file: Pick<FilesDetail, 'uri' | 'kind'>,
      metadata: StructuredViewMetadata,
    ): Promise<FilesStructuredViewMetadataCacheSnapshot> {
      await cacheClient.cancelQueries({
        queryKey: collection.queryKey(file),
      })
      const snapshot = collection.snapshot(cacheClient, file)
      collection.setMetadata(cacheClient, file, metadata)
      return snapshot
    },

    commitSave(cacheClient: QueryClient, sidecar: FilesStructuredViewMetadataSidecar) {
      collection.setSidecar(cacheClient, sidecar)
    },

    async invalidateSave(cacheClient: QueryClient, sidecar: FilesStructuredViewMetadataSidecar) {
      await Promise.all([
        cacheClient.invalidateQueries({ queryKey: structuredViewMetadataQueryKeyForSidecar(sidecar) }),
        cacheClient.invalidateQueries({
          queryKey: [
            ...queryRoots.metaSidecar,
            sidecar.ownerUri,
            structuredViewMetadataKind(sidecar.ownerUri),
          ],
        }),
      ])
    },

    snapshot(cacheClient: QueryClient, file: Pick<FilesDetail, 'uri' | 'kind'>): FilesStructuredViewMetadataCacheSnapshot {
      const queryKey = structuredViewMetadataQueryKey(file)
      return {
        queryKey,
        previous: cacheClient.getQueryData<FilesStructuredViewMetadataSidecar>(queryKey),
      }
    },

    restore(cacheClient: QueryClient, snapshot?: FilesStructuredViewMetadataCacheSnapshot) {
      if (!snapshot) return
      restoreQuerySnapshot(cacheClient, [[snapshot.queryKey, snapshot.previous]])
    },

    setMetadata(
      cacheClient: QueryClient,
      file: Pick<FilesDetail, 'uri' | 'kind'>,
      metadata: StructuredViewMetadata,
    ) {
      cacheClient.setQueryData<FilesStructuredViewMetadataSidecar>(
        structuredViewMetadataQueryKey(file),
        (current) => ({
          ownerUri: file.uri,
          metaUri: current?.metaUri ?? `${file.uri}.meta`,
          state: 'exists',
          status: current?.status,
          content: current?.content ?? null,
          mimeType: current?.mimeType ?? 'text/turtle',
          etag: current?.etag ?? null,
          size: current?.size ?? null,
          metadata: completeStructuredViewMetadata(metadata),
        }),
      )
    },

    setSidecar(cacheClient: QueryClient, sidecar: FilesStructuredViewMetadataSidecar) {
      cacheClient.setQueryData(structuredViewMetadataQueryKeyForSidecar(sidecar), sidecar)
    },
  }

  return collection
}
