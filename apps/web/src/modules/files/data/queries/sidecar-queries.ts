import { useQuery } from '@tanstack/react-query'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import type {
  FilesAccessBasics,
  FilesDetail,
  FilesMetaSidecar,
} from '../../domain/resource/resource-model'
import { filesSidecarQueryCollection } from '../collections'

export function useFilesAccessBasics(file: Pick<FilesDetail, 'uri' | 'kind'> | null, enabled = true) {
  const { db } = useSolidDatabase()

  return useQuery<FilesAccessBasics>(filesSidecarQueryCollection.accessBasics({ file, enabled, db }))
}

export function useFilesMetaSidecar(file: Pick<FilesDetail, 'uri' | 'kind'> | null, enabled = true) {
  const { db } = useSolidDatabase()

  return useQuery<FilesMetaSidecar>(filesSidecarQueryCollection.metaSidecar({ file, enabled, db }))
}
