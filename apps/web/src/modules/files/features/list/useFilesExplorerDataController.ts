import { useMemo, useState } from 'react'
import { useFilesAgentNames, useFilesExpandedContainerEntries } from '../../data/queries'
import type { FilesEntryScope } from '../../domain/list/entry-scope'
import type { FilesEntry } from '../../domain/resource/resource-model'
import { mergeAgentHomeVirtualEntries } from '../../domain/list/explorer-virtual-entries'
import { useFilesExplorerController } from './useFilesExplorerController'

export function useFilesExplorerDataController({
  entryScope,
  rootEntries,
  searchText,
  groups = false,
  treeOnly = false,
}: {
  entryScope: FilesEntryScope
  rootEntries: FilesEntry[]
  searchText: string
  groups?: boolean
  treeOnly?: boolean
}) {
  const agentNames = useFilesAgentNames()
  const [expandedUris, setExpandedUris] = useState<Set<string>>(() => new Set())
  const expandedContainerUris = Array.from(expandedUris)
  const {
    childEntriesByContainerUri,
    loadingContainerUris,
    errorByContainerUri,
    retryContainer,
  } = useFilesExpandedContainerEntries({ entryScope, expandedContainerUris })

  const childEntriesWithViews = useMemo(
    () => mergeAgentHomeVirtualEntries(childEntriesByContainerUri),
    [childEntriesByContainerUri],
  )

  return useFilesExplorerController({
    rootEntries,
    searchText,
    treeOnly,
    groups,
    agentNames,
    expandedUris,
    onExpandedUrisChange: setExpandedUris,
    childEntriesByContainerUri: childEntriesWithViews,
    loadingContainerUris,
    errorByContainerUri,
    retryContainer,
  })
}
