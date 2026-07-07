import type { QueryKey } from '@tanstack/react-query'
import type { SolidDatabase } from '@undefineds.co/models'
import {
  createSolidTypeIndexResourceTextReader,
  discoverSolidTypeIndexRegistrationsFromWebId,
  type SolidTypeIndexDiscoveryResult,
} from '../vocab/vocab-discovery'

export const FILES_VOCAB_REGISTRY_CLASS_URI = 'https://undefineds.co/vocab/VocabRegistry'

export type FilesVocabDiscoveryResult = SolidTypeIndexDiscoveryResult

interface FilesResourceQueryOptions<TData> {
  queryKey: QueryKey
  queryFn: () => Promise<TData>
  enabled: boolean
}

export interface VocabDiscoveryCollectionsDependencies {
  resolveCurrentPodRootUri: (dbOverride?: SolidDatabase | null) => string | null
  vocabDiscoveryQueryKey: (
    webId?: string | null,
    registryClassUri?: string | null,
    localVocabUri?: string | null,
  ) => QueryKey
}

export function createVocabDiscoveryCollections(dependencies: VocabDiscoveryCollectionsDependencies) {
  const {
    resolveCurrentPodRootUri,
    vocabDiscoveryQueryKey,
  } = dependencies

  const filesVocabDiscoveryCollection = {
    registryClassUri: FILES_VOCAB_REGISTRY_CLASS_URI,

    resolveLocalVocabUri(input: {
      db?: SolidDatabase | null
      localVocabUri?: string | null
    } = {}): string | null {
      const localVocabUri = input.localVocabUri?.trim()
      if (localVocabUri) return localVocabUri
      const podRootUri = resolveCurrentPodRootUri(input.db)
      return podRootUri ? `${podRootUri.replace(/\/$/, '')}/.vocab/terms.ttl` : null
    },

    queryKey(input: {
      webId?: string | null
      localVocabUri?: string | null
    }): QueryKey {
      return vocabDiscoveryQueryKey(
        input.webId,
        FILES_VOCAB_REGISTRY_CLASS_URI,
        input.localVocabUri,
      )
    },

    async discover(input: {
      webId: string
      authFetch: typeof fetch
      localVocabUri?: string | null
    }): Promise<FilesVocabDiscoveryResult> {
      return discoverSolidTypeIndexRegistrationsFromWebId({
        webId: input.webId,
        forClass: FILES_VOCAB_REGISTRY_CLASS_URI,
        localVocabUri: input.localVocabUri ?? null,
        readResourceText: createSolidTypeIndexResourceTextReader(input.authFetch),
      })
    },
  }

  const filesVocabDiscoveryQueryCollection = {
    resolveLocalVocabUri(input: {
      db?: SolidDatabase | null
      localVocabUri?: string | null
    } = {}): string | null {
      return filesVocabDiscoveryCollection.resolveLocalVocabUri(input)
    },

    discovery(input: {
      webId?: string | null
      authFetch?: typeof fetch | null
      localVocabUri?: string | null
      enabled?: boolean
    }): FilesResourceQueryOptions<FilesVocabDiscoveryResult> {
      const enabled = input.enabled ?? true
      return {
        queryKey: filesVocabDiscoveryCollection.queryKey({
          webId: input.webId,
          localVocabUri: input.localVocabUri,
        }),
        queryFn: async () => {
          if (!input.webId || !input.authFetch) {
            throw new Error('Cannot discover vocab Type Index without a logged-in WebID.')
          }
          return filesVocabDiscoveryCollection.discover({
            webId: input.webId,
            localVocabUri: input.localVocabUri,
            authFetch: input.authFetch,
          })
        },
        enabled: enabled && !!input.webId && !!input.authFetch,
      }
    },
  }

  return {
    filesVocabDiscoveryCollection,
    filesVocabDiscoveryQueryCollection,
  }
}
