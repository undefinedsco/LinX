import type { FilesStructuredViewMetadataSidecar } from '../../domain/resource/resource-model'
import type { StructuredViewMetadata } from '../../domain/structured/structured-view-metadata'

function sortedRecordEntries<T>(record: Record<string, T>) {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
}

export function structuredViewMetadataSignature(metadata: StructuredViewMetadata) {
  return JSON.stringify({
    documentUri: metadata.documentUri,
    viewMode: metadata.viewMode,
    classScope: metadata.classScope,
    searchText: metadata.searchText,
    sortKey: metadata.sortKey,
    sortDirection: metadata.sortDirection,
    hiddenPredicates: [...metadata.hiddenPredicates].sort(),
    kanbanGroupPredicate: metadata.kanbanGroupPredicate,
    kanbanOrder: sortedRecordEntries(metadata.kanbanOrder ?? {}).map(([columnId, subjects]) => [columnId, [...subjects]]),
    columnSizing: sortedRecordEntries(metadata.columnSizing),
    whiteboard: {
      selectedSubjects: [...metadata.whiteboard.selectedSubjects],
      positions: sortedRecordEntries(metadata.whiteboard.positions),
      visualRelations: [...(metadata.whiteboard.visualRelations ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    },
    writesCanonicalData: false,
  })
}

export function defaultStructuredViewMetadataSignature(documentUri: string) {
  return structuredViewMetadataSignature({
    documentUri,
    viewMode: 'table',
    classScope: null,
    searchText: '',
    sortKey: null,
    sortDirection: 'asc',
    hiddenPredicates: [],
    kanbanGroupPredicate: null,
    kanbanOrder: {},
    columnSizing: {},
    whiteboard: {
      selectedSubjects: [],
      positions: {},
      visualRelations: [],
    },
    writesCanonicalData: false,
  })
}

export function isSameStructuredDocumentUri(left: string | null | undefined, right: string) {
  if (!left) return false
  if (left === right) return true
  try {
    return new URL(left).href === new URL(right).href
  } catch {
    return false
  }
}

export type StructuredViewMetadataHydrationPlan =
  | { action: 'none' }
  | { action: 'sync-default'; signature: string }
  | {
      action: 'hydrate'
      hydrationKey: string
      metadata: Required<StructuredViewMetadata>
      shouldHydrate: boolean
      signature: string
    }

export function projectStructuredViewMetadataHydration({
  currentHydrationKey,
  fileUri,
  localViewMetadataChangeBeforeHydration,
  metadataSidecar,
  whiteboardLayoutKey,
}: {
  currentHydrationKey: string | null
  fileUri: string
  localViewMetadataChangeBeforeHydration: boolean
  metadataSidecar: FilesStructuredViewMetadataSidecar | null | undefined
  whiteboardLayoutKey: string
}): StructuredViewMetadataHydrationPlan {
  const metadata = metadataSidecar?.metadata
  if (!metadataSidecar) return { action: 'none' }
  if (!metadata) {
    return {
      action: 'sync-default',
      signature: defaultStructuredViewMetadataSignature(fileUri),
    }
  }
  if (
    !isSameStructuredDocumentUri(metadata.documentUri, fileUri)
    && !isSameStructuredDocumentUri(metadataSidecar.ownerUri, fileUri)
  ) return { action: 'none' }

  const metadataForCurrentFile = isSameStructuredDocumentUri(metadata.documentUri, fileUri)
    ? metadata
    : { ...metadata, documentUri: fileUri }
  const hydrationKey = [
    fileUri,
    metadataSidecar.metaUri,
    metadataSidecar.etag ?? 'no-etag',
    whiteboardLayoutKey,
  ].join('::')
  if (currentHydrationKey === hydrationKey) return { action: 'none' }

  return {
    action: 'hydrate',
    hydrationKey,
    metadata: metadataForCurrentFile,
    shouldHydrate: !localViewMetadataChangeBeforeHydration,
    signature: structuredViewMetadataSignature(metadataForCurrentFile),
  }
}
