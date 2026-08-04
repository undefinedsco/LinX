import { useState } from 'react'
import { useFilesExpandedContainerEntries } from '../../data/queries'
import type { FilesEntryScope } from '../../domain/list/entry-scope'
import type { FilesEntry } from '../../domain/resource/resource-model'
import { useFilesExplorerController } from './useFilesExplorerController'

export function useFilesExplorerDataController({
  entryScope,
  rootEntries,
  searchText,
}: {
  entryScope: FilesEntryScope
  rootEntries: FilesEntry[]
  searchText: string
}) {
  const [expandedUris, setExpandedUris] = useState<Set<string>>(() => new Set())
  const expandedContainerUris = Array.from(expandedUris)
  const {
    childEntriesByContainerUri,
    loadingContainerUris,
    errorByContainerUri,
    retryContainer,
  } = useFilesExpandedContainerEntries({ entryScope, expandedContainerUris })

  return useFilesExplorerController({
    rootEntries,
    searchText,
    expandedUris,
    onExpandedUrisChange: setExpandedUris,
    childEntriesByContainerUri,
    loadingContainerUris,
    errorByContainerUri,
    retryContainer,
  })
}
