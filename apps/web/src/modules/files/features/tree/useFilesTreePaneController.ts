import { useCallback, useMemo } from 'react'

import { useFilesStore } from '../../app/store'
import {
  useActiveFilesWorkspaceContext,
  useContainerChildTreeNodes,
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
}

function useFilesTreeNodeState(options?: { rootLoading?: boolean }) {
  const selectedTreeNodeId = useFilesStore((state) => state.selectedTreeNodeId)
  const expandedTreeNodeIds = useFilesStore((state) => state.expandedTreeNodeIds)
  const selectTreeNode = useFilesStore((state) => state.selectTreeNode)
  const toggleTreeNode = useFilesStore((state) => state.toggleTreeNode)

  const projectNode = useCallback((node: FilesTreeNode): FilesTreeNodeViewModel => ({
    ...projectFilesTreeNodeViewState({
      expandedTreeNodeIds,
      node,
      rootLoading: options?.rootLoading,
      selectedTreeNodeId,
    }),
    onSelect: () => selectTreeNode(node.id),
    onToggle: () => toggleTreeNode(node.id),
  }), [expandedTreeNodeIds, options?.rootLoading, selectTreeNode, selectedTreeNodeId, toggleTreeNode])

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
