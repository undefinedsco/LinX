import { useCallback, useMemo } from 'react'

import { copyFilesText } from '../../app/platform-actions'
import { useFilesStore, type FilesSidecarAction } from '../../app/store'
import {
  filesFavoriteHooks,
  useFilesEntries,
  useFilesFavoriteList,
  useSelectedFilesLocation,
} from '../../data/queries'
import {
  projectFilesListCopyText,
  projectFilesListContentState,
  projectFilesListEmptyStateModel,
  projectFilesListScopeHeaderModel,
  projectFilesListScopeControlModel,
  projectFilesListToolbarChromeModel,
  projectFilesListVisibleRows,
  type FilesListSortField,
  type FilesBrowserScopeId,
} from '../../domain/list/list-view-model'
import { resolveFilesListOpenDecision, type FilesListOpenTrigger } from '../../domain/list/list-open'
import { projectCurrentFolderPath } from '../../domain/list/folder-history'
import { projectFilesExplorerRows } from '../../domain/list/explorer-tree-model'
import { projectFilesAddContainerUri } from '../../domain/list/files-add-menu-model'
import {
  getVisibleMimeTypeOptions,
  getVisibleTagOptions,
  projectFilesListBaseEntries,
  projectVisibleFiles,
} from '../../domain/list/list-projection'
import { getFilesListErrorState } from '../../domain/resource/files-error-state'
import type { FilesEntry } from '../../domain/resource/resource-model'
import { ALL_FILES_NODE_ID, RECENT_FILES_NODE_ID } from '../../domain/resource/resource-model'
import { projectFilesListColumnHeaders, projectFilesListSortOptions } from './files-list-column-header-model'
import {
  planFileDetailFavoriteToggle,
  projectFileDetailFavoriteState,
} from '../detail/file-detail-pane-model'

export function useFilesListPaneController() {
  const selectFile = useFilesStore((s) => s.selectFile)
  const selectedTreeNodeId = useFilesStore((s) => s.selectedTreeNodeId)
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
  const openAllFilesScope = useFilesStore((s) => s.openAllFilesScope)
  const openChatFilesScope = useFilesStore((s) => s.openChatFilesScope)
  const selectTreeNode = useFilesStore((s) => s.selectTreeNode)
  const setDetailTab = useFilesStore((s) => s.setDetailTab)
  const requestEditableFileSheetOpen = useFilesStore((s) => s.requestEditableFileSheetOpen)
  const requestSidecarAction = useFilesStore((s) => s.requestSidecarAction)
  const folderHistory = useFilesStore((s) => s.folderHistory)
  const goBackFolder = useFilesStore((s) => s.goBackFolder)
  const enterFolder = useFilesStore((s) => s.enterFolder)
  const { data: rawEntries = [], isLoading, error, refetch: refetchEntries } = useFilesEntries(selectedTreeNodeId, entryScope)
  const { data: favorites = [] } = useFilesFavoriteList({ sourceModule: 'files' })
  const selection = useSelectedFilesLocation(selectedTreeNodeId)
  const currentPathLabel = useMemo(() => projectCurrentFolderPath(selection), [selection])
  const addContainerUri = useMemo(() => projectFilesAddContainerUri(selection), [selection])

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
  const scopeControl = useMemo(
    () => projectFilesListScopeControlModel({ entryScope, selection }),
    [entryScope, selection],
  )
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
  const explorerRows = useMemo(
    () => projectFilesExplorerRows({
      rootEntries: files,
      expandedUris: new Set(),
      childEntriesByContainerUri: {},
      loadingContainerUris: new Set(),
      errorByContainerUri: {},
      searchText: '',
    }),
    [files],
  )

  const openFile = useCallback(
    (file: FilesEntry, trigger: FilesListOpenTrigger) => {
      const decision = resolveFilesListOpenDecision(file, trigger)
      switch (decision.type) {
        case 'browse-container':
          enterFolder({ treeNodeId: decision.treeNodeId, containerUri: file.uri })
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
    [enterFolder, requestEditableFileSheetOpen, selectFile, setDetailTab],
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

  const openSidecar = useCallback((file: FilesEntry, action: FilesSidecarAction) => {
    selectFile(file.uri)
    requestSidecarAction({ uri: file.uri, action })
  }, [requestSidecarAction, selectFile])

  const isFileFavorite = useCallback(
    (file: FilesEntry) => projectFileDetailFavoriteState({ file, favorites }),
    [favorites],
  )

  const toggleFileFavorite = useCallback(async (file: FilesEntry) => {
    const plan = planFileDetailFavoriteToggle({
      file,
      isFavorite: projectFileDetailFavoriteState({ file, favorites }),
      selectedTreeNodeId,
    })
    if (!plan) return
    await filesFavoriteHooks.onStarredChange(plan.sourceModule, plan.sourceId, plan.starred, plan.metadata)
  }, [favorites, selectedTreeNodeId])

  const changeBrowserScope = useCallback((scope: FilesBrowserScopeId) => {
    if (scope === 'chat-files') {
      openChatFilesScope()
      return
    }

    openAllFilesScope()
    selectTreeNode(scope === 'recent' ? RECENT_FILES_NODE_ID : ALL_FILES_NODE_ID)
  }, [openAllFilesScope, openChatFilesScope, selectTreeNode])

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
    addContainerUri,
    columnHeaders,
    contentState,
    copyFiles,
    emptyState,
    entryScope,
    error,
    errorState,
    files,
    hasVisibleFiles,
    isLoading,
    isFileFavorite,
    canFilterByTag,
    canGoBack: folderHistory.length > 0,
    currentPathLabel,
    mimeTypeFilter,
    mimeTypeOptions,
    openFile,
    openSidecar,
    retryEntries: () => { void refetchEntries() },
    goBackFolder,
    searchText,
    scopeControl,
    changeBrowserScope,
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
    toggleFileFavorite,
    explorerRows,
    visibleRows,
  }
}
