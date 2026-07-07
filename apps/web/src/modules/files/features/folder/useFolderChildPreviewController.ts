import { useCallback, useEffect, useMemo, useState } from 'react'

import { projectFolderChildPreviewModel } from '../../domain/folder/folder-child-preview-model'
import type { FilesDetail, FilesEntry } from '../../domain/resource/resource-model'

export function useFolderChildPreviewController({
  child,
  childCount,
  file,
}: {
  child: FilesEntry | null
  childCount: number
  file: FilesDetail
}) {
  const [metaDrawerOpen, setMetaDrawerOpen] = useState(false)
  const previewModel = useMemo(() => projectFolderChildPreviewModel({
    child,
    childCount,
    file,
  }), [child, childCount, file])

  useEffect(() => {
    setMetaDrawerOpen(false)
  }, [child?.uri])

  const openMetaDrawer = useCallback(() => {
    setMetaDrawerOpen(true)
  }, [])

  const closeMetaDrawer = useCallback(() => {
    setMetaDrawerOpen(false)
  }, [])

  return {
    closeMetaDrawer,
    metaDrawerOpen,
    openMetaDrawer,
    ...previewModel,
  }
}
