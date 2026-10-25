/**
 * R6 K2 "被引用" and "用过它的工作": what points at a card.
 *
 * Pure projections over data the app already holds:
 *  - note / text bodies in the body index (a markdown link such as the 来源 line that 做成卡片 writes),
 *  - other rows of the same table whose cells link to the row,
 *  - chat messages that carry a 问 LinX citation of the card.
 */
import { displayResourceName } from '../resource/resource-semantics'
import type { StructuredTableProjection } from '../structured/structured-table'
import { labelPredicate, projectCardSubjectModel } from './card-dialog-model'
import { expandRdfIri, isRdfLiteralToken, localRdfName } from './rdf-term-tokens'

export interface CardBacklink {
  key: string
  /** The card to open. */
  uri: string
  title: string
  /** Why it points here, in words ("来源", "链接了它", "属性：负责人"). */
  hint: string
  /** 1-based line of the link in the opened text, so the popup can jump there. */
  line?: number
  /** Set for a whiteboard the card sits on: opening it shows the board instead of a card. */
  board?: { viewOf: string | null; boardUri: string }
}

export interface CardBacklinkText {
  uri: string
  title: string
  text: string
}

function safeDecode(value: string) {
  try { return decodeURI(value) } catch { return value }
}

/** The spellings a link to this card can have in a text. */
export function cardLinkNeedles(uri: string): string[] {
  const decoded = safeDecode(uri)
  let encoded = decoded
  try { encoded = encodeURI(decoded) } catch { /* keep the decoded spelling */ }
  return [...new Set([uri, decoded, encoded])]
}

const WORD_CHAR = /[A-Za-z0-9_%~-]/

/** `…/a.md` must not match `…/a.md.bak` or `…/a.md5`; a sentence-final dot is fine. */
function endsAtBoundary(text: string, end: number) {
  const next = text[end]
  if (next === undefined) return true
  if (WORD_CHAR.test(next)) return false
  if (next === '.' && /[A-Za-z0-9]/.test(text[end + 1] ?? '')) return false
  return true
}

function findLink(text: string, needles: readonly string[]): number {
  let best = -1
  for (const needle of needles) {
    let from = 0
    while (from <= text.length) {
      const index = text.indexOf(needle, from)
      if (index < 0) break
      if (endsAtBoundary(text, index + needle.length)) {
        if (best < 0 || index < best) best = index
        break
      }
      from = index + needle.length
    }
  }
  return best
}

function lineAt(text: string, index: number) {
  const start = text.lastIndexOf('\n', index - 1) + 1
  const endRaw = text.indexOf('\n', index)
  return {
    number: text.slice(0, index).split('\n').length,
    text: text.slice(start, endRaw < 0 ? text.length : endRaw).trim(),
  }
}

/** Files whose text links to the card (cards made with 做成卡片 point back with a 来源 line). */
export function projectTextBacklinks({
  uri,
  ownDocumentUri,
  docs,
  limit = 20,
}: {
  uri: string
  /** The file the card lives in: it never counts as pointing at itself. */
  ownDocumentUri: string
  docs: readonly CardBacklinkText[]
  limit?: number
}): CardBacklink[] {
  const needles = cardLinkNeedles(uri)
  const result: CardBacklink[] = []
  for (const doc of docs) {
    if (doc.uri === ownDocumentUri) continue
    const index = findLink(doc.text, needles)
    if (index < 0) continue
    const line = lineAt(doc.text, index)
    result.push({
      key: `text:${doc.uri}`,
      uri: doc.uri,
      title: displayResourceName(doc.title),
      hint: /^(来源|出处|source)\s*[:：]/i.test(line.text) ? '来源' : '链接了它',
      line: line.number,
    })
    if (result.length >= limit) break
  }
  return result
}

