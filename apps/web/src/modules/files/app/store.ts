/**
 * Files Module - Zustand Store (UI state only)
 *
 * Manages pure UI state for the Files module:
 * - Tree navigation selection
 * - File list selection
 * - Search and filter state
 * - Detail pane tab
 */
import { create } from 'zustand'
import type { FilesEntryScope } from '../domain/list/entry-scope'
import {
  popFolderHistory,
  pushFolderHistory,
  type FolderHistoryEntry,
} from '../domain/list/folder-history'
import type { StructuredWhiteboardVisualRelation } from '../domain/structured/structured-projections'
import { shouldRequestEditableSheetForStructuredSubjectTarget } from '../domain/resource/resource-semantics'
import {
  DEFAULT_STRUCTURED_VIEW_CONFIG,
  normalizeStructuredViewConfig,
  normalizeStructuredWhiteboardLayouts,
  type StructuredColumnSizingState,
  type StructuredKanbanOrderState,
  type StructuredResourceViewMode,
  type StructuredSortDirection,
  type StructuredViewConfig,
  type StructuredWhiteboardPosition,
} from '../domain/structured/structured-view-metadata'
export type {
  StructuredColumnSizingState,
  StructuredKanbanOrderState,
  StructuredResourceViewMode,
  StructuredSortDirection,
  StructuredViewConfig,
  StructuredWhiteboardPosition,
} from '../domain/structured/structured-view-metadata'

export type { FilesEntryScope } from '../domain/list/entry-scope'
export type { StructuredWhiteboardVisualRelation } from '../domain/structured/structured-projections'

const STRUCTURED_WHITEBOARD_LAYOUT_STORAGE_KEY = 'linx.files.structuredWhiteboardLayouts.v1'
const STRUCTURED_VIEW_CONFIG_STORAGE_KEY = 'linx.files.structuredViewConfigs.v1'

// ============================================================================
// Types
// ============================================================================

/** Tree node types for the real Pod/file browser. */
export type TreeNodeType =
  | 'all'
  | 'recent'
  | 'workspace'
  | 'local-workspace'
  | 'agents-root'
  | 'workspaces-root'
  | 'repositories-root'
  | 'container'

export interface TreeNode {
  id: string
  label: string
  type: TreeNodeType
  parentId?: string
  /** File count badge */
  count?: number
  /** Aggregated sync status indicator */
  syncIndicator?: 'ok' | 'warning' | 'error'
}

/** Detail pane tab (section 8.4) */
export type FileDetailTab = 'preview' | 'metadata' | 'lineage'
export type StructuredColumnSizingUpdater =
  | StructuredColumnSizingState
  | ((old: StructuredColumnSizingState) => StructuredColumnSizingState)
export interface StructuredSubjectReturnContext {
  documentUri: string
  subject: string
  scrollTop: number
  rowIndex?: number | null
  viewMode: StructuredResourceViewMode
  classScope: string | null
  searchText: string
  sortKey: string | null
  sortDirection: StructuredSortDirection
  hiddenPredicates: string[]
  kanbanGroupPredicate: string | null
}

export interface StructuredScrollRestoration {
  documentUri: string
  subject: string
  scrollTop: number
  rowIndex?: number | null
}

export interface StructuredViewMetadataHydrationInput extends StructuredViewConfig {
  documentUri: string
  whiteboard: {
    selectedSubjects: string[]
    positions: Record<string, StructuredWhiteboardPosition>
    visualRelations?: StructuredWhiteboardVisualRelation[]
  }
}

/** Sort field for file list */
export type FileSortField = 'name' | 'kind' | 'mimeType' | 'size' | 'modifiedAt'
export type SortDirection = 'asc' | 'desc'

// ============================================================================
// Store Interface
// ============================================================================

interface FilesStore {
  // Tree navigation
  selectedTreeNodeId: string | null
  expandedTreeNodeIds: Set<string>
  resourceRailCollapsed: boolean
  folderHistory: FolderHistoryEntry[]

  // File list
  entryScope: FilesEntryScope
  selectedFileId: string | null
  selectedFileIds: Set<string>
  searchText: string
  sortField: FileSortField
  sortDirection: SortDirection
  mimeTypeFilter: string | null
  tagFilter: string | null

