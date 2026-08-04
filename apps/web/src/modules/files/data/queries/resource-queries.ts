import { useCallback, useMemo } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { parseLocalWorkspaceUri } from '@/lib/data/workspace-uri'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import {
  ALL_FILES_NODE_ID,
  POD_ROOT_NODE_ID,
  type FilesBlobResource,
  type FilesDetail,
  type FilesEntry,
  type FilesFolderCreateInput,
  type FilesRawTextResource,
  type FilesResourceTransferInput,
  type FilesRootData,
  type FilesTreeNode,
} from '../../domain/resource/resource-model'
import {
  createContainerNodeId,
  parseTreeNodeId,
} from '../../domain/resource/tree-model'
import { normalizeContainerUri } from '../../domain/resource/resource-semantics'
import type { FilesEntryScope } from '../../domain/list/entry-scope'
import {
  filesResourceMutationCollection,
  filesResourceQueryCollection,
} from '../collections'
import { projectContainerEntriesToTreeNodes } from '../pod-adapter'
import {
  useActiveFilesWorkspaceContext,
  useFilesChatMessages,
} from './chat-source-queries'

export function useFilesCurrentPodRootUri(): string | null {
  const { db } = useSolidDatabase()
  return useMemo(() => filesResourceQueryCollection.resolveCurrentPodRootUri(db), [db])
}

export function useFilesRootNodes() {
  const { db } = useSolidDatabase()
  const { workspaceUri } = useActiveFilesWorkspaceContext()

  return useQuery<FilesRootData>(filesResourceQueryCollection.roots({ workspaceUri, db }))
}

export function useContainerChildTreeNodes(parentNode: FilesTreeNode | null) {
  const { db } = useSolidDatabase()
  const rootQuery = useFilesRootNodes()
  const containerUri = parentNode?.uri && parentNode.type !== 'local-workspace'
    ? normalizeContainerUri(parentNode.uri)
    : null

  return useQuery({
    ...filesResourceQueryCollection.containerEntries({ containerUri, db }),
    select: (entries) => parentNode
      ? projectContainerEntriesToTreeNodes(entries, parentNode.id, rootQuery.data?.podRootUri ?? null)
      : [],
  })
}

export function resolveSelectedFilesNode(
  selectedTreeNodeId: string | null,
  rootData: FilesRootData | undefined,
): { kind: 'all' | 'recent' | 'local-workspace' | 'container'; containerUri?: string; localPath?: string } {
  const parsed = parseTreeNodeId(selectedTreeNodeId)
  if (!parsed || parsed.kind === 'all' || selectedTreeNodeId === ALL_FILES_NODE_ID) {
    return { kind: 'all' }
  }
  if (parsed.kind === 'recent') {
    return { kind: 'recent' }
  }

  if (selectedTreeNodeId === POD_ROOT_NODE_ID && rootData?.podRootUri) {
    return { kind: 'container', containerUri: rootData.podRootUri }
  }

  if (parsed.kind === 'local-workspace' && parsed.uri) {
    return { kind: 'local-workspace', localPath: parseLocalWorkspaceUri(parsed.uri)?.path ?? parsed.uri }
  }

  if (parsed.kind === 'agents-root' || parsed.kind === 'workspaces-root' || parsed.kind === 'repositories-root') {
    const rootNode = rootData?.nodes.find((node) => node.id === selectedTreeNodeId)
    return rootNode?.uri ? { kind: 'container', containerUri: rootNode.uri } : { kind: 'all' }
  }

  if ((parsed.kind === 'workspace' || parsed.kind === 'container') && parsed.uri) {
    return { kind: 'container', containerUri: parsed.uri }
  }

  return { kind: 'all' }
}

