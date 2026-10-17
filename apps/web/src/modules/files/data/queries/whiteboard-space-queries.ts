import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'

import { useSolidDatabase } from '@/providers/solid-database-provider'
import { filesDataResourceUri } from '../../domain/resource/files-rdf-contract'
import { projectStructuredCards } from '../../domain/structured/structured-projections'
import { projectStructuredResourceTable } from '../../domain/structured/structured-table'
import {
  WHITEBOARD_SPACE_MAX_BOARDS,
  WHITEBOARD_SPACE_MAX_TABLES,
  buildWhiteboardCardIndex,
  isWhiteboardSpaceTableEntry,
  projectWhiteboardSpaceRows,
  type WhiteboardSpaceRow,
} from '../../domain/structured/whiteboard-space-index'
import { filesResourceQueryCollection } from '../collections'
import { readWhiteboardCanvasResource } from '../whiteboard/whiteboard-canvas-resource'
import { useFilesContainerEntries, useFilesCurrentPodRootUri, useFilesPodSearchEntries } from './resource-queries'

const EMPTY_ROWS: WhiteboardSpaceRow[] = []
const EMPTY_INDEX = new Map<string, string[]>()
/** The index of other boards is cached for a minute; boards change rarely while you work on one. */
const BOARD_INDEX_STALE_MS = 60_000

export interface WhiteboardSpace {
  /** Rows of the space's other tables (the structured-table discovery), ready to drag onto the board. */
  rows: WhiteboardSpaceRow[]
  /** Card URI -> names of other boards that already hold it. */
  boardsByCard: ReadonlyMap<string, string[]>
  /** Title and summary of a row from another table, for cards already on this board. */
  rowByUri: ReadonlyMap<string, WhiteboardSpaceRow>
  loading: boolean
}

/**
 * Reads the space for the whiteboard library: other tables' rows and the JSON
 * Canvas files of the other boards. Off until `enabled` (the library is open or
 * the board already holds cards from other tables).
 */
export function useWhiteboardSpace({
  enabled,
  documentUri,
  currentBoardUri,
}: {
  enabled: boolean
  documentUri: string
  currentBoardUri: string | null
}): WhiteboardSpace {
  const { db } = useSolidDatabase()
  const podRootUri = useFilesCurrentPodRootUri()
  const entries = useFilesPodSearchEntries(enabled)
  const documentBase = documentUri.split('#')[0] ?? documentUri

  const tableEntries = useMemo(() => (entries.data ?? [])
    .filter(isWhiteboardSpaceTableEntry)
    .filter((entry) => entry.uri !== documentBase)
    .slice(0, WHITEBOARD_SPACE_MAX_TABLES), [documentBase, entries.data])
  const tableQueries = useQueries({
    queries: tableEntries.map((entry) => filesResourceQueryCollection.rawText({ fileUri: entry.uri, enabled, db })),
  })

  const boardsContainer = podRootUri ? filesDataResourceUri(podRootUri, 'views/whiteboard/') : null
  const boardEntries = useFilesContainerEntries(boardsContainer, enabled)
  const boardFiles = useMemo(() => (boardEntries.data ?? [])
    .filter((entry) => entry.kind !== 'container' && entry.uri.endsWith('.canvas'))
    .slice(0, WHITEBOARD_SPACE_MAX_BOARDS), [boardEntries.data])
  const boardQueries = useQueries({
    queries: boardFiles.map((entry) => ({
      queryKey: ['files', 'whiteboard-index', entry.uri] as const,
      enabled: enabled && Boolean(db),
      staleTime: BOARD_INDEX_STALE_MS,
      retry: false,
      queryFn: async () => {
        if (!db) throw new Error('Database not connected')
        const resource = await readWhiteboardCanvasResource(db, entry.uri)
        return { uri: entry.uri, content: resource.content }
      },
    })),
  })

  const tableKey = tableQueries.map((query) => `${query.dataUpdatedAt}`).join(',')
  const boardKey = boardQueries.map((query) => `${query.dataUpdatedAt}`).join(',')

  const rows = useMemo(() => {
    if (!enabled) return EMPTY_ROWS
    const tables = tableQueries.flatMap((query, index) => {
      const entry = tableEntries[index]
      if (!entry || !query.data) return []
      const projection = projectStructuredResourceTable({
        uri: entry.uri,
        mimeType: query.data.mimeType,
        source: query.data.content,
      })
      return [{ uri: entry.uri, cards: projectStructuredCards(projection) }]
    })
    return projectWhiteboardSpaceRows(tables, { excludeDocumentUri: documentUri })
    // tableQueries changes identity every render; tableKey tracks its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentUri, enabled, tableEntries, tableKey])
  const rowByUri = useMemo(() => new Map(rows.map((row) => [row.uri, row])), [rows])

  const boardsByCard = useMemo(() => {
    if (!enabled) return EMPTY_INDEX
    return buildWhiteboardCardIndex(
      boardQueries.flatMap((query) => (query.data ? [query.data] : [])),
      { currentBoardUri, podRootUri },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBoardUri, enabled, podRootUri, boardKey])

  return {
    rows,
    boardsByCard,
    rowByUri,
    loading: enabled && (entries.isLoading || tableQueries.some((query) => query.isLoading)),
  }
}
