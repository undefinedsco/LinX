import { useCallback, useMemo, useState } from 'react'

import { useFilesStore } from '../../app/store'
import {
  filesFavoriteHooks,
  useContainerChildTreeNodes,
  useFilesContainerEntries,
  useFilesFavoriteList,
  useFilesRootNodes,
  useFilesTreeSearchEntries,
  useSelectedFilesLocation,
} from '../../data/queries'
import {
  type FilesEntry,
  type FilesTreeNode,
} from '../../domain/resource/resource-model'
import { projectFilesAddContainerUri } from '../../domain/list/files-add-menu-model'
import {
  createContainerNodeId,
  createResourceNodeId,
  pinFavoriteTreeNodesFirst,
  projectFilesTreeChildrenState,
  projectFilesTreeChromeModel,
  projectFilesTreeContentState,
  projectFilesTreeFooterLabel,
  projectFilesTreeNodeViewState,
  projectFilesTreeSearchResults,
} from '../../domain/resource/tree-model'

export type FilesTreeNodeViewModel = {
  isSelected: boolean
  isExpanded: boolean
  canExpand: boolean
  isLoading?: boolean
  toggleLabel: string
  onSelect: () => void
  onToggle: () => void
  isFavorite: boolean
  onToggleFavorite: (() => void) | null
  onOpenSidecar: ((action: 'meta' | 'access') => void) | null
}

function useFilesTreeNodeState(options?: { rootLoading?: boolean }) {
  const selectedTreeNodeId = useFilesStore((state) => state.selectedTreeNodeId)
  const expandedTreeNodeIds = useFilesStore((state) => state.expandedTreeNodeIds)
  const selectTreeNode = useFilesStore((state) => state.selectTreeNode)
  const toggleTreeNode = useFilesStore((state) => state.toggleTreeNode)
  const requestSidecarAction = useFilesStore((state) => state.requestSidecarAction)
  const { data: favorites = [] } = useFilesFavoriteList({ sourceModule: 'files' })

  const projectNode = useCallback((node: FilesTreeNode): FilesTreeNodeViewModel => {
    const isFavorite = !!node.uri && favorites.some((favorite) => favorite.sourceId === node.uri)
    return {
      ...projectFilesTreeNodeViewState({
      expandedTreeNodeIds,
      node,
      rootLoading: options?.rootLoading,
      selectedTreeNodeId,
      }),
      isFavorite,
      onSelect: () => selectTreeNode(
        node.id,
        node.type === 'local-workspace' ? null : node.uri ?? null,
      ),
      onToggle: () => toggleTreeNode(node.id),
      onToggleFavorite: node.uri ? () => {
        void filesFavoriteHooks.onStarredChange('files', node.uri!, !isFavorite, {
          title: node.label,
          searchText: node.label,
          snapshotMeta: JSON.stringify({ fileId: node.uri, treeNodeId: node.id }),
        })
      } : null,
      onOpenSidecar: node.uri ? (action) => {
        selectTreeNode(node.id, node.uri ?? null)
        requestSidecarAction({ uri: node.uri!, action })
      } : null,
    }
  }, [expandedTreeNodeIds, favorites, options?.rootLoading, requestSidecarAction, selectTreeNode, selectedTreeNodeId, toggleTreeNode])

  return {
    expandedTreeNodeIds,
    favorites,
    projectNode,
    selectedTreeNodeId,
    selectTreeNode,
    toggleTreeNode,
  }
}

export function useFilesTreePaneController() {
  const { data, isLoading, error } = useFilesRootNodes()
  const treeNodes = useMemo(() => data?.nodes ?? [], [data?.nodes])
  const contentState = projectFilesTreeContentState({
    error,
    isLoading,
    treeNodes,
  })
  const chrome = useMemo(() => projectFilesTreeChromeModel(), [])
  const nodeState = useFilesTreeNodeState({ rootLoading: isLoading })
  const footerLabel = projectFilesTreeFooterLabel({
    selectedTreeNodeId: nodeState.selectedTreeNodeId,
    treeNodes,
  })

  const [searchText, setSearchText] = useState('')
  const searchActive = searchText.trim().length > 0
  const searchEntriesQuery = useFilesTreeSearchEntries(searchActive)
  const searchResults = useMemo(() => projectFilesTreeSearchResults({
    entries: searchEntriesQuery.data ?? [],
    query: searchText,
  }), [searchEntriesQuery.data, searchText])
  const openSearchResult = useCallback((entry: FilesEntry) => {
    if (entry.kind === 'container') {
      nodeState.selectTreeNode(createContainerNodeId(entry.uri), entry.uri)
      return
    }
    nodeState.selectTreeNode(createResourceNodeId(entry.uri), entry.uri)
  }, [nodeState])

  const selection = useSelectedFilesLocation(nodeState.selectedTreeNodeId)
  const addContainerUri = useMemo(() => projectFilesAddContainerUri(selection), [selection])
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const addEntriesQuery = useFilesContainerEntries(addContainerUri, addMenuOpen)

  return {
    addContainerUri,
    addEntries: addEntriesQuery.data ?? [],
    addMenuOpen,
    chrome,
    contentState,
    footerLabel,
    onAddMenuOpenChange: setAddMenuOpen,
    onSearchTextChange: setSearchText,
    openSearchResult,
    searchActive,
    searchLoading: searchActive && searchEntriesQuery.isLoading,
    searchResults,
    searchText,
    selectedTreeNodeId: nodeState.selectedTreeNodeId,
    selectTreeNode: nodeState.selectTreeNode,
    treeNodes,
    projectNode: nodeState.projectNode,
  }
}

export function useFilesTreeChildrenController(parentNode: FilesTreeNode) {
  const { data: childNodes = [], isLoading } = useContainerChildTreeNodes(parentNode)
  const nodeState = useFilesTreeNodeState()
  const sortedChildNodes = useMemo(() => pinFavoriteTreeNodesFirst(childNodes, nodeState.favorites), [childNodes, nodeState.favorites])
  const childrenState = projectFilesTreeChildrenState({
    childNodes: sortedChildNodes,
    isLoading,
  })
  const chrome = useMemo(() => projectFilesTreeChromeModel(), [])

  return {
    childrenState,
    childNodes: sortedChildNodes,
    chrome,
    projectNode: nodeState.projectNode,
  }
}
