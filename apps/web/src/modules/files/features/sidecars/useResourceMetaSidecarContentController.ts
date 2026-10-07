import type { FilesDetail } from '../../domain/resource/resource-model'
import { projectResourceMetaSidecarContent } from './resource-meta-sidecar-content-model'
import type { ResourceMetaSidecarQuery } from './useResourceMetaDrawerController'

export function useResourceMetaSidecarContentController({
  file,
  query,
}: {
  file: FilesDetail
  query: ResourceMetaSidecarQuery
}) {
  return projectResourceMetaSidecarContent({
    file,
    isLoading: query.isLoading,
    error: query.error,
    meta: query.data,
  })
}
