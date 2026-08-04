import {
  normalizeStructuredColumnSizing,
  normalizeStructuredKanbanOrder,
  normalizeStructuredOpenViews,
  normalizeStructuredSortDirection,
  normalizeStructuredViewMode,
  type StructuredViewMetadata,
} from '../../domain/structured/structured-view-metadata'

const STORAGE_KEY_PREFIX = 'linx-files:structured-view:'

const DEFAULT_WHITEBOARD: StructuredViewMetadata['whiteboard'] = {
  selectedSubjects: [],
  positions: {},
  visualRelations: [],
}

function storageKey(documentUri: string): string {
  return `${STORAGE_KEY_PREFIX}${encodeURIComponent(documentUri)}`
}

function normalizeStoredMetadata(value: unknown, documentUri: string): Required<StructuredViewMetadata> | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  const viewMode = normalizeStructuredViewMode(candidate.viewMode)
  const whiteboard = candidate.whiteboard && typeof candidate.whiteboard === 'object'
    ? candidate.whiteboard as StructuredViewMetadata['whiteboard']
    : DEFAULT_WHITEBOARD
  return {
    documentUri,
    viewMode,
    openViews: normalizeStructuredOpenViews(candidate.openViews, viewMode),
    classScope: typeof candidate.classScope === 'string' ? candidate.classScope : null,
    searchText: typeof candidate.searchText === 'string' ? candidate.searchText : '',
    sortKey: typeof candidate.sortKey === 'string' ? candidate.sortKey : null,
    sortDirection: normalizeStructuredSortDirection(candidate.sortDirection),
    hiddenPredicates: Array.isArray(candidate.hiddenPredicates)
      ? candidate.hiddenPredicates.filter((predicate): predicate is string => typeof predicate === 'string')
      : [],
    kanbanGroupPredicate: typeof candidate.kanbanGroupPredicate === 'string' ? candidate.kanbanGroupPredicate : null,
    kanbanOrder: normalizeStructuredKanbanOrder(candidate.kanbanOrder),
    kanbanBoard: candidate.kanbanBoard && typeof candidate.kanbanBoard === 'object'
      ? candidate.kanbanBoard as StructuredViewMetadata['kanbanBoard'] ?? null
      : null,
    columnSizing: normalizeStructuredColumnSizing(candidate.columnSizing),
    whiteboard: {
      selectedSubjects: Array.isArray(whiteboard.selectedSubjects) ? whiteboard.selectedSubjects : [],
      positions: whiteboard.positions ?? {},
      visualRelations: Array.isArray(whiteboard.visualRelations) ? whiteboard.visualRelations : [],
    },
    writesCanonicalData: false,
  }
}

export function loadLocalStructuredViewMetadata(documentUri: string): Required<StructuredViewMetadata> | null {
  if (typeof window === 'undefined') return null

  try {
    return normalizeStoredMetadata(
      JSON.parse(window.localStorage.getItem(storageKey(documentUri)) ?? 'null'),
      documentUri,
    )
  } catch {
    return null
  }
}

export function saveLocalStructuredViewMetadata(documentUri: string, metadata: StructuredViewMetadata): void {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(storageKey(documentUri), JSON.stringify(metadata))
}
