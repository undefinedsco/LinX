import { useCallback, useMemo } from 'react'

import { useSolidDatabase } from '@/providers/solid-database-provider'
import {
  cardHistoryResourceUri,
  parseCardHistory,
  recordCardVersion,
  serializeCardHistory,
  type CardHistory,
  type CardSnapshot,
  type CardVersionAuthor,
} from '../../domain/history/card-history'
import { CardHistoryRequestError, readCardHistoryResource, writeCardHistoryResource } from '../history/card-history-resource'
import { useFilesCurrentPodRootUri } from './resource-queries'

export interface CardHistoryAccess {
  ready: boolean
  read: (cardUri: string) => Promise<CardHistory>
  /** Appends a version after a save; retries once when another device wrote first. */
  record: (input: { cardUri: string; before?: CardSnapshot | null; after: CardSnapshot; by?: CardVersionAuthor }) => Promise<void>
}

/** Pod access for the card popup's version list. History is best effort: callers must not fail a save over it. */
export function useCardHistoryAccess(): CardHistoryAccess {
  const { db } = useSolidDatabase()
  const podRootUri = useFilesCurrentPodRootUri()

  const read = useCallback(async (cardUri: string) => {
    if (!db || !podRootUri) return parseCardHistory(cardUri, null)
    const resource = await readCardHistoryResource(db, cardHistoryResourceUri(podRootUri, cardUri))
    return parseCardHistory(cardUri, resource.content)
  }, [db, podRootUri])

  const record = useCallback(async (input: { cardUri: string; before?: CardSnapshot | null; after: CardSnapshot; by?: CardVersionAuthor }) => {
    if (!db || !podRootUri) return
    const uri = cardHistoryResourceUri(podRootUri, input.cardUri)
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const resource = await readCardHistoryResource(db, uri)
      const next = recordCardVersion(parseCardHistory(input.cardUri, resource.content), input)
      try {
        await writeCardHistoryResource(db, {
          uri,
          content: serializeCardHistory(next),
          etag: resource.state === 'missing' ? 'absent' : resource.etag,
        })
        return
      } catch (error) {
        if (!(error instanceof CardHistoryRequestError) || error.kind !== 'conflict') throw error
      }
    }
  }, [db, podRootUri])

  return useMemo(() => ({ ready: Boolean(db && podRootUri), read, record }), [db, podRootUri, read, record])
}
