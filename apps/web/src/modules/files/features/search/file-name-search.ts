import { useCallback, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useFilesStore } from '../../app/store'
import { useFilesPodSearchEntries } from '../../data/queries/resource-queries'
import type { FilesEntry } from '../../domain/resource/resource-model'
import {
  createContainerNodeId,
  createResourceNodeId,
  projectFilesTreeSearchResults,
} from '../../domain/resource/tree-model'

export type FileNameSearchEntry = Pick<FilesEntry, 'id' | 'uri' | 'name' | 'kind' | 'parentUri'>

/**
 * Name-only search across the Pod for places outside the Files tree.
 * File bodies are not indexed here, and callers should say so.
 */
export function useFileNameSearch(query: string) {
  const active = query.trim().length > 0
  const entriesQuery = useFilesPodSearchEntries(active)
  const results = useMemo<FileNameSearchEntry[]>(
    () => projectFilesTreeSearchResults({ entries: entriesQuery.data ?? [], query }),
    [entriesQuery.data, query],
  )
  return {
    results,
    isLoading: active && entriesQuery.isLoading,
    isError: active && entriesQuery.isError,
    retry: () => { void entriesQuery.refetch() },
  }
}

/** Opens a file or folder in Files, the same way picking it in the Files tree does. */
export function useOpenFileEntry() {
  const navigate = useNavigate()
  const selectTreeNode = useFilesStore((state) => state.selectTreeNode)
  return useCallback((entry: FileNameSearchEntry) => {
    selectTreeNode(
      entry.kind === 'container' ? createContainerNodeId(entry.uri) : createResourceNodeId(entry.uri),
      entry.uri,
    )
    navigate({ to: '/$microAppId', params: { microAppId: 'files' } })
  }, [navigate, selectTreeNode])
}
