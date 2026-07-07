import { useMemo } from 'react'

import {
  projectFolderColumnPanelModel,
  type FolderSortState,
} from '../../domain/folder/folder-detail-model'
import type { FilesEntry } from '../../domain/resource/resource-model'

export function useFolderColumnPanelController({
  entries,
  sort,
}: {
  entries: FilesEntry[]
  sort: FolderSortState
}) {
  return useMemo(() => projectFolderColumnPanelModel({ entries, sort }), [entries, sort])
}
