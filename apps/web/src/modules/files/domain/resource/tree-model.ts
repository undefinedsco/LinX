import {
  AGENTS_ROOT_NODE_ID,
  ALL_FILES_NODE_ID,
  POD_ROOT_NODE_ID,
  RECENT_FILES_NODE_ID,
  REPOSITORIES_ROOT_NODE_ID,
  WORKSPACES_ROOT_NODE_ID,
  type FilesTreeNode,
  type FilesTreeNodeType,
  type FilesEntry,
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

export function getPodRootLabel(podRootUri?: string | null): string {
  if (podRootUri) {
    try {
      const segment = new URL(podRootUri).pathname.split('/').filter(Boolean)[0]
      if (segment) return `${decodeURIComponent(segment)}'s Pod`
    } catch {
      // Fall through to the generic label.
    }
  }
  return 'Pod 根目录'
}

export function getContainerLabel(uri: string, podRootUri?: string | null): string {
  if (podRootUri && normalizeContainerUri(uri) === normalizeContainerUri(podRootUri)) {
    return getPodRootLabel(podRootUri)
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
  searchPlaceholder: string
  clearSearchLabel: string
  emptySearchLabel: (query: string) => string
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

export function pinFavoriteTreeNodesFirst(
  childNodes: readonly FilesTreeNode[],
  favorites: readonly { sourceId?: string | null }[],
): FilesTreeNode[] {
  if (childNodes.length === 0 || favorites.length === 0) return [...childNodes]
  const favoriteUris = new Set(
    favorites.map((favorite) => favorite.sourceId).filter((uri): uri is string => !!uri),
  )
  if (favoriteUris.size === 0) return [...childNodes]

  const pinned: FilesTreeNode[] = []
  const rest: FilesTreeNode[] = []
  for (const node of childNodes) {
    if (node.uri && favoriteUris.has(node.uri)) pinned.push(node)
    else rest.push(node)
  }
  return pinned.length > 0 ? [...pinned, ...rest] : [...childNodes]
}

export function projectFilesTreeSearchResults({
  entries,
  query,
}: {
  entries: readonly FilesEntry[]
  query: string
}): FilesEntry[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return []
  return entries.filter((entry) => entry.name.toLowerCase().includes(normalizedQuery))
}

export function projectFilesTreeFooterLabel({
  selectedTreeNodeId,
  treeNodes,
}: {
  selectedTreeNodeId?: string | null
  treeNodes: readonly FilesTreeNode[]
}): string | null {
  if (!selectedTreeNodeId) return null
  const selectedNode = treeNodes.find((node) => node.id === selectedTreeNodeId)
  if (!selectedNode || selectedNode.count === undefined) return null
  return `${selectedNode.label} · ${selectedNode.count} 项`
}

export function projectFilesTreeChromeModel(): FilesTreeChromeModel {
  return {
    searchPlaceholder: '搜索文件树',
    clearSearchLabel: '清除搜索',
    emptySearchLabel: (query) => `没有匹配“${query}”的资源`,
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
