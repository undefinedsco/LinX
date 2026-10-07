import type { QueryKey } from '@tanstack/react-query'
import type { SolidDatabase } from '@undefineds.co/models'
import {
  readFilesAccessBasics,
  readFilesMetaSidecar,
  type FilesAccessBasics,
  type FilesDetail,
  type FilesMetaSidecar,
} from '../pod-adapter'
import type { FilesResourceQueryOptions } from './resource-query-collection'

interface SidecarQueryKeyCollection {
  accessBasics(file?: Pick<FilesDetail, 'uri' | 'kind'> | null): QueryKey
  metaSidecar(file?: Pick<FilesDetail, 'uri' | 'kind'> | null): QueryKey
}

export interface SidecarQueryCollectionDependencies {
  filesResourceQueryKeys: SidecarQueryKeyCollection
}

export function createSidecarQueryCollection(dependencies: SidecarQueryCollectionDependencies) {
  const {
    filesResourceQueryKeys,
  } = dependencies

  return {
    accessBasics(input: {
      file?: Pick<FilesDetail, 'uri' | 'kind'> | null
      enabled?: boolean
      db?: SolidDatabase | null
    }): FilesResourceQueryOptions<FilesAccessBasics> {
      const enabled = input.enabled ?? true
      return {
        queryKey: filesResourceQueryKeys.accessBasics(input.file),
        queryFn: async () => {
          if (!input.db || !input.file) throw new Error('No file selected')
          return readFilesAccessBasics(input.db, input.file)
        },
        enabled: !!input.db && !!input.file && enabled,
      }
    },

    metaSidecar(input: {
      file?: Pick<FilesDetail, 'uri' | 'kind'> | null
      enabled?: boolean
      db?: SolidDatabase | null
    }): FilesResourceQueryOptions<FilesMetaSidecar> {
      const enabled = input.enabled ?? true
      return {
        queryKey: filesResourceQueryKeys.metaSidecar(input.file),
        queryFn: async () => {
          if (!input.db || !input.file) throw new Error('No file selected')
          return readFilesMetaSidecar(input.db, input.file)
        },
        enabled: !!input.db && !!input.file && enabled,
      }
    },
  }
}
