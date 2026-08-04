import { useSession } from '@/providers/solid-session-context'
import { useQuery } from '@tanstack/react-query'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import {
  filesVocabDiscoveryQueryCollection,
  type FilesVocabDiscoveryResult,
} from '../collections'

export function useFilesVocabRegistryDiscovery(options: {
  enabled?: boolean
  localVocabUri?: string | null
} = {}) {
  const { db } = useSolidDatabase()
  const { session } = useSession()
  const enabled = options.enabled ?? true
  const webId = session.info.webId ?? null
  const localVocabUri = filesVocabDiscoveryQueryCollection.resolveLocalVocabUri({
    db,
    localVocabUri: options.localVocabUri,
  })

  return useQuery<FilesVocabDiscoveryResult>(filesVocabDiscoveryQueryCollection.discovery({
    webId,
    localVocabUri,
    authFetch: session.fetch ? session.fetch.bind(session) as typeof fetch : null,
    enabled,
  }))
}
