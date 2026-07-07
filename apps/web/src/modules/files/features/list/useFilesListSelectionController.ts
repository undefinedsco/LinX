import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'

import { useFilesStore } from '../../app/store'
import type { FilesEntry } from '../../domain/resource/resource-model'
import type { FilesListOpenTrigger } from '../../domain/list/list-open'
import {
  createFilesListInteractionState,
  projectFilesListInteractionAnchor,
  projectFilesListInteractionContextTarget,
  projectFilesListInteractionReset,
  projectFilesListContextMenuView,
  projectFilesListContextSelection,
  projectFilesListRangeSelectionUris,
  projectFilesListSelectionProjection,
  shouldApplyFilesListContextSelection,
} from '../../domain/list/files-list-selection-model'

export function useFilesListSelectionController({
  files,
  openFile,
}: {
  files: FilesEntry[]
  openFile: (file: FilesEntry, trigger: FilesListOpenTrigger) => void
}) {
  const selectedFileId = useFilesStore((state) => state.selectedFileId)
  const selectedFileIds = useFilesStore((state) => state.selectedFileIds)
  const selectFile = useFilesStore((state) => state.selectFile)
  const toggleFileSelection = useFilesStore((state) => state.toggleFileSelection)
  const clearFileSelection = useFilesStore((state) => state.clearFileSelection)
  const [interactionState, setInteractionState] = useState(createFilesListInteractionState)
  const { contextMenuTargetUri, selectionAnchorId } = interactionState
  const contextMenuSelectionTimerRef = useRef<number | null>(null)
  const contextMenuTargetRef = useRef<FilesEntry | null>(null)
  const contextMenuActionTakenRef = useRef(false)

  const selectionProjection = useMemo(() => projectFilesListSelectionProjection({
    files,
    selectedFileIds,
  }), [files, selectedFileIds])
  const {
    batchSelectionActions,
    batchSelectionLabel,
    hasBatchSelection,
    hasSelectedVisibleFiles,
    selectedVisibleCount,
    selectedVisibleFiles,
  } = selectionProjection

  useEffect(() => {
    return () => {
      if (contextMenuSelectionTimerRef.current !== null) {
        window.clearTimeout(contextMenuSelectionTimerRef.current)
      }
      contextMenuTargetRef.current = null
      contextMenuActionTakenRef.current = false
    }
  }, [])

  const replaceFileSelection = useCallback((uris: string[]) => {
    clearFileSelection()
    for (const uri of uris) {
      toggleFileSelection(uri)
    }
  }, [clearFileSelection, toggleFileSelection])

  const clearListSelection = useCallback(() => {
    clearFileSelection()
    selectFile(null)
    setInteractionState((current) => projectFilesListInteractionReset(current))
  }, [clearFileSelection, selectFile])

  const selectVisibleFile = useCallback((file: FilesEntry, event?: MouseEvent<HTMLDivElement>) => {
    if (event?.shiftKey && selectionAnchorId) {
      const rangeSelectionUris = projectFilesListRangeSelectionUris({
        files,
        anchorUri: selectionAnchorId,
        fileUri: file.uri,
      })
      if (rangeSelectionUris) {
        replaceFileSelection(rangeSelectionUris)
        selectFile(file.uri)
        return
      }
    }
    if (event?.metaKey || event?.ctrlKey) {
      toggleFileSelection(file.uri)
      setInteractionState((current) => projectFilesListInteractionAnchor({
        current,
        selectionAnchorId: file.uri,
      }))
      selectFile(file.uri)
      return
    }
    replaceFileSelection([file.uri])
    setInteractionState((current) => projectFilesListInteractionAnchor({
      current,
      selectionAnchorId: file.uri,
    }))
    openFile(file, 'click')
  }, [files, openFile, replaceFileSelection, selectFile, selectionAnchorId, toggleFileSelection])

  const applyContextMenuSelection = useCallback((file: FilesEntry) => {
    if (contextMenuSelectionTimerRef.current !== null) {
      window.clearTimeout(contextMenuSelectionTimerRef.current)
      contextMenuSelectionTimerRef.current = null
    }
    if (!shouldApplyFilesListContextSelection({
      file,
      selectedFileId,
      selectedFileIds,
      selectedVisibleCount,
    })) return

    replaceFileSelection([file.uri])
    setInteractionState((current) => projectFilesListInteractionAnchor({
      current,
      selectionAnchorId: file.uri,
    }))
    selectFile(file.uri)
  }, [replaceFileSelection, selectFile, selectedFileId, selectedFileIds, selectedVisibleCount])

  const prepareContextMenuSelection = useCallback((file: FilesEntry) => {
    if (contextMenuSelectionTimerRef.current !== null) {
      window.clearTimeout(contextMenuSelectionTimerRef.current)
      contextMenuSelectionTimerRef.current = null
    }
    contextMenuActionTakenRef.current = false
    contextMenuTargetRef.current = file
    setInteractionState((current) => projectFilesListInteractionContextTarget({
      current,
      contextMenuTargetUri: file.uri,
    }))
  }, [])

  const applyContextMenuSelectionAfterClose = useCallback((file: FilesEntry) => {
    if (contextMenuSelectionTimerRef.current !== null) {
      window.clearTimeout(contextMenuSelectionTimerRef.current)
    }
    contextMenuSelectionTimerRef.current = window.setTimeout(() => {
      contextMenuSelectionTimerRef.current = null
      const targetFile = contextMenuTargetRef.current
      const actionTaken = contextMenuActionTakenRef.current
      contextMenuTargetRef.current = null
      contextMenuActionTakenRef.current = false
      setInteractionState((current) => projectFilesListInteractionContextTarget({
        current,
        contextMenuTargetUri: null,
      }))
      if (targetFile?.uri !== file.uri || actionTaken) return
      applyContextMenuSelection(file)
    }, 0)
  }, [applyContextMenuSelection])

  const handleContextMenuOpenChange = useCallback((file: FilesEntry, open: boolean) => {
    if (open) {
      contextMenuActionTakenRef.current = false
      contextMenuTargetRef.current = file
      setInteractionState((current) => projectFilesListInteractionContextTarget({
        current,
        contextMenuTargetUri: file.uri,
      }))
      return
    }
    if (contextMenuTargetRef.current?.uri !== file.uri) return
    applyContextMenuSelectionAfterClose(file)
  }, [applyContextMenuSelectionAfterClose])

  const runContextMenuAction = useCallback((action: () => void) => {
    contextMenuActionTakenRef.current = true
    action()
  }, [])

  const contextSelectionForFile = useCallback((file: FilesEntry) => {
    return projectFilesListContextSelection({
      file,
      selectedFileIds,
      selectedVisibleFiles,
    })
  }, [selectedFileIds, selectedVisibleFiles])

  const contextMenuViewForFile = useCallback((file: FilesEntry) => {
    return projectFilesListContextMenuView({
      file,
      selectedFileIds,
      selectedVisibleFiles,
    })
  }, [selectedFileIds, selectedVisibleFiles])

  return {
    batchSelectionActions,
    batchSelectionLabel,
    clearListSelection,
    contextMenuTargetUri,
    contextMenuViewForFile,
    contextSelectionForFile,
    handleContextMenuOpenChange,
    hasBatchSelection,
    hasSelectedVisibleFiles,
    prepareContextMenuSelection,
    replaceFileSelection,
    runContextMenuAction,
    selectVisibleFile,
    selectedFileId,
    selectedFileIds,
    selectedVisibleFiles,
  }
}
