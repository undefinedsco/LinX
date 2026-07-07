import { useFileDetail } from '../../data/queries'
import { projectFolderDescendantColumnModel } from '../../domain/folder/folder-detail-model'

export function useFolderDescendantColumnController(containerUri: string) {
  const detailQuery = useFileDetail(containerUri)
  const parentFile = detailQuery.data?.kind === 'container' ? detailQuery.data : null

  return projectFolderDescendantColumnModel({
    containerUri,
    error: detailQuery.error,
    isLoading: detailQuery.isLoading,
    parentFile,
  })
}
