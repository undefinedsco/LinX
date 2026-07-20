import { useCallback, useMemo } from 'react'

import { useFilesStore } from '../../app/store'
import {
  filesFavoriteHooks,
  useActiveFilesWorkspaceContext,
  useContainerChildTreeNodes,
  useFilesFavoriteList,
  useFilesRootNodes,
} from '../../data/queries'
import {
  type FilesTreeNode,
} from '../../domain/resource/resource-model'
import {
  projectFilesTreeChildrenState,
  projectFilesTreeChromeModel,
  projectFilesTreeContentState,
  projectFilesTreeHeaderDescription,
  projectFilesTreeNodeViewState,
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
    projectNode,
    selectedTreeNodeId,
    selectTreeNode,
    toggleTreeNode,
  }
}

export function useFilesTreePaneController() {
  const resourceRailCollapsed = useFilesStore((state) => state.resourceRailCollapsed)
  const toggleResourceRail = useFilesStore((state) => state.toggleResourceRail)
  const { workspaceUri, threadTitle } = useActiveFilesWorkspaceContext()
  const { data, isLoading, error } = useFilesRootNodes()
  const treeNodes = useMemo(() => data?.nodes ?? [], [data?.nodes])
  const contentState = projectFilesTreeContentState({
    error,
    isLoading,
    treeNodes,
  })
  const chrome = useMemo(() => projectFilesTreeChromeModel(), [])
  const nodeState = useFilesTreeNodeState({ rootLoading: isLoading })
  const description = projectFilesTreeHeaderDescription({ threadTitle, workspaceUri })

  return {
    chrome,
    contentState,
    description,
    resourceRailCollapsed,
    selectedTreeNodeId: nodeState.selectedTreeNodeId,
    selectTreeNode: nodeState.selectTreeNode,
    toggleResourceRail,
    treeNodes,
    projectNode: nodeState.projectNode,
  }
}

export function useFilesTreeChildrenController(parentNode: FilesTreeNode) {
  const { data: childNodes = [], isLoading } = useContainerChildTreeNodes(parentNode)
  const childrenState = projectFilesTreeChildrenState({
    childNodes,
    isLoading,
  })
  const chrome = useMemo(() => projectFilesTreeChromeModel(), [])
  const nodeState = useFilesTreeNodeState()

  return {
    childrenState,
    childNodes,
    chrome,
    projectNode: nodeState.projectNode,
  }
}
