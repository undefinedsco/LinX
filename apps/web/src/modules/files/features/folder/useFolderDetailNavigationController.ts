import { useEffect, useState } from 'react'

import { copyFilesText } from '../../app/platform-actions'
import { useFilesStore } from '../../app/store'
import {
  planFolderChildOpenEffect,
  projectFolderChildCopyText,
  projectSelectedFolderChildCopyText,
  shouldClearFolderChildSheet,
  type FolderChildOpenTrigger,
} from './folder-navigation-workflow-model'
import type { FilesDetail, FilesEntry } from '../../domain/resource/resource-model'

export function useFolderDetailNavigationController({
  childUriSet,
  selectedChildren,
}: {
  childUriSet: Set<string>
  selectedChildren: FilesEntry[]
}) {
  const selectTreeNode = useFilesStore((state) => state.selectTreeNode)
  const selectFile = useFilesStore((state) => state.selectFile)
  const setDetailTab = useFilesStore((state) => state.setDetailTab)
  const [sheetChild, setSheetChild] = useState<FilesDetail | null>(null)

  useEffect(() => {
    if (shouldClearFolderChildSheet({ sheetChild, childUriSet })) {
      setSheetChild(null)
    }
  }, [childUriSet, sheetChild])

  function openUploadedResource(uri: string) {
    selectFile(uri)
    setDetailTab('preview')
  }

  function openChild(child: FilesEntry, trigger: FolderChildOpenTrigger) {
    const effect = planFolderChildOpenEffect(child, trigger)
    switch (effect.type) {
      case 'browse-container':
        selectTreeNode(effect.treeNodeId, child.uri)
        break
      case 'open-editable-sheet':
        setSheetChild(effect.file)
        break
      case 'select-file-preview':
        selectFile(effect.fileUri)
        setDetailTab('preview')
        break
      case 'noop':
        break
    }
  }

  function copyChildUri(child: FilesEntry) {
    void copyFilesText(projectFolderChildCopyText(child))
  }

  function copySelectedChildUris() {
    void copyFilesText(projectSelectedFolderChildCopyText(selectedChildren))
  }

  function closeSheetChild() {
    setSheetChild(null)
  }

  return {
    closeSheetChild,
    copyChildUri,
    copySelectedChildUris,
    openChild,
    openUploadedResource,
    sheetChild,
  }
}
