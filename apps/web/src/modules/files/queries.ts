import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { parseLocalWorkspaceUri } from '@/lib/data/workspace-uri'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { useThreadList } from '@/modules/chat/collections'
import { useChatStore } from '@/modules/chat/store'
import {
  ALL_FILES_NODE_ID,
  POD_ROOT_NODE_ID,
  buildRootNodes,
  createContainerNodeId,
  listAllBrowsableEntries,
  listContainerChildNodes,
  listContainerEntries,
  parseTreeNodeId,
  readFileDetail,
  type FilesDetail,
  type FilesEntry,
  type FilesRootData,
  type FilesTreeNode,
} from './browser'

const FILES_QUERY_KEYS = {
  roots: ['files', 'roots'] as const,
  children: ['files', 'children'] as const,
  entries: ['files', 'entries'] as const,
  detail: ['files', 'detail'] as const,
}

export interface ActiveFilesWorkspaceContext {
  workspaceUri: string | null
  threadTitle: string | null
}

export function useActiveFilesWorkspaceContext(): ActiveFilesWorkspaceContext {
  const selectedChatId = useChatStore((state) => state.selectedChatId)
  const selectedThreadId = useChatStore((state) => state.selectedThreadId)
  const { data: threads = [] } = useThreadList(selectedChatId ?? '', { enabled: !!selectedChatId })

  return useMemo(() => {
    if (!selectedThreadId) {
      return { workspaceUri: null, threadTitle: null }
    }

    const activeThread = threads.find((thread) => thread.id === selectedThreadId) ?? null
    return {
      workspaceUri: activeThread?.workspace ?? null,
      threadTitle: activeThread?.title ?? null,
    }
  }, [selectedThreadId, threads])
}

export function useFilesRootNodes() {
  const { db } = useSolidDatabase()
  const { workspaceUri } = useActiveFilesWorkspaceContext()

  return useQuery<FilesRootData>({
    queryKey: [...FILES_QUERY_KEYS.roots, workspaceUri ?? ''],
    queryFn: async () => {
      if (!db) throw new Error('Database not connected')
      return buildRootNodes(db, workspaceUri)
    },
    enabled: !!db,
  })
}

export function useContainerChildTreeNodes(parentNode: FilesTreeNode | null) {
  const { db } = useSolidDatabase()
  const rootQuery = useFilesRootNodes()
  const containerUri = parentNode?.uri && parentNode.type !== 'local-workspace'
    ? parentNode.uri
    : null

  return useQuery<FilesTreeNode[]>({
    queryKey: [...FILES_QUERY_KEYS.children, parentNode?.id ?? '', containerUri ?? ''],
    queryFn: async () => {
      if (!db || !containerUri || !parentNode) return []
      return listContainerChildNodes(db, containerUri, parentNode.id, rootQuery.data?.podRootUri ?? null)
    },
    enabled: !!db && !!containerUri && !!parentNode,
  })
}

function resolveSelectedNode(
  selectedTreeNodeId: string | null,
  rootData: FilesRootData | undefined,
): { kind: 'all' | 'local-workspace' | 'container'; containerUri?: string; localPath?: string } {
  const parsed = parseTreeNodeId(selectedTreeNodeId)
  if (!parsed || parsed.kind === 'all' || selectedTreeNodeId === ALL_FILES_NODE_ID) {
    return { kind: 'all' }
  }

  if (selectedTreeNodeId === POD_ROOT_NODE_ID && rootData?.podRootUri) {
    return { kind: 'container', containerUri: rootData.podRootUri }
  }

  if (parsed.kind === 'local-workspace' && parsed.uri) {
    return { kind: 'local-workspace', localPath: parseLocalWorkspaceUri(parsed.uri)?.path ?? parsed.uri }
  }

  if ((parsed.kind === 'workspace' || parsed.kind === 'container') && parsed.uri) {
    return { kind: 'container', containerUri: parsed.uri }
  }

  return { kind: 'all' }
}

export function useFilesEntries(selectedTreeNodeId: string | null) {
  const { db } = useSolidDatabase()
  const { workspaceUri } = useActiveFilesWorkspaceContext()
  const rootQuery = useFilesRootNodes()
  const selection = resolveSelectedNode(selectedTreeNodeId, rootQuery.data)

  return useQuery<FilesEntry[]>({
    queryKey: [
      ...FILES_QUERY_KEYS.entries,
      selectedTreeNodeId ?? ALL_FILES_NODE_ID,
      workspaceUri ?? '',
      selection.containerUri ?? '',
      selection.localPath ?? '',
    ],
    queryFn: async () => {
      if (!db) return []
      if (selection.kind === 'local-workspace') return []
      if (selection.kind === 'all') {
        return listAllBrowsableEntries(db, workspaceUri)
      }
      return listContainerEntries(db, selection.containerUri!, selection.containerUri === workspaceUri ? '当前话题' : undefined)
    },
    enabled: !!db,
  })
}

export function useSelectedFilesLocation(selectedTreeNodeId: string | null) {
  const rootQuery = useFilesRootNodes()
  return useMemo(() => resolveSelectedNode(selectedTreeNodeId, rootQuery.data), [selectedTreeNodeId, rootQuery.data])
}

export function useFileDetail(fileUri: string | null) {
  const { db } = useSolidDatabase()

  return useQuery<FilesDetail>({
    queryKey: [...FILES_QUERY_KEYS.detail, fileUri ?? ''],
    queryFn: async () => {
      if (!db || !fileUri) {
        throw new Error('No file selected')
      }
      return readFileDetail(db, fileUri)
    },
    enabled: !!db && !!fileUri,
  })
}

export {
  ALL_FILES_NODE_ID,
  POD_ROOT_NODE_ID,
  createContainerNodeId,
}
