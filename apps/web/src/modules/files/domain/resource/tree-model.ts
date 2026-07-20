import {
  AGENTS_ROOT_NODE_ID,
  ALL_FILES_NODE_ID,
  POD_ROOT_NODE_ID,
  RECENT_FILES_NODE_ID,
  REPOSITORIES_ROOT_NODE_ID,
  WORKSPACES_ROOT_NODE_ID,
  type FilesTreeNode,
  type FilesTreeNodeType,
} from './resource-model'
import {
  getEntryName,
  normalizeContainerUri,
} from './resource-semantics'

export function createContainerNodeId(uri: string): string {
  return `container:${normalizeContainerUri(uri)}`
}

export function createResourceNodeId(uri: string): string {
  return `resource:${uri}`
}

export function createWorkspaceNodeId(workspaceUri: string): string {
  return `workspace:${workspaceUri}`
}

export function createLocalWorkspaceNodeId(workspaceUri: string): string {
  return `local-workspace:${workspaceUri}`
}

export function resolvePodChildContainerUri(podRootUri: string, path: string): string {
  return new URL(path, normalizeContainerUri(podRootUri)).toString()
}

export function parseTreeNodeId(nodeId?: string | null): {
  kind: FilesTreeNodeType
  uri?: string
} | null {
  if (!nodeId) return null
  if (nodeId === ALL_FILES_NODE_ID) return { kind: 'all' }
  if (nodeId === RECENT_FILES_NODE_ID) return { kind: 'recent' }
  if (nodeId === POD_ROOT_NODE_ID) return { kind: 'container' }
  if (nodeId === AGENTS_ROOT_NODE_ID) return { kind: 'agents-root' }
  if (nodeId === WORKSPACES_ROOT_NODE_ID) return { kind: 'workspaces-root' }
  if (nodeId === REPOSITORIES_ROOT_NODE_ID) return { kind: 'repositories-root' }
  if (nodeId.startsWith('workspace:')) {
    return { kind: 'workspace', uri: nodeId.slice('workspace:'.length) }
  }
  if (nodeId.startsWith('local-workspace:')) {
    return { kind: 'local-workspace', uri: nodeId.slice('local-workspace:'.length) }
  }
  if (nodeId.startsWith('container:')) {
    return { kind: 'container', uri: nodeId.slice('container:'.length) }
  }
  if (nodeId.startsWith('resource:')) {
    return { kind: 'resource', uri: nodeId.slice('resource:'.length) }
  }
  return null
}

export function getContainerLabel(uri: string, podRootUri?: string | null): string {
  if (podRootUri && normalizeContainerUri(uri) === normalizeContainerUri(podRootUri)) {
    return 'Pod 根目录'
  }
  return getEntryName(uri)
}

export function canExpandFilesTreeNode(node: Pick<FilesTreeNode, 'type'>): boolean {
  return node.type === 'workspace' ||
    node.type === 'container' ||
    node.type === 'agents-root' ||
    node.type === 'workspaces-root' ||
    node.type === 'repositories-root'
}

export type FilesTreeContentState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'empty' }
  | { kind: 'content'; treeNodes: readonly FilesTreeNode[] }

export type FilesTreeChildrenState =
  | { kind: 'loading' }
  | { kind: 'content'; childNodes: readonly FilesTreeNode[] }

export type FilesTreeNodeViewState = {
  isSelected: boolean
  isExpanded: boolean
  canExpand: boolean
  isLoading: boolean
  toggleLabel: string
}

export type FilesTreeChromeModel = {
  headerTitle: string
  collapseRailLabel: string
  expandRailLabel: string
  treeLabel: string
  rootLoadingLabel: string
  rootErrorLabel: string
  childLoadingLabel: string
}

export function projectFilesTreeContentState({
  error,
  isLoading,
  treeNodes,
}: {
  error: unknown
  isLoading: boolean
  treeNodes: readonly FilesTreeNode[]
}): FilesTreeContentState {
  if (isLoading) return { kind: 'loading' }
  if (error) return { kind: 'error' }
  if (treeNodes.length === 0) return { kind: 'empty' }
  return { kind: 'content', treeNodes }
}

export function projectFilesTreeChildrenState({
  childNodes,
  isLoading,
}: {
  childNodes: readonly FilesTreeNode[]
  isLoading: boolean
}): FilesTreeChildrenState {
  if (isLoading) return { kind: 'loading' }
  return { kind: 'content', childNodes }
}

export function projectFilesTreeHeaderDescription({
  threadTitle,
  workspaceUri,
}: {
  threadTitle?: string | null
  workspaceUri?: string | null
}) {
  if (workspaceUri) return `当前话题：${threadTitle ?? '未命名话题'}`
  return '浏览当前 Pod 容器；绑定目录后会在这里出现当前话题容器。'
}

export function projectFilesTreeChromeModel(): FilesTreeChromeModel {
  return {
    headerTitle: '资源范围',
    collapseRailLabel: '收起资源栏',
    expandRailLabel: '展开资源栏',
    treeLabel: '文件分组树',
    rootLoadingLabel: '正在加载容器…',
    rootErrorLabel: '读取容器失败。',
    childLoadingLabel: '正在读取子容器…',
  }
}

export function projectFilesTreeNodeViewState({
  expandedTreeNodeIds,
  node,
  rootLoading,
  selectedTreeNodeId,
}: {
  expandedTreeNodeIds: ReadonlySet<string>
  node: FilesTreeNode
  rootLoading?: boolean
  selectedTreeNodeId: string | null
}): FilesTreeNodeViewState {
  const isExpanded = expandedTreeNodeIds.has(node.id)

  return {
    isSelected: selectedTreeNodeId === node.id,
    isExpanded,
    canExpand: canExpandFilesTreeNode(node),
    isLoading: Boolean(rootLoading && node.id !== ALL_FILES_NODE_ID),
    toggleLabel: `${isExpanded ? '收起' : '展开'} ${node.label}`,
  }
}
