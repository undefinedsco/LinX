import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createFolderChildSelectionState,
  projectFolderChildContextMenuSelectionState,
  projectFolderChildSelectionProjection,
  projectFolderChildSelectionState,
  projectFolderChildSelectionStateFromPlan,
  projectFolderChildSelectedChildUriPatch,
  pruneFolderChildSelectionState,
  removeFolderChildSelectionUris,
  type FolderChildSelectionModifiers,
} from '../../domain/folder/folder-detail-model'
import type { FilesEntry } from '../../domain/resource/resource-model'

export type { FolderChildSelectionModifiers } from '../../domain/folder/folder-detail-model'

export function useFolderDetailSelectionController({
  visibleChildren,
  sortedChildren,
}: {
  visibleChildren: FilesEntry[]
  sortedChildren: FilesEntry[]
}) {
  const [selectionState, setSelectionState] = useState(createFolderChildSelectionState)
  const { selectedChildUri, selectedChildUris } = selectionState
  const contextMenuSelectionTimerRef = useRef<number | null>(null)
  const selectionProjection = useMemo(() => projectFolderChildSelectionProjection({
    visibleChildren,
    sortedChildren,
    selectedChildUri,
    selectedChildUris,
  }), [selectedChildUri, selectedChildUris, sortedChildren, visibleChildren])
  const {
    batchSelectionActions,
    batchSelectionLabel,
    childUriSet,
    hasBatchSelection,
    selectedChild,
    selectedChildren,
    selectedChildCount,
  } = selectionProjection

  useEffect(() => {
    setSelectionState((current) => {
      const prunePlan = pruneFolderChildSelectionState({
        childUriSet,
        selectedChildUri: current.selectedChildUri,
        selectedChildUris: current.selectedChildUris,
        selectionAnchorUri: current.selectionAnchorUri,
      })
      return prunePlan.changed
        ? projectFolderChildSelectionStateFromPlan(prunePlan)
        : current
    })
  }, [childUriSet])

  useEffect(() => {
    return () => {
      if (contextMenuSelectionTimerRef.current !== null) {
        window.clearTimeout(contextMenuSelectionTimerRef.current)
      }
    }
  }, [])

  const selectOnlyChild = useCallback((child: FilesEntry) => {
    setSelectionState((current) => projectFolderChildSelectionStateFromPlan(projectFolderChildSelectionState({
      childUri: child.uri,
      selectedChildUri: current.selectedChildUri,
      selectedChildUris: current.selectedChildUris,
      selectionAnchorUri: current.selectionAnchorUri,
      sortedChildren,
    })))
  }, [sortedChildren])

  const selectChildUri = useCallback((fileUri: string) => {
    setSelectionState((current) => projectFolderChildSelectedChildUriPatch({
      current,
      selectedChildUri: fileUri,
    }))
  }, [])

  const selectChild = useCallback((child: FilesEntry, modifiers?: FolderChildSelectionModifiers) => {
    setSelectionState((current) => projectFolderChildSelectionStateFromPlan(projectFolderChildSelectionState({
      childUri: child.uri,
      modifiers,
      selectedChildUri: current.selectedChildUri,
      selectedChildUris: current.selectedChildUris,
      selectionAnchorUri: current.selectionAnchorUri,
      sortedChildren,
    })))
  }, [sortedChildren])

  const prepareContextMenuSelection = useCallback((select: () => void) => {
    if (contextMenuSelectionTimerRef.current !== null) {
      window.clearTimeout(contextMenuSelectionTimerRef.current)
    }
    contextMenuSelectionTimerRef.current = window.setTimeout(() => {
      contextMenuSelectionTimerRef.current = null
      select()
    }, 0)
  }, [])

  const prepareChildContextMenuSelection = useCallback((child: FilesEntry) => {
    prepareContextMenuSelection(() => {
      setSelectionState((current) => projectFolderChildSelectionStateFromPlan(projectFolderChildContextMenuSelectionState({
        childUri: child.uri,
        selectedChildUri: current.selectedChildUri,
        selectedChildUris: current.selectedChildUris,
        selectionAnchorUri: current.selectionAnchorUri,
      })))
    })
  }, [prepareContextMenuSelection])

  const removeSelectionUris = useCallback((uris: Set<string>) => {
    setSelectionState((current) => projectFolderChildSelectionStateFromPlan(removeFolderChildSelectionUris({
      removedUris: uris,
      selectedChildUri: current.selectedChildUri,
      selectedChildUris: current.selectedChildUris,
      selectionAnchorUri: current.selectionAnchorUri,
    })))
  }, [])

  return {
    batchSelectionActions,
    batchSelectionLabel,
    childUriSet,
    hasBatchSelection,
    prepareChildContextMenuSelection,
    prepareContextMenuSelection,
    removeSelectionUris,
    selectChild,
    selectChildFromKeyboard: selectOnlyChild,
    selectChildUri,
    selectOnlyChild,
    selectedChild,
    selectedChildren,
    selectedChildCount,
    selectedChildUri,
    selectedChildUris,
  }
}