/** Other rows of the same table that link to this row (a relation column). */
export function projectRowBacklinks({
  projection,
  documentUri,
  subjectIri,
  limit = 20,
}: {
  projection: StructuredTableProjection
  documentUri: string
  subjectIri: string
  limit?: number
}): CardBacklink[] {
  const result: CardBacklink[] = []
  for (const row of projection.rows) {
    const rowIri = expandRdfIri(row.subject, documentUri, projection.prefixes)
    if (rowIri === subjectIri) continue
    for (const cell of row.cells) {
      if (!cell.values.some((value) => !isRdfLiteralToken(value) && expandRdfIri(value, documentUri, projection.prefixes) === subjectIri)) continue
      const predicate = expandRdfIri(cell.predicate, documentUri, projection.prefixes)
      const model = projectCardSubjectModel({ projection, documentUri, subjectIri: rowIri })
      result.push({
        key: `row:${rowIri}:${predicate}`,
        uri: rowIri,
        title: model?.title ?? localRdfName(rowIri),
        hint: `属性：${labelPredicate(predicate)}`,
      })
      break
    }
    if (result.length >= limit) break
  }
  return result
}

export interface CardCitingMessage {
  messageId: string
  chatRef: string
  threadRef: string | null
  quote: string | null
  createdAt: string | null
}

interface MessageLike {
  id?: string | null
  chat?: string | null
  thread?: string | null
  richContent?: string | null
  createdAt?: string | Date | null
}

function citationItems(richContent: string | null | undefined): Array<Record<string, unknown>> {
  if (!richContent || !richContent.includes('sourceUri')) return []
  try {
    const parsed = JSON.parse(richContent) as unknown
    const items = Array.isArray(parsed) ? parsed : [parsed]
    return items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
  } catch {
    return []
  }
}

/** Does a citation of `sourceUri` (maybe with a #line= spot) point at this card? */
function citationPointsAt(sourceUri: string, needles: readonly string[]) {
  return needles.some((needle) => sourceUri.startsWith(needle) && endsAtBoundary(sourceUri, needle.length))
}

/** Chat messages that cite the card through 问 LinX (the citation is stored with the message). */
export function projectCitingMessages(messages: readonly MessageLike[], uri: string): CardCitingMessage[] {
  const needles = cardLinkNeedles(uri)
  const result: CardCitingMessage[] = []
  for (const message of messages) {
    for (const item of citationItems(message.richContent)) {
      const citation = item.citation
      if (!citation || typeof citation !== 'object') continue
      const { sourceUri, locator } = citation as { sourceUri?: unknown; locator?: { quote?: unknown } }
      if (typeof sourceUri !== 'string' || !citationPointsAt(sourceUri, needles)) continue
      result.push({
        messageId: message.id ?? '',
        chatRef: message.chat ?? '',
        threadRef: message.thread ?? null,
        quote: typeof locator?.quote === 'string' ? locator.quote : null,
        createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : message.createdAt ?? null,
      })
      break
    }
  }
  return result
}

export interface CardWorkUse {
  chatRef: string
  count: number
  quote: string | null
  lastAt: string | null
}

/** One line per chat: how many of its messages used the card, newest first. */
export function projectWorkUses(citing: readonly CardCitingMessage[]): CardWorkUse[] {
  const byChat = new Map<string, CardWorkUse>()
  for (const message of citing) {
    const current = byChat.get(message.chatRef)
    if (!current) {
      byChat.set(message.chatRef, { chatRef: message.chatRef, count: 1, quote: message.quote, lastAt: message.createdAt })
      continue
    }
    current.count += 1
    if ((message.createdAt ?? '') > (current.lastAt ?? '')) {
      current.lastAt = message.createdAt
      current.quote = message.quote ?? current.quote
    }
  }
  return [...byChat.values()].sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))
}

/** Whiteboards the card sits on, listed with the other things that point at it. */
export function projectBoardBacklinks(
  placements: ReadonlyArray<{ boardUri: string; viewOf: string | null; name: string }>,
): CardBacklink[] {
  return placements.map((placement) => ({
    key: `board:${placement.boardUri}`,
    uri: placement.viewOf ?? placement.boardUri,
    title: placement.name,
    hint: '在白板上',
    board: { viewOf: placement.viewOf, boardUri: placement.boardUri },
  }))
}
