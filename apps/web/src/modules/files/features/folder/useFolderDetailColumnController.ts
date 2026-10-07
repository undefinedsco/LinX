import { useEffect, useMemo, useState } from 'react'

import {
  createFolderColumnState,
  projectFolderColumnStateAfterPrune,
  projectFolderColumnStateAfterSelection,
  projectFolderDetailColumnModel,
} from '../../domain/folder/folder-detail-model'
import type { FilesDetail, FilesEntry } from '../../domain/resource/resource-model'

export function useFolderDetailColumnController({
  file,
  visibleChildren,
  childUriSet,
  selectedChild,
  selectedChildUri,
  selectOnlyChild,
  prepareContextMenuSelection,
}: {
  file: FilesDetail
  visibleChildren: FilesEntry[]
  childUriSet: Set<string>
  selectedChild: FilesEntry | null
  selectedChildUri: string | null
  selectOnlyChild: (child: FilesEntry) => void
  prepareContextMenuSelection: (select: () => void) => void
}) {
  const [columnState, setColumnState] = useState(createFolderColumnState)
  const columnContainerPath = columnState.containerPath
  const columnSelectionByContainer = columnState.selectionByContainer
  const columnPreviewTarget = columnState.previewTarget

  useEffect(() => {
    setColumnState((current) => projectFolderColumnStateAfterPrune({
      current,
      rootContainerUri: file.uri,
      childUriSet,
    }))
  }, [childUriSet, file.uri])

  const selectColumnChild = (
    parentFile: FilesDetail,
    siblingEntries: FilesEntry[],
    child: FilesEntry,
    columnDepth: number,
  ) => {
    selectOnlyChild(child)
    setColumnState((current) => projectFolderColumnStateAfterSelection({
      current,
      rootContainerUri: file.uri,
      parentFile,
      siblingEntries,
      child,
      columnDepth,
    }))
  }

  const prepareColumnChildContextMenuSelection = (
    parentFile: FilesDetail,
    siblingEntries: FilesEntry[],
    child: FilesEntry,
    columnDepth: number,
  ) => {
    prepareContextMenuSelection(() => selectColumnChild(parentFile, siblingEntries, child, columnDepth))
  }

  const columnModel = useMemo(() => projectFolderDetailColumnModel({
    file,
    visibleChildren,
    selectedChild,
    selectedChildUri,
    columnSelectionByContainer,
    columnPreviewTarget,
  }), [
    columnPreviewTarget,
    columnSelectionByContainer,
    file,
    selectedChild,
    selectedChildUri,
    visibleChildren,
  ])

  return {
    columnContainerPath,
    columnSelectionByContainer,
    columnPreviewParentFile: columnModel.columnPreviewParentFile,
    columnPreviewChild: columnModel.columnPreviewChild,
    columnPreviewSiblings: columnModel.columnPreviewSiblings,
    columnPreviewChildCount: columnModel.columnPreviewChildCount,
    rootColumnSelectedUri: columnModel.rootColumnSelectedUri,
    selectColumnChild,
    prepareColumnChildContextMenuSelection,
  }
}
