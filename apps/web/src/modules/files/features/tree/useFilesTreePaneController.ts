import { useCallback, useMemo, useState } from 'react'

import { useFilesStore } from '../../app/store'
import {
  filesFavoriteHooks,
  useFilesContainerEntries,
  useFilesCurrentPodRootUri,
  useFilesEntries,
  useFilesFavoriteList,
  useFilesTreeSearchEntries,
  useSelectedFilesLocation,
  useSharedWithMe,
} from '../../data/queries'
import { projectFilesAddContainerUri } from '../../domain/list/files-add-menu-model'
import { normalizeContainerUri } from '../../domain/resource/resource-semantics'
import { ALL_FILES_NODE_ID, type FilesEntry } from '../../domain/resource/resource-model'
import {
  createContainerNodeId,
  createResourceNodeId,
  projectFilesTreeChromeModel,
  projectFilesTreeSearchResults,
} from '../../domain/resource/tree-model'
import { useFilesExplorerDataController } from '../list/useFilesExplorerDataController'

/**
 * R6 K0 desktop tree: search + folder tree (我的空间 / 共享给我) that lists containers and
 * data tables only. It reuses the explorer projection that compact `FilesListPane` uses;
 * selecting a folder shows its table in the workspace.
 */
export function useFilesTreePaneController() {
  const selectedTreeNodeId = useFilesStore((state) => state.selectedTreeNodeId)
  const selectedFileId = useFilesStore((state) => state.selectedFileId)
  const selectTreeNode = useFilesStore((state) => state.selectTreeNode)
  const selectFile = useFilesStore((state) => state.selectFile)
  const { data: favorites = [] } = useFilesFavoriteList({ sourceModule: 'files' })
  const rootEntriesQuery = useFilesEntries(ALL_FILES_NODE_ID, 'all')
  const rootEntries = useMemo(() => rootEntriesQuery.data ?? [], [rootEntriesQuery.data])
  const sharedWithMe = useSharedWithMe()
  const explorer = useFilesExplorerDataController({
    entryScope: 'all',
    rootEntries,
    searchText: '',
    groups: true,
    treeOnly: true,
    sharedWithMe,
  })
  const chrome = useMemo(() => projectFilesTreeChromeModel(), [])

  const [searchText, setSearchText] = useState('')
  const searchActive = searchText.trim().length > 0
  const searchEntriesQuery = useFilesTreeSearchEntries(searchActive)
  const searchResults = useMemo(() => projectFilesTreeSearchResults({
    entries: searchEntriesQuery.data ?? [],
    query: searchText,
  }), [searchEntriesQuery.data, searchText])

  const selectEntry = useCallback((entry: FilesEntry) => {
    if (entry.kind === 'container') {
      selectTreeNode(createContainerNodeId(entry.uri), entry.uri)
      return
    }
    selectFile(entry.uri)
  }, [selectFile, selectTreeNode])

  /** Clicking a folder shows its table and opens it in the tree. */
  const activateEntry = useCallback((entry: FilesEntry) => {
    selectEntry(entry)
    if (entry.kind === 'container' && !explorer.isExpanded(entry)) explorer.toggleFolder(entry.uri)
  }, [explorer, selectEntry])

  const openSearchResult = useCallback((entry: FilesEntry) => {
    if (entry.kind === 'container') {
      selectTreeNode(createContainerNodeId(entry.uri), entry.uri)
      return
    }
    selectTreeNode(createResourceNodeId(entry.uri), entry.uri)
  }, [selectTreeNode])

  const isEntrySelected = useCallback((entry: FilesEntry) => {
    if (!selectedFileId) return false
    return entry.kind === 'container'
      ? normalizeContainerUri(entry.uri) === normalizeContainerUri(selectedFileId)
      : entry.uri === selectedFileId
  }, [selectedFileId])

  const isEntryFavorite = useCallback(
    (entry: FilesEntry) => favorites.some((favorite) => favorite.sourceId === entry.uri),
    [favorites],
  )
  const toggleEntryFavorite = useCallback((entry: FilesEntry) => {
    void filesFavoriteHooks.onStarredChange('files', entry.uri, !isEntryFavorite(entry), {
      title: entry.name,
      searchText: entry.name,
      snapshotMeta: JSON.stringify({ fileId: entry.uri, treeNodeId: createContainerNodeId(entry.uri) }),
    })
  }, [isEntryFavorite])

  const selection = useSelectedFilesLocation(selectedTreeNodeId)
  const podRootUri = useFilesCurrentPodRootUri()
  // Nothing (or a non-folder view) selected: 添加 goes to the top of 我的空间 instead of being disabled.
  const addContainerUri = useMemo(
    () => projectFilesAddContainerUri(selection) ?? podRootUri,
    [podRootUri, selection],
  )
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const addEntriesQuery = useFilesContainerEntries(addContainerUri, addMenuOpen)

  return {
    activateEntry,
    addContainerUri,
    addEntries: addEntriesQuery.data ?? [],
    addMenuOpen,
    chrome,
    explorer,
    isEntryFavorite,
    isEntrySelected,
    onAddMenuOpenChange: setAddMenuOpen,
    onSearchTextChange: setSearchText,
    openSearchResult,
    rootError: rootEntriesQuery.error,
    rootLoading: rootEntriesQuery.isLoading,
    searchActive,
    searchLoading: searchActive && searchEntriesQuery.isLoading,
    searchResults,
    searchText,
    toggleEntryFavorite,
  }
}
