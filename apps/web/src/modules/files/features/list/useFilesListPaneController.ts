import { useCallback, useMemo } from 'react'

import { copyFilesText } from '../../app/platform-actions'
import { useFilesStore } from '../../app/store'
import { useFilesEntries, useSelectedFilesLocation } from '../../data/queries'
import {
  projectFilesListCopyText,
  projectFilesListContentState,
  projectFilesListEmptyStateModel,
  projectFilesListScopeHeaderModel,
  projectFilesListToolbarChromeModel,
  projectFilesListVisibleRows,
  type FilesListSortField,
} from '../../domain/list/list-view-model'
import { resolveFilesListOpenDecision, type FilesListOpenTrigger } from '../../domain/list/list-open'
import {
  getVisibleMimeTypeOptions,
  getVisibleTagOptions,
  projectFilesListBaseEntries,
  projectVisibleFiles,
} from '../../domain/list/list-projection'
import { getFilesListErrorState } from '../../domain/resource/files-error-state'
import type { FilesEntry } from '../../domain/resource/resource-model'
import { projectFilesListColumnHeaders, projectFilesListSortOptions } from './files-list-column-header-model'

export function useFilesListPaneController() {
  const selectFile = useFilesStore((s) => s.selectFile)
  const selectedTreeNodeId = useFilesStore((s) => s.selectedTreeNodeId)
  const selectTreeNode = useFilesStore((s) => s.selectTreeNode)
  const searchText = useFilesStore((s) => s.searchText)
  const setSearchText = useFilesStore((s) => s.setSearchText)
  const mimeTypeFilter = useFilesStore((s) => s.mimeTypeFilter)
  const setMimeTypeFilter = useFilesStore((s) => s.setMimeTypeFilter)
  const tagFilter = useFilesStore((s) => s.tagFilter)
  const setTagFilter = useFilesStore((s) => s.setTagFilter)
  const sortField = useFilesStore((s) => s.sortField)
  const sortDirection = useFilesStore((s) => s.sortDirection)
  const setSortField = useFilesStore((s) => s.setSortField)
  const toggleSortDirection = useFilesStore((s) => s.toggleSortDirection)
  const entryScope = useFilesStore((s) => s.entryScope)
  const setDetailTab = useFilesStore((s) => s.setDetailTab)
  const requestEditableFileSheetOpen = useFilesStore((s) => s.requestEditableFileSheetOpen)
  const { data: rawEntries = [], isLoading, error } = useFilesEntries(selectedTreeNodeId, entryScope)
  const selection = useSelectedFilesLocation(selectedTreeNodeId)

  const baseEntries = useMemo(
    () => projectFilesListBaseEntries(rawEntries, selection),
    [rawEntries, selection],
  )

  const files = useMemo(() => projectVisibleFiles(baseEntries, {
    mimeTypeFilter,
    tagFilter,
    searchText,
    sortField,
    sortDirection,
  }), [baseEntries, mimeTypeFilter, searchText, sortDirection, sortField, tagFilter])

  const mimeTypeOptions = useMemo(() => getVisibleMimeTypeOptions(baseEntries), [baseEntries])
  const tagOptions = useMemo(() => getVisibleTagOptions(baseEntries), [baseEntries])
  const columnHeaders = useMemo(() => projectFilesListColumnHeaders(), [])
  const sortOptions = useMemo(() => projectFilesListSortOptions(), [])
  const scopeHeader = useMemo(() => projectFilesListScopeHeaderModel({ selection }), [selection])
  const toolbarChrome = useMemo(() => projectFilesListToolbarChromeModel(), [])
  const showRecentScopeHeader = Boolean(scopeHeader)
  const hasVisibleFiles = files.length > 0
  const contentState = projectFilesListContentState({
    hasError: !!error,
    hasVisibleFiles,
    isLoading,
  })
  const canFilterByTag = tagOptions.length > 0
  const visibleRows = useMemo(
    () => projectFilesListVisibleRows(files, { showParentPath: showRecentScopeHeader }),
    [files, showRecentScopeHeader],
  )

  const openFile = useCallback(
    (file: FilesEntry, trigger: FilesListOpenTrigger) => {
      const decision = resolveFilesListOpenDecision(file, trigger)
      switch (decision.type) {
        case 'browse-container':
          selectTreeNode(decision.treeNodeId)
          break
        case 'select-file':
          selectFile(decision.fileUri)
          break
        case 'select-file-preview':
          selectFile(decision.fileUri)
          setDetailTab('preview')
          break
        case 'open-editable-sheet':
          selectFile(decision.fileUri)
          setDetailTab('preview')
          requestEditableFileSheetOpen(decision.fileUri)
          break
      }
    },
    [requestEditableFileSheetOpen, selectFile, selectTreeNode, setDetailTab],
  )

  const sortList = useCallback((field: FilesListSortField) => {
    if (sortField === field) {
      toggleSortDirection()
      return
    }
    setSortField(field)
  }, [setSortField, sortField, toggleSortDirection])

  const copyFiles = useCallback((filesToCopy: FilesEntry[]) => {
    void copyFilesText(projectFilesListCopyText(filesToCopy))
  }, [])

  const emptyState = useMemo(() => projectFilesListEmptyStateModel({
    entryScope,
    mimeTypeFilter,
    searchText,
    selection,
    tagFilter,
  }), [entryScope, mimeTypeFilter, searchText, selection, tagFilter])

  const errorState = useMemo(() => getFilesListErrorState(error), [error])

  return {
    baseEntries,
    columnHeaders,
    contentState,
    copyFiles,
    emptyState,
    error,
    errorState,
    files,
    hasVisibleFiles,
    isLoading,
    canFilterByTag,
    mimeTypeFilter,
    mimeTypeOptions,
    openFile,
    searchText,
    selectFile,
    selection,
    setMimeTypeFilter,
    setSearchText,
    setTagFilter,
    showRecentScopeHeader,
    scopeHeader,
    sortField,
    sortDirection,
    sortList,
    sortOptions,
    tagFilter,
    tagOptions,
    toolbarChrome,
    visibleRows,
  }
}