  // Detail pane
  detailTab: FileDetailTab
  editableFileSheetOpenRequestUri: string | null
  structuredViewMode: StructuredResourceViewMode
  structuredClassScope: string | null
  structuredSearchText: string
  structuredSortKey: string | null
  structuredSortDirection: StructuredSortDirection
  structuredHiddenPredicates: Set<string>
  structuredViewConfigsByDocument: Record<string, StructuredViewConfig>
  structuredViewDirtyDocuments: Set<string>
  structuredColumnSizingByDocument: Record<string, StructuredColumnSizingState>
  structuredWhiteboardLayoutsByDocument: Record<string, Record<string, StructuredWhiteboardPosition>>
  structuredWhiteboardSubjectsByDocument: Record<string, string[]>
  structuredWhiteboardRelationsByDocument: Record<string, StructuredWhiteboardVisualRelation[]>
  structuredKanbanGroupPredicate: string | null
  structuredKanbanOrderByDocument: Record<string, StructuredKanbanOrderState>
  structuredSubjectReturnContext: StructuredSubjectReturnContext | null
  structuredScrollRestoration: StructuredScrollRestoration | null

  // Actions: tree
  selectTreeNode: (id: string | null) => void
  toggleTreeNode: (id: string) => void
  toggleResourceRail: () => void
  enterFolder: (input: { treeNodeId: string; containerUri: string; scrollKey?: string | null }) => void
  goBackFolder: () => void
  clearFolderHistory: () => void

  // Actions: file list
  openAllFilesScope: () => void
  openChatFilesScope: () => void
  selectFile: (id: string | null) => void
  openFilePreview: (id: string) => void
  openStructuredSubjectResource: (input: { documentUri: string; subject: string; targetUri: string; scrollTop?: number; rowIndex?: number | null }) => void
  restoreStructuredSubjectRoute: (input: StructuredSubjectReturnContext & { targetUri: string }) => void
  toggleFileSelection: (id: string) => void
  clearFileSelection: () => void
  setSearchText: (val: string) => void
  setSortField: (field: FileSortField) => void
  toggleSortDirection: () => void
  setMimeTypeFilter: (filter: string | null) => void
  setTagFilter: (filter: string | null) => void

  // Actions: detail
  setDetailTab: (tab: FileDetailTab) => void
  requestEditableFileSheetOpen: (uri: string) => void
  consumeEditableFileSheetOpenRequest: (uri: string) => void
  setStructuredViewMode: (mode: StructuredResourceViewMode) => void
  setStructuredClassScope: (className: string | null) => void
  setStructuredSearchText: (searchText: string) => void
  setStructuredSortKey: (sortKey: string) => void
  setStructuredSort: (sortKey: string, sortDirection: StructuredSortDirection) => void
  toggleStructuredPredicateVisibility: (predicate: string) => void
  setStructuredColumnSizing: (documentUri: string, updater: StructuredColumnSizingUpdater) => void
  hydrateStructuredViewMetadata: (metadata: StructuredViewMetadataHydrationInput, whiteboardLayoutKey: string) => void
  markStructuredViewMetadataDirty: (documentUri: string) => void
  clearStructuredViewMetadataDirty: (documentUri: string) => void
  setStructuredWhiteboardNodePosition: (layoutKey: string, subject: string, position: StructuredWhiteboardPosition) => void
  setStructuredWhiteboardVisualRelations: (documentUri: string, relations: StructuredWhiteboardVisualRelation[]) => void
  addStructuredWhiteboardSubject: (documentUri: string, subject: string) => void
  removeStructuredWhiteboardSubject: (documentUri: string, subject: string) => void
  clearStructuredWhiteboardSubjects: (documentUri: string) => void
  setStructuredKanbanGroupPredicate: (predicate: string | null) => void
  setStructuredKanbanColumnOrder: (documentUri: string, columnId: string, subjects: string[]) => void
  returnToStructuredSubject: () => void
  clearStructuredScrollRestoration: () => void
}

export function readStructuredWhiteboardLayoutsFromStorage(): Record<string, Record<string, StructuredWhiteboardPosition>> {
  try {
    const stored = globalThis.localStorage?.getItem(STRUCTURED_WHITEBOARD_LAYOUT_STORAGE_KEY)
    if (!stored) return {}
    return normalizeStructuredWhiteboardLayouts(JSON.parse(stored))
  } catch {
    return {}
  }
}

