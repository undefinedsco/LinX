import { useCallback, useMemo, useState } from 'react'

import {
  createFolderDetailViewState,
  projectFolderDetailPathLabel,
  projectFolderDetailSortKey,
  projectFolderDetailViewMode,
  projectFolderDetailViewModel,
  type FolderDetailViewMode,
  type FolderSortState,
} from '../../domain/folder/folder-detail-model'
import type { FilesEntry } from '../../domain/resource/resource-model'

export type { FolderDetailViewMode, FolderDetailViewModeIconKind } from '../../domain/folder/folder-detail-model'

export function useFolderDetailViewController({
  children,
  containerUri,
}: {
  children: FilesEntry[]
  containerUri: string
}) {
  const [viewState, setViewState] = useState(createFolderDetailViewState)
  const { sort, viewMode } = viewState
  const viewModel = useMemo(() => projectFolderDetailViewModel({
    children,
    sort,
    viewMode,
  }), [children, sort, viewMode])
  const folderPathLabel = useMemo(() => projectFolderDetailPathLabel(containerUri), [containerUri])

  const setSortKey = useCallback((key: FolderSortState['key']) => {
    setViewState((current) => projectFolderDetailSortKey({ current, key }))
  }, [])

  const setViewMode = useCallback((nextViewMode: FolderDetailViewMode) => {
    setViewState((current) => projectFolderDetailViewMode({
      current,
      viewMode: nextViewMode,
    }))
  }, [])

  return {
    ...viewModel,
    folderPathLabel,
    setSortKey,
    setViewMode,
    sort,
    viewMode,
  }
}