export function useFilesEntries(selectedTreeNodeId: string | null, entryScope: FilesEntryScope = 'all') {
  const { db } = useSolidDatabase()
  const { chatId, threadId, workspaceUri } = useActiveFilesWorkspaceContext()
  const rootQuery = useFilesRootNodes()
  const selection = resolveSelectedFilesNode(selectedTreeNodeId, rootQuery.data)
  const messageQuery = useFilesChatMessages(chatId, threadId, entryScope === 'chat-files')
  const currentPodRootUri = filesResourceQueryCollection.resolveCurrentPodRootUri(db)
  const chatPodRootUri = rootQuery.data?.podRootUri ?? currentPodRootUri ?? workspaceUri
  const chatFileFingerprint = useMemo(() => {
    if (entryScope !== 'chat-files') return ''
    return (messageQuery.data ?? [])
      .map((message) => `${message.id}:${message.updatedAt ?? message.createdAt ?? ''}:${message.richContent ?? ''}`)
      .join('|')
  }, [entryScope, messageQuery.data])

  const isContainerProjection = entryScope !== 'chat-files'
    && selection.kind === 'container'
    && !!selection.containerUri
  const queryOptions = isContainerProjection
    ? filesResourceQueryCollection.containerEntries({
        containerUri: normalizeContainerUri(selection.containerUri!),
        db,
      })
    : filesResourceQueryCollection.entries({
        entryScope,
        selectedTreeNodeId: selectedTreeNodeId ?? ALL_FILES_NODE_ID,
        selection,
        workspaceUri,
        threadId,
        chatPodRootUri,
        chatFileFingerprint,
        messages: messageQuery.data ?? [],
        db,
      })
  const rootEntries = entryScope === 'all' && selection.kind === 'all'
    ? rootQuery.data?.entries
    : undefined

  return useQuery<FilesEntry[]>({
    ...queryOptions,
    initialData: rootEntries,
    initialDataUpdatedAt: rootEntries ? Date.now() : undefined,
    select: isContainerProjection && selection.containerUri === workspaceUri
      ? (entries) => entries.map((entry) => ({ ...entry, sourceLabel: '当前话题' }))
      : undefined,
  })
}

export function useFilesTreeSearchEntries(enabled: boolean) {
  const { db } = useSolidDatabase()
  const { workspaceUri } = useActiveFilesWorkspaceContext()
  return useQuery<FilesEntry[]>(filesResourceQueryCollection.treeSearchEntries({ workspaceUri, enabled, db }))
}

export function useFilesContainerEntries(containerUri: string | null, enabled = true) {
  const { db } = useSolidDatabase()
  const queryOptions = filesResourceQueryCollection.containerEntries({
    containerUri: containerUri ?? undefined,
    db,
  })
  return useQuery<FilesEntry[]>({
    ...queryOptions,
    enabled: queryOptions.enabled && enabled,
  })
}

export function useFilesExpandedContainerEntries({
  expandedContainerUris,
}: {
  entryScope: FilesEntryScope
  expandedContainerUris: readonly string[]
}) {
  const { db } = useSolidDatabase()

  const childQueries = useQueries({
    queries: expandedContainerUris.map((containerUri) => {
      const normalizedContainerUri = normalizeContainerUri(containerUri)
      return filesResourceQueryCollection.containerEntries({ containerUri: normalizedContainerUri, db })
    }),
  })

  const childEntriesByContainerUri = useMemo(
    () => Object.fromEntries(expandedContainerUris.map((containerUri, index) => [
      normalizeContainerUri(containerUri),
      childQueries[index]?.data ?? [],
    ])),
    [childQueries, expandedContainerUris],
  )
  const loadingContainerUris = useMemo<Set<string>>(
    () => new Set(expandedContainerUris
      .filter((_, index) => childQueries[index]?.isLoading)
      .map(normalizeContainerUri)),
    [childQueries, expandedContainerUris],
  )
  const errorByContainerUri = useMemo(
    () => Object.fromEntries(expandedContainerUris
      .map((containerUri, index) => [normalizeContainerUri(containerUri), childQueries[index]?.error] as const)
      .filter(([, error]) => error)),
    [childQueries, expandedContainerUris],
  )
  const retryContainer = useCallback((containerUri: string) => {
    const normalizedContainerUri = normalizeContainerUri(containerUri)
    const index = expandedContainerUris.findIndex((uri) => normalizeContainerUri(uri) === normalizedContainerUri)
    if (index < 0) return
    void childQueries[index]?.refetch()
  }, [childQueries, expandedContainerUris])

  return {
    childEntriesByContainerUri,
    loadingContainerUris,
    errorByContainerUri,
    retryContainer,
  }
}