function writeStructuredWhiteboardLayoutsToStorage(layouts: Record<string, Record<string, StructuredWhiteboardPosition>>) {
  try {
    globalThis.localStorage?.setItem(STRUCTURED_WHITEBOARD_LAYOUT_STORAGE_KEY, JSON.stringify(layouts))
  } catch {
    // Layout persistence is best-effort UI state; inability to write must not block editing data.
  }
}

export function readStructuredViewConfigsFromStorage(): Record<string, StructuredViewConfig> {
  try {
    const stored = globalThis.localStorage?.getItem(STRUCTURED_VIEW_CONFIG_STORAGE_KEY)
    if (!stored) return {}
    const parsed = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object') return {}
    const configs: Record<string, StructuredViewConfig> = {}
    for (const [documentUri, config] of Object.entries(parsed as Record<string, unknown>)) {
      const normalized = normalizeStructuredViewConfig(config)
      if (normalized) configs[documentUri] = normalized
    }
    return configs
  } catch {
    return {}
  }
}

function writeStructuredViewConfigsToStorage(configs: Record<string, StructuredViewConfig>) {
  try {
    globalThis.localStorage?.setItem(STRUCTURED_VIEW_CONFIG_STORAGE_KEY, JSON.stringify(configs))
  } catch {
    // View configuration is best-effort UI state; inability to write must not block data work.
  }
}

function structuredConfigFromState(state: FilesStore): StructuredViewConfig {
  const documentUri = state.selectedFileId ?? ''
  return {
    viewMode: state.structuredViewMode,
    classScope: state.structuredClassScope,
    searchText: state.structuredSearchText,
    sortKey: state.structuredSortKey,
    sortDirection: state.structuredSortDirection,
    hiddenPredicates: Array.from(state.structuredHiddenPredicates),
    kanbanGroupPredicate: state.structuredKanbanGroupPredicate,
    kanbanOrder: documentUri ? state.structuredKanbanOrderByDocument[documentUri] ?? {} : {},
    columnSizing: documentUri ? state.structuredColumnSizingByDocument[documentUri] ?? {} : {},
  }
}

function updateStructuredViewConfig(
  state: FilesStore,
  documentUri: string | null,
  patch: Partial<StructuredViewConfig>,
): Record<string, StructuredViewConfig> {
  if (!documentUri) return state.structuredViewConfigsByDocument
  const current = state.structuredViewConfigsByDocument[documentUri] ?? structuredConfigFromState(state)
  const nextConfigs = {
    ...state.structuredViewConfigsByDocument,
    [documentUri]: {
      ...current,
      ...patch,
    },
  }
  writeStructuredViewConfigsToStorage(nextConfigs)
  return nextConfigs
}

function structuredSelectionState(
  state: FilesStore,
  documentUri: string | null,
): Pick<FilesStore, 'structuredViewMode' | 'structuredClassScope' | 'structuredSearchText' | 'structuredSortKey' | 'structuredSortDirection' | 'structuredHiddenPredicates' | 'structuredKanbanGroupPredicate'> {
  const config = documentUri ? state.structuredViewConfigsByDocument[documentUri] : null
  const resolved = config ?? DEFAULT_STRUCTURED_VIEW_CONFIG
  return {
    structuredViewMode: resolved.viewMode,
    structuredClassScope: resolved.classScope,
    structuredSearchText: resolved.searchText,
    structuredSortKey: resolved.sortKey,
    structuredSortDirection: resolved.sortDirection,
    structuredHiddenPredicates: new Set(resolved.hiddenPredicates),
    structuredKanbanGroupPredicate: resolved.kanbanGroupPredicate,
  }
}

// ============================================================================
// Store
// ============================================================================

