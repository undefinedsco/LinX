import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import type {
  FilesAccessBasics,
  FilesDetail,
  FilesMetaSidecar,
  FilesStructuredViewMetadataSidecar,
} from '../../domain/resource/resource-model'
import type { StructuredViewMetadata } from '../../domain/structured/structured-view-metadata'
import {
  filesSidecarMutationCollection,
  filesSidecarQueryCollection,
} from '../collections'

export function useFilesAccessBasics(file: Pick<FilesDetail, 'uri' | 'kind'> | null, enabled = true) {
  const { db } = useSolidDatabase()

  return useQuery<FilesAccessBasics>(filesSidecarQueryCollection.accessBasics({ file, enabled, db }))
}

export function useFilesMetaSidecar(file: Pick<FilesDetail, 'uri' | 'kind'> | null, enabled = true) {
  const { db } = useSolidDatabase()

  return useQuery<FilesMetaSidecar>(filesSidecarQueryCollection.metaSidecar({ file, enabled, db }))
}

export function useStructuredViewMetadata(file: Pick<FilesDetail, 'uri' | 'kind'> | null, enabled = true) {
  const { db } = useSolidDatabase()

  return useQuery<FilesStructuredViewMetadataSidecar>(filesSidecarQueryCollection.structuredViewMetadata({ file, enabled, db }))
}

export function useSaveStructuredViewMetadata() {
  const { db } = useSolidDatabase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ file, metadata }: {
      file: Pick<FilesDetail, 'uri' | 'kind'>
      metadata: StructuredViewMetadata
    }) => {
      if (!db) throw new Error('Database not connected')
      return filesSidecarMutationCollection.saveStructuredViewMetadata({
        cacheClient: queryClient,
        db,
        file,
        metadata,
      })
    },
  })
}