export function useSelectedFilesLocation(selectedTreeNodeId: string | null) {
  const rootQuery = useFilesRootNodes()
  return useMemo(() => resolveSelectedFilesNode(selectedTreeNodeId, rootQuery.data), [selectedTreeNodeId, rootQuery.data])
}

export function useFileDetail(fileUri: string | null) {
  const { db } = useSolidDatabase()
  const normalizedContainerUri = fileUri?.endsWith('/') ? normalizeContainerUri(fileUri) : null
  const detailQuery = useQuery<FilesDetail>(filesResourceQueryCollection.detail({ fileUri, db }))
  const containerEntriesQuery = useQuery(filesResourceQueryCollection.containerEntries({
    containerUri: normalizedContainerUri,
    db,
  }))

  return useMemo(() => ({
    ...detailQuery,
    data: detailQuery.data && normalizedContainerUri
      ? { ...detailQuery.data, childEntries: containerEntriesQuery.data ?? [] }
      : detailQuery.data,
    error: detailQuery.error ?? containerEntriesQuery.error,
    isError: detailQuery.isError || containerEntriesQuery.isError,
    isFetching: detailQuery.isFetching || containerEntriesQuery.isFetching,
    isLoading: detailQuery.isLoading || containerEntriesQuery.isLoading,
  }), [containerEntriesQuery, detailQuery, normalizedContainerUri])
}

export function useRawTextResource(fileUri: string | null, enabled = true) {
  const { db } = useSolidDatabase()

  return useQuery<FilesRawTextResource>(filesResourceQueryCollection.rawText({ fileUri, enabled, db }))
}

export function useBlobResource(fileUri: string | null, enabled = true) {
  const { db } = useSolidDatabase()

  return useQuery<FilesBlobResource>(filesResourceQueryCollection.blob({ fileUri, enabled, db }))
}

export function useSaveRawTextResource() {
  const { db } = useSolidDatabase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ resource, content }: { resource: Pick<FilesRawTextResource, 'uri' | 'mimeType' | 'etag'>; content: string }) => {
      if (!db) throw new Error('Database not connected')
      return filesResourceMutationCollection.saveRawText({
        cacheClient: queryClient,
        db,
        resource,
        content,
      })
    },
  })
}

export function useCreateRawTextResource() {
  const { db } = useSolidDatabase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ resource, content }: { resource: Pick<FilesRawTextResource, 'uri' | 'mimeType'>; content: string }) => {
      if (!db) throw new Error('Database not connected')
      return filesResourceMutationCollection.createRawText({
        cacheClient: queryClient,
        db,
        resource,
        content,
      })
    },
  })
}

export function useCreateBlobResource() {
  const { db } = useSolidDatabase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ resource, content }: { resource: Pick<FilesRawTextResource, 'uri' | 'mimeType'>; content: Blob }) => {
      if (!db) throw new Error('Database not connected')
      return filesResourceMutationCollection.createBlob({
        cacheClient: queryClient,
        db,
        resource,
        content,
      })
    },
  })
}

export function useCopyFileResource() {
  const { db } = useSolidDatabase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: FilesResourceTransferInput) => {
      if (!db) throw new Error('Database not connected')
      return filesResourceMutationCollection.copy({
        cacheClient: queryClient,
        db,
        transfer: input,
      })
    },
  })
}

export function useMoveFileResource() {
  const { db } = useSolidDatabase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: FilesResourceTransferInput) => {
      if (!db) throw new Error('Database not connected')
      return filesResourceMutationCollection.move({
        cacheClient: queryClient,
        db,
        transfer: input,
      })
    },
  })
}

export function useDeleteFileResource() {
  const { db } = useSolidDatabase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (resourceUri: string) => {
      if (!db) throw new Error('Database not connected')
      return filesResourceMutationCollection.delete({
        cacheClient: queryClient,
        db,
        resourceUri,
      })
    },
  })
}

export function useCreateFolderResource() {
  const { db } = useSolidDatabase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: FilesFolderCreateInput) => {
      if (!db) throw new Error('Database not connected')
      return filesResourceMutationCollection.createFolder({
        cacheClient: queryClient,
        db,
        folder: input,
      })
    },
  })
}

export {
  ALL_FILES_NODE_ID,
  POD_ROOT_NODE_ID,
  createContainerNodeId,
}