export const useFilesStore = create<FilesStore>((set) => ({
  // Tree navigation
  selectedTreeNodeId: 'all',
  expandedTreeNodeIds: new Set<string>(),
  resourceRailCollapsed: false,
  folderHistory: [],

  // File list
  entryScope: 'all',
  selectedFileId: null,
  selectedFileIds: new Set<string>(),
  searchText: '',
  sortField: 'modifiedAt',
  sortDirection: 'desc',
  mimeTypeFilter: null,
  tagFilter: null,

  // Detail pane
  detailTab: 'preview',
  editableFileSheetOpenRequestUri: null,
  structuredViewMode: 'table',
  structuredClassScope: null,
  structuredSearchText: '',
  structuredSortKey: null,
  structuredSortDirection: 'asc',
  structuredHiddenPredicates: new Set<string>(),
  structuredViewConfigsByDocument: readStructuredViewConfigsFromStorage(),
  structuredViewDirtyDocuments: new Set<string>(),
  structuredColumnSizingByDocument: Object.fromEntries(
    Object.entries(readStructuredViewConfigsFromStorage()).map(([documentUri, config]) => [documentUri, config.columnSizing]),
  ),
  structuredWhiteboardLayoutsByDocument: readStructuredWhiteboardLayoutsFromStorage(),
  structuredWhiteboardSubjectsByDocument: {},
  structuredWhiteboardRelationsByDocument: {},
  structuredKanbanGroupPredicate: null,
  structuredKanbanOrderByDocument: Object.fromEntries(
    Object.entries(readStructuredViewConfigsFromStorage()).map(([documentUri, config]) => [documentUri, config.kanbanOrder]),
  ),
  structuredSubjectReturnContext: null,
  structuredScrollRestoration: null,

  // Actions: tree
  selectTreeNode: (id) =>
    set({
      selectedTreeNodeId: id,
      selectedFileId: null,
      selectedFileIds: new Set<string>(),
      detailTab: 'preview',
      editableFileSheetOpenRequestUri: null,
      structuredViewMode: 'table',
      structuredClassScope: null,
      structuredSearchText: '',
      structuredSortKey: null,
      structuredSortDirection: 'asc',
      structuredHiddenPredicates: new Set<string>(),
      structuredKanbanGroupPredicate: null,
      structuredSubjectReturnContext: null,
      structuredScrollRestoration: null,
      folderHistory: [],
    }),
  toggleTreeNode: (id) =>
    set((state) => {
      const next = new Set(state.expandedTreeNodeIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { expandedTreeNodeIds: next }
    }),
  toggleResourceRail: () =>
    set((state) => ({ resourceRailCollapsed: !state.resourceRailCollapsed })),
  enterFolder: ({ treeNodeId, containerUri, scrollKey = null }) =>
    set((state) => ({
      folderHistory: pushFolderHistory(state.folderHistory, {
        treeNodeId: state.selectedTreeNodeId,
        selectedFileId: state.selectedFileId,
        scrollKey,
      }),
      selectedTreeNodeId: treeNodeId,
      selectedFileId: containerUri,
      selectedFileIds: new Set<string>(),
      detailTab: 'preview',
      editableFileSheetOpenRequestUri: null,
      ...structuredSelectionState(state, containerUri),
      structuredSubjectReturnContext: null,
      structuredScrollRestoration: null,
    })),
  goBackFolder: () =>
    set((state) => {
      const back = popFolderHistory(state.folderHistory)
      if (!back.target) return state
      return {
        folderHistory: back.history,
        selectedTreeNodeId: back.target.treeNodeId,
        selectedFileId: back.target.selectedFileId,
        selectedFileIds: new Set<string>(),
        detailTab: 'preview',
        editableFileSheetOpenRequestUri: null,
        ...structuredSelectionState(state, back.target.selectedFileId),
        structuredSubjectReturnContext: null,
        structuredScrollRestoration: null,
      }
    }),
  clearFolderHistory: () => set({ folderHistory: [] }),

  // Actions: file list
  openAllFilesScope: () => set({ entryScope: 'all', folderHistory: [] }),
  openChatFilesScope: () => set({
    entryScope: 'chat-files',
    selectedTreeNodeId: 'all',
    selectedFileId: null,
    selectedFileIds: new Set<string>(),
    searchText: '',
    mimeTypeFilter: null,
    tagFilter: null,
    editableFileSheetOpenRequestUri: null,
    folderHistory: [],
  }),
  selectFile: (id) => set((state) => ({
    selectedFileId: id,
    editableFileSheetOpenRequestUri: null,
    ...structuredSelectionState(state, id),
    structuredSubjectReturnContext: null,
    structuredScrollRestoration: null,
  })),
  openFilePreview: (id) => set((state) => ({
    selectedFileId: id,
    detailTab: 'preview',
    editableFileSheetOpenRequestUri: null,
    ...structuredSelectionState(state, id),
    structuredSubjectReturnContext: null,
    structuredScrollRestoration: null,
  })),
  openStructuredSubjectResource: ({ documentUri, subject, targetUri, scrollTop = 0, rowIndex = null }) =>
    set((state) => ({
      selectedFileId: targetUri,
      detailTab: 'preview',
      editableFileSheetOpenRequestUri: shouldRequestEditableSheetForStructuredSubjectTarget(targetUri) ? targetUri : null,
      ...structuredSelectionState(state, targetUri),
      structuredSubjectReturnContext: {
        documentUri,
        subject,
        scrollTop,
        ...(rowIndex !== null && rowIndex !== undefined ? { rowIndex } : {}),
        viewMode: state.structuredViewMode,
        classScope: state.structuredClassScope,
        searchText: state.structuredSearchText,
        sortKey: state.structuredSortKey,
        sortDirection: state.structuredSortDirection,
        hiddenPredicates: Array.from(state.structuredHiddenPredicates),
        kanbanGroupPredicate: state.structuredKanbanGroupPredicate,
      },
    })),
  restoreStructuredSubjectRoute: ({ targetUri, documentUri, subject, scrollTop, rowIndex = null, viewMode, classScope, searchText, sortKey, sortDirection, hiddenPredicates, kanbanGroupPredicate }) =>
    set((state) => ({
      selectedFileId: targetUri,
      detailTab: 'preview',
      editableFileSheetOpenRequestUri: state.editableFileSheetOpenRequestUri === targetUri
        ? state.editableFileSheetOpenRequestUri
        : null,
      structuredViewMode: viewMode,
      structuredClassScope: classScope,
      structuredSearchText: searchText,
      structuredSortKey: sortKey,
      structuredSortDirection: sortDirection,
      structuredHiddenPredicates: new Set(hiddenPredicates),
      structuredKanbanGroupPredicate: kanbanGroupPredicate,
      structuredSubjectReturnContext: {
        documentUri,
        subject,
        scrollTop,
        ...(rowIndex !== null && rowIndex !== undefined ? { rowIndex } : {}),
        viewMode,
        classScope,
        searchText,
        sortKey,
        sortDirection,
        hiddenPredicates,
        kanbanGroupPredicate,
      },
    })),
  toggleFileSelection: (id) =>
    set((state) => {
      const next = new Set(state.selectedFileIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selectedFileIds: next }
    }),
  clearFileSelection: () => set({ selectedFileIds: new Set() }),
  setSearchText: (searchText) => set({ searchText }),
  setSortField: (sortField) => set({ sortField }),
  toggleSortDirection: () =>
    set((state) => ({ sortDirection: state.sortDirection === 'asc' ? 'desc' : 'asc' })),
  setMimeTypeFilter: (mimeTypeFilter) => set({ mimeTypeFilter }),
  setTagFilter: (tagFilter) => set({ tagFilter }),

  // Actions: detail
  setDetailTab: (detailTab) => set({ detailTab }),
  requestEditableFileSheetOpen: (editableFileSheetOpenRequestUri) => set({ editableFileSheetOpenRequestUri }),
  consumeEditableFileSheetOpenRequest: (uri) =>
    set((state) => state.editableFileSheetOpenRequestUri === uri
      ? { editableFileSheetOpenRequestUri: null }
      : {}),
  setStructuredViewMode: (structuredViewMode) =>
    set((state) => ({
      structuredViewMode,
      structuredViewConfigsByDocument: updateStructuredViewConfig(state, state.selectedFileId, { viewMode: structuredViewMode }),
    })),
  setStructuredClassScope: (structuredClassScope) =>
    set((state) => ({
      structuredClassScope,
      structuredViewConfigsByDocument: updateStructuredViewConfig(state, state.selectedFileId, { classScope: structuredClassScope }),
    })),
  setStructuredSearchText: (structuredSearchText) =>
    set((state) => ({
      structuredSearchText,
      structuredViewConfigsByDocument: updateStructuredViewConfig(state, state.selectedFileId, { searchText: structuredSearchText }),
    })),
  setStructuredSortKey: (structuredSortKey) =>
    set((state) => {
      const structuredSortDirection = state.structuredSortKey === structuredSortKey && state.structuredSortDirection === 'asc' ? 'desc' : 'asc'
      return {
        structuredSortKey,
        structuredSortDirection,
        structuredViewConfigsByDocument: updateStructuredViewConfig(state, state.selectedFileId, {
          sortKey: structuredSortKey,
          sortDirection: structuredSortDirection,
        }),
      }
    }),
  setStructuredSort: (structuredSortKey, structuredSortDirection) =>
    set((state) => ({
      structuredSortKey,
      structuredSortDirection,
      structuredViewConfigsByDocument: updateStructuredViewConfig(state, state.selectedFileId, {
        sortKey: structuredSortKey,
        sortDirection: structuredSortDirection,
      }),
    })),
  toggleStructuredPredicateVisibility: (predicate) =>
    set((state) => {
      const next = new Set(state.structuredHiddenPredicates)
      if (next.has(predicate)) next.delete(predicate)
      else next.add(predicate)
      return {
        structuredHiddenPredicates: next,
        structuredViewConfigsByDocument: updateStructuredViewConfig(state, state.selectedFileId, {
          hiddenPredicates: Array.from(next),
        }),
      }
    }),
  setStructuredColumnSizing: (documentUri, updater) =>
    set((state) => {
      const currentSizing = state.structuredColumnSizingByDocument[documentUri] ?? {}
      const nextSizing = typeof updater === 'function' ? updater(currentSizing) : updater
      return {
        structuredViewConfigsByDocument: updateStructuredViewConfig(state, documentUri, {
          columnSizing: nextSizing,
        }),
        structuredColumnSizingByDocument: {
          ...state.structuredColumnSizingByDocument,
          [documentUri]: nextSizing,
        },
      }
    }),
  hydrateStructuredViewMetadata: (metadata, whiteboardLayoutKey) =>
    set((state) => {
      const nextConfig: StructuredViewConfig = {
        viewMode: metadata.viewMode,
        classScope: metadata.classScope,
        searchText: metadata.searchText,
        sortKey: metadata.sortKey,
        sortDirection: metadata.sortDirection,
        hiddenPredicates: metadata.hiddenPredicates,
        kanbanGroupPredicate: metadata.kanbanGroupPredicate,
        kanbanOrder: metadata.kanbanOrder,
        columnSizing: metadata.columnSizing,
      }
      const nextConfigs = {
        ...state.structuredViewConfigsByDocument,
        [metadata.documentUri]: nextConfig,
      }
      const nextLayouts = {
        ...state.structuredWhiteboardLayoutsByDocument,
        [whiteboardLayoutKey]: metadata.whiteboard.positions,
      }
      writeStructuredViewConfigsToStorage(nextConfigs)
      writeStructuredWhiteboardLayoutsToStorage(nextLayouts)
      return {
        ...(state.selectedFileId === metadata.documentUri
          ? {
              structuredViewMode: metadata.viewMode,
              structuredClassScope: metadata.classScope,
              structuredSearchText: metadata.searchText,
              structuredSortKey: metadata.sortKey,
              structuredSortDirection: metadata.sortDirection,
              structuredHiddenPredicates: new Set(metadata.hiddenPredicates),
              structuredKanbanGroupPredicate: metadata.kanbanGroupPredicate,
            }
          : {}),
        structuredViewConfigsByDocument: nextConfigs,
        structuredColumnSizingByDocument: {
          ...state.structuredColumnSizingByDocument,
          [metadata.documentUri]: metadata.columnSizing,
        },
        structuredKanbanOrderByDocument: {
          ...state.structuredKanbanOrderByDocument,
          [metadata.documentUri]: metadata.kanbanOrder,
        },
        structuredWhiteboardSubjectsByDocument: {
          ...state.structuredWhiteboardSubjectsByDocument,
          [metadata.documentUri]: metadata.whiteboard.selectedSubjects,
        },
        structuredWhiteboardRelationsByDocument: {
          ...state.structuredWhiteboardRelationsByDocument,
          [metadata.documentUri]: metadata.whiteboard.visualRelations ?? [],
        },
        structuredWhiteboardLayoutsByDocument: nextLayouts,
      }
    }),
  markStructuredViewMetadataDirty: (documentUri) =>
    set((state) => {
      if (state.structuredViewDirtyDocuments.has(documentUri)) return state
      const next = new Set(state.structuredViewDirtyDocuments)
      next.add(documentUri)
      return { structuredViewDirtyDocuments: next }
    }),
  clearStructuredViewMetadataDirty: (documentUri) =>
    set((state) => {
      if (!state.structuredViewDirtyDocuments.has(documentUri)) return state
      const next = new Set(state.structuredViewDirtyDocuments)
      next.delete(documentUri)
      return { structuredViewDirtyDocuments: next }
    }),
  setStructuredWhiteboardNodePosition: (layoutKey, subject, position) =>
    set((state) => {
      const nextLayouts = {
        ...state.structuredWhiteboardLayoutsByDocument,
        [layoutKey]: {
          ...(state.structuredWhiteboardLayoutsByDocument[layoutKey] ?? {}),
          [subject]: position,
        },
      }
      writeStructuredWhiteboardLayoutsToStorage(nextLayouts)
      return { structuredWhiteboardLayoutsByDocument: nextLayouts }
    }),
  setStructuredWhiteboardVisualRelations: (documentUri, relations) =>
    set((state) => ({
      structuredWhiteboardRelationsByDocument: {
        ...state.structuredWhiteboardRelationsByDocument,
        [documentUri]: relations.filter((relation) => relation.id && relation.from && relation.to),
      },
    })),
  addStructuredWhiteboardSubject: (documentUri, subject) =>
    set((state) => {
      const current = state.structuredWhiteboardSubjectsByDocument[documentUri] ?? []
      if (current.includes(subject)) return {}
      return {
        structuredWhiteboardSubjectsByDocument: {
          ...state.structuredWhiteboardSubjectsByDocument,
          [documentUri]: [...current, subject],
        },
      }
    }),
  removeStructuredWhiteboardSubject: (documentUri, subject) =>
    set((state) => {
      const current = state.structuredWhiteboardSubjectsByDocument[documentUri] ?? []
      const nextSubjects = current.filter((candidate) => candidate !== subject)
      const currentRelations = state.structuredWhiteboardRelationsByDocument[documentUri] ?? []
      return {
        structuredWhiteboardSubjectsByDocument: {
          ...state.structuredWhiteboardSubjectsByDocument,
          [documentUri]: nextSubjects,
        },
        structuredWhiteboardRelationsByDocument: {
          ...state.structuredWhiteboardRelationsByDocument,
          [documentUri]: currentRelations.filter((relation) => relation.from !== subject && relation.to !== subject),
        },
      }
    }),
  clearStructuredWhiteboardSubjects: (documentUri) =>
    set((state) => ({
      structuredWhiteboardSubjectsByDocument: {
        ...state.structuredWhiteboardSubjectsByDocument,
        [documentUri]: [],
      },
      structuredWhiteboardRelationsByDocument: {
        ...state.structuredWhiteboardRelationsByDocument,
        [documentUri]: [],
      },
    })),
  setStructuredKanbanGroupPredicate: (structuredKanbanGroupPredicate) =>
    set((state) => ({
      structuredKanbanGroupPredicate,
      structuredViewConfigsByDocument: updateStructuredViewConfig(state, state.selectedFileId, { kanbanGroupPredicate: structuredKanbanGroupPredicate }),
    })),
  setStructuredKanbanColumnOrder: (documentUri, columnId, subjects) =>
    set((state) => {
      const currentOrder = state.structuredKanbanOrderByDocument[documentUri] ?? {}
      const nextColumnOrder = Array.from(new Set(subjects.filter(Boolean)))
      const nextOrder = {
        ...currentOrder,
        [columnId]: nextColumnOrder,
      }
      return {
        structuredViewConfigsByDocument: updateStructuredViewConfig(state, documentUri, {
          kanbanOrder: nextOrder,
        }),
        structuredKanbanOrderByDocument: {
          ...state.structuredKanbanOrderByDocument,
          [documentUri]: nextOrder,
        },
      }
    }),
  returnToStructuredSubject: () =>
    set((state) => {
      const context = state.structuredSubjectReturnContext
      if (!context) return {}
      return {
        selectedFileId: context.documentUri,
        detailTab: 'preview',
        structuredViewMode: context.viewMode,
        structuredClassScope: context.classScope,
        structuredSearchText: context.searchText,
        structuredSortKey: context.sortKey,
        structuredSortDirection: context.sortDirection,
        structuredHiddenPredicates: new Set(context.hiddenPredicates),
        structuredKanbanGroupPredicate: context.kanbanGroupPredicate,
        structuredSubjectReturnContext: null,
        editableFileSheetOpenRequestUri: null,
        structuredScrollRestoration: {
          documentUri: context.documentUri,
          subject: context.subject,
          scrollTop: context.scrollTop,
          ...(context.rowIndex !== null && context.rowIndex !== undefined ? { rowIndex: context.rowIndex } : {}),
        },
      }
    }),
  clearStructuredScrollRestoration: () => set({ structuredScrollRestoration: null }),
}))
