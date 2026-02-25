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

// ============================================================================
// Types
// ============================================================================

/** Virtual tree node types (section 8.2 of feature plan) */
export type TreeNodeType =
  | 'all'
  | 'recent'
  | 'starred'
  | 'by-session'
  | 'by-import'
  | 'pod-directory'

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

/** Sort field for file list */
export type FileSortField = 'name' | 'mimeType' | 'size' | 'modifiedAt' | 'syncStatus'
export type SortDirection = 'asc' | 'desc'

// ============================================================================
// Store Interface
// ============================================================================

interface FilesStore {
  // Tree navigation
  selectedTreeNodeId: string | null
  expandedTreeNodeIds: Set<string>

  // File list
  selectedFileId: string | null
  selectedFileIds: Set<string>
  searchText: string
  sortField: FileSortField
  sortDirection: SortDirection
  mimeTypeFilter: string | null

  // Detail pane
  detailTab: FileDetailTab

  // Actions: tree
  selectTreeNode: (id: string | null) => void
  toggleTreeNode: (id: string) => void

  // Actions: file list
  selectFile: (id: string | null) => void
  toggleFileSelection: (id: string) => void
  clearFileSelection: () => void
  setSearchText: (val: string) => void
  setSortField: (field: FileSortField) => void
  toggleSortDirection: () => void
  setMimeTypeFilter: (filter: string | null) => void

  // Actions: detail
  setDetailTab: (tab: FileDetailTab) => void
}

// ============================================================================
// Store
// ============================================================================

export const useFilesStore = create<FilesStore>((set) => ({
  // Tree navigation
  selectedTreeNodeId: 'all',
  expandedTreeNodeIds: new Set<string>(),

  // File list
  selectedFileId: null,
  selectedFileIds: new Set<string>(),
  searchText: '',
  sortField: 'modifiedAt',
  sortDirection: 'desc',
  mimeTypeFilter: null,

  // Detail pane
  detailTab: 'preview',

  // Actions: tree
  selectTreeNode: (id) => set({ selectedTreeNodeId: id }),
  toggleTreeNode: (id) =>
    set((state) => {
      const next = new Set(state.expandedTreeNodeIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { expandedTreeNodeIds: next }
    }),

  // Actions: file list
  selectFile: (id) => set({ selectedFileId: id }),
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

  // Actions: detail
  setDetailTab: (detailTab) => set({ detailTab }),
}))
