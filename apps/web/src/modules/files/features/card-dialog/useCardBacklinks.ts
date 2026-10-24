import { useMemo } from 'react'
import {
  projectRowBacklinks,
  projectTextBacklinks,
  type CardBacklink,
} from '../../domain/card/card-backlinks'
import type { StructuredTableProjection } from '../../domain/structured/structured-table'
import { useFilesCitingWork, type FilesCitingWork } from '../../data/queries'
import { useFilesBodyIndex } from '../../data/queries/body-search-queries'

export type CardWorkUseRow = FilesCitingWork

/**
 * R6 K2 bottom sections, read lazily when a card is open (the body index and the message list are
 * kept per Pod, so reopening a card or stepping with ‹ › only filters what is already held):
 *  - 被引用: notes whose text links to the card, and rows of the same table that point at it,
 *  - 用过它的工作: chats whose messages cited the card through 问 LinX.
 */
export function useCardBacklinks({
  uri,
  documentUri,
  projection,
  subjectIri,
  enabled,
}: {
  uri: string
  documentUri: string
  projection: StructuredTableProjection | null
  subjectIri: string | null
  enabled: boolean
}): { backlinks: CardBacklink[]; workUses: CardWorkUseRow[]; indexing: boolean } {
  const { store, snapshot } = useFilesBodyIndex(enabled)

  const textLinks = useMemo(() => {
    if (!enabled || !store) return []
    return projectTextBacklinks({ uri, ownDocumentUri: documentUri, docs: store.texts() })
    // `snapshot.version` moves whenever the index gains text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentUri, enabled, snapshot.version, store, uri])

  const rowLinks = useMemo(() => (
    enabled && projection && subjectIri
      ? projectRowBacklinks({ projection, documentUri, subjectIri })
      : []
  ), [documentUri, enabled, projection, subjectIri])

  const workUses = useFilesCitingWork(uri, enabled)

  return {
    backlinks: useMemo(() => [...rowLinks, ...textLinks], [rowLinks, textLinks]),
    workUses,
    indexing: snapshot.indexing,
  }
}
