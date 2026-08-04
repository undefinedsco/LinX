import { useCallback, useMemo, useState } from 'react'

import { useFilesStore } from '../../app/store'
import {
  projectFilesExplorerRows,
  type FilesExplorerRowModel,
} from '../../domain/list/explorer-tree-model'
import { resolveFilesListOpenDecision, type FilesListOpenTrigger } from '../../domain/list/list-open'
import type { FilesEntry } from '../../domain/resource/resource-model'
import { normalizeContainerUri } from '../../domain/resource/resource-semantics'

export interface FilesExplorerControllerInput {
  rootEntries: FilesEntry[]
  searchText: string
  expandedUris?: ReadonlySet<string>
  onExpandedUrisChange?: (next: Set<string>) => void
  childEntriesByContainerUri?: Record<string, FilesEntry[]>
  loadingContainerUris?: ReadonlySet<string>
  errorByContainerUri?: Record<string, unknown>
  retryContainer?: (containerUri: string) => void
}

function isContainerEntry(entry: FilesEntry) {
  return entry.kind === 'container'
}

function normalizeEntryContainerUri(entryOrUri: FilesEntry | string) {
  return normalizeContainerUri(typeof entryOrUri === 'string' ? entryOrUri : entryOrUri.uri)
}

export function useFilesExplorerController({
  rootEntries,
  searchText,
  expandedUris: controlledExpandedUris,
  onExpandedUrisChange,
  childEntriesByContainerUri = {},
  loadingContainerUris = new Set(),
  errorByContainerUri = {},
  retryContainer,
}: FilesExplorerControllerInput) {
  const selectFile = useFilesStore((state) => state.selectFile)
  const clearFileSelection = useFilesStore((state) => state.clearFileSelection)
  const enterFolder = useFilesStore((state) => state.enterFolder)
  const setDetailTab = useFilesStore((state) => state.setDetailTab)
  const requestEditableFileSheetOpen = useFilesStore((state) => state.requestEditableFileSheetOpen)
  const requestEditableFileInlineEdit = useFilesStore((state) => state.requestEditableFileInlineEdit)
  const [internalExpandedUris, setInternalExpandedUris] = useState<Set<string>>(() => new Set())
  const expandedUris = controlledExpandedUris ?? internalExpandedUris

  const rows = useMemo(
    () => projectFilesExplorerRows({
      rootEntries,
      expandedUris,
      childEntriesByContainerUri,
    loadingContainerUris,
    errorByContainerUri,
    searchText,
    }),
    [childEntriesByContainerUri, errorByContainerUri, expandedUris, loadingContainerUris, rootEntries, searchText],
  )

  const toggleFolder = useCallback((containerUri: string) => {
    const normalized = normalizeContainerUri(containerUri)
    const toggle = (current: ReadonlySet<string>) => {
      const next = new Set(current)
      if (next.has(normalized)) next.delete(normalized)
      else next.add(normalized)
      return next
    }
    if (onExpandedUrisChange) {
      onExpandedUrisChange(toggle(expandedUris))
      return
    }
    setInternalExpandedUris((current) => toggle(current))
  }, [expandedUris, onExpandedUrisChange])

  const openEntry = useCallback((entry: FilesEntry, trigger: FilesListOpenTrigger) => {
    const decision = resolveFilesListOpenDecision(entry, trigger)
    switch (decision.type) {
      case 'browse-container':
        toggleFolder(entry.uri)
        enterFolder({ treeNodeId: decision.treeNodeId, containerUri: entry.uri })
        break
      case 'select-file':
        selectFile(decision.fileUri)
        break
      case 'select-file-preview':
        selectFile(decision.fileUri)
        setDetailTab('preview')
        break
      case 'open-editable-inline':
        selectFile(decision.fileUri)
        setDetailTab('preview')
        requestEditableFileInlineEdit(decision.fileUri)
        break
      case 'open-editable-sheet':
        selectFile(decision.fileUri)
        setDetailTab('preview')
        requestEditableFileSheetOpen(decision.fileUri)
        break
    }
  }, [enterFolder, requestEditableFileInlineEdit, requestEditableFileSheetOpen, selectFile, setDetailTab, toggleFolder])

  const handleRowKeyDown = useCallback((rowUri: string, key: string): string | null => {
    const rowIndex = rows.findIndex((row) => row.kind === 'entry' && row.entry.uri === rowUri)
    const currentRow = rows[rowIndex]
    if (!currentRow || currentRow.kind !== 'entry') return null

    if (key === 'ArrowRight' && currentRow.expandable && !currentRow.expanded) {
      toggleFolder(normalizeEntryContainerUri(currentRow.entry))
      return rowUri
    }
    if (key === 'ArrowLeft' && currentRow.expandable && currentRow.expanded) {
      toggleFolder(normalizeEntryContainerUri(currentRow.entry))
      return rowUri
    }

    if (key === 'Escape') {
      clearFileSelection()
      selectFile(null)
      return null
    }

    const direction = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0
    if (!direction) return null
    const nextRow = direction > 0
      ? rows.slice(rowIndex + 1).find((row) => row.kind === 'entry')
      : rows.slice(0, rowIndex).reverse().find((row) => row.kind === 'entry')
    if (nextRow?.kind === 'entry') {
      const targetUri = nextRow.entry.uri
      selectFile(targetUri)
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-files-explorer-row-uri="${targetUri}"]`)?.focus()
      })
      return targetUri
    }
    return null
  }, [clearFileSelection, rows, selectFile, toggleFolder])

  return {
    expandedUris,
    rows,
    toggleFolder,
    retryContainer,
    openEntry,
    handleRowKeyDown,
    isExpanded: (entry: FilesEntry) => isContainerEntry(entry) && expandedUris.has(normalizeEntryContainerUri(entry)),
  }
}

export type { FilesExplorerRowModel }
