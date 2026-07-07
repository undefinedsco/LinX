import { useFilesMetaSidecar } from '../../data/queries'
import type { FilesEntry } from '../../domain/resource/resource-model'

export type ResourceMetaSidecarQuery = ReturnType<typeof useFilesMetaSidecar>

export function useResourceMetaDrawerController({
  open,
  target,
}: {
  open: boolean
  target: Pick<FilesEntry, 'uri' | 'kind'>
}) {
  const metaQuery = useFilesMetaSidecar(target, open)

  return {
    metaQuery,
  }
}
