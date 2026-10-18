/**
 * What the whiteboard's card library knows about the rest of the space (R6 K4):
 * - rows of the other tables, so they can be dragged onto this board;
 * - which cards already sit on another board ("已在“<board>”白板上"), found by
 *   reading the JSON Canvas files of the space's other boards.
 *
 * The board index is built from the canvas files on demand and cached by the
 * data layer (react-query, one minute); nothing here is stored.
 */
import type { FilesEntry } from '../resource/resource-model'
import { getEntryName, getFilesEntryOpenMode } from '../resource/resource-semantics'
import type { StructuredCardProjection } from './structured-projections'
import {
  parseWhiteboardCanvas,
  resolveWhiteboardCardNodeUri,
  resolveWhiteboardSubjectUri,
} from './structured-whiteboard-canvas'

export const WHITEBOARD_SPACE_MAX_TABLES = 20
export const WHITEBOARD_SPACE_MAX_BOARDS = 40

const INTERNAL_PATHS = ['/.data/proposals/', '/.data/views/', '/.data/history/', '/.vocab/', '/.data/inbox/']

/** A data table the library may list rows from: an RDF document that is not a sidecar or system record. */
export function isWhiteboardSpaceTableEntry(
  entry: Pick<FilesEntry, 'kind' | 'semanticKind' | 'mimeType' | 'uri'>,
): boolean {
  if (entry.kind === 'container') return false
  if (INTERNAL_PATHS.some((part) => entry.uri.includes(part))) return false
  if (/\.(meta|acl)$/i.test(entry.uri)) return false
  return getFilesEntryOpenMode(entry) === 'structured-data-table'
}

export function whiteboardTableLabel(tableUri: string): string {
  const name = getEntryName(tableUri.split('#')[0] ?? tableUri)
  return name.replace(/\.(ttl|jsonld|rdf|nt|trig)$/i, '')
}

export interface WhiteboardSpaceRow {
  uri: string
  title: string
  subtitle: string
  summary: string
  className: string | null
}

export function projectWhiteboardSpaceRows(
  tables: ReadonlyArray<{ uri: string; cards: readonly StructuredCardProjection[] }>,
  { excludeDocumentUri }: { excludeDocumentUri: string },
): WhiteboardSpaceRow[] {
  const rows: WhiteboardSpaceRow[] = []
  for (const table of tables) {
    if (table.uri === excludeDocumentUri.split('#')[0]) continue
    const label = whiteboardTableLabel(table.uri)
    for (const card of table.cards) {
      rows.push({
        uri: resolveWhiteboardSubjectUri(card.subject, table.uri),
        title: card.title || '未命名卡片',
        subtitle: label,
        summary: card.summary,
        className: card.className,
      })
    }
  }
  return rows
}

/** The name a board goes by: the table or folder it is a view of. */
export function whiteboardBoardName(viewOf: string | null, boardUri: string): string {
  const source = viewOf ?? boardUri
  const trimmed = source.split('#')[0]?.replace(/\/+$/, '') ?? source
  const last = trimmed.split('/').pop() ?? ''
  let decoded = last
  try { decoded = decodeURIComponent(last) } catch { /* keep raw */ }
  const name = decoded.replace(/\.(ttl|jsonld|rdf|nt|trig|canvas)$/i, '')
  return name || '未命名白板'
}

/**
 * Card URI -> names of the other boards it is on. `boards` are the canvas files
 * of the space as read from the Pod; the board being edited is left out.
 */
export function buildWhiteboardCardIndex(
  boards: ReadonlyArray<{ uri: string; content: string | null | undefined }>,
  { currentBoardUri, podRootUri }: { currentBoardUri: string | null; podRootUri: string | null | undefined },
): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const board of boards) {
    if (board.uri === currentBoardUri) continue
    const parsed = parseWhiteboardCanvas(board.content)
    if (!parsed) continue
    const name = whiteboardBoardName(parsed.viewOf, board.uri)
    for (const node of parsed.canvas.nodes) {
      const cardUri = resolveWhiteboardCardNodeUri(node, podRootUri)
      if (!cardUri || node.type === 'group') continue
      const names = index.get(cardUri) ?? []
      if (!names.includes(name)) names.push(name)
      index.set(cardUri, names)
    }
  }
  return index
}

/** "已在“秋季读书会”白板上" (several boards: the first two, then 等). */
export function projectWhiteboardUsedOnLabel(boardNames: readonly string[] | undefined): string | null {
  if (!boardNames || boardNames.length === 0) return null
  const shown = boardNames.slice(0, 2).map((name) => `“${name}”`).join('、')
  return boardNames.length > 2 ? `已在${shown}等 ${boardNames.length} 块白板上` : `已在${shown}白板上`
}
