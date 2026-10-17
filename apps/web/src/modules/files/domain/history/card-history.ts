/**
 * Card version history (R6 K2b).
 *
 * The Pod keeps no revisions of a resource, so the card popup keeps a light
 * snapshot list of its own: one JSON sidecar per card under the LinX data area
 * (`.data/history/<name>-<hash>.json`), written by the popup's save paths.
 *
 * Shape: `{ linx: { version: 1, card: <uri> }, versions: CardVersion[] }`, newest
 * last. Rules:
 * - capped at CARD_HISTORY_MAX_VERSIONS (oldest are dropped);
 * - saves by the same author within CARD_HISTORY_MERGE_MS replace the last
 *   version, so autosave while typing is one version, not dozens;
 * - a snapshot identical to the last one is not added;
 * - the very first save also records the content from before it, as `v1`;
 * - snapshots above CARD_HISTORY_MAX_BODY_CHARS are not kept (the save still
 *   goes through, the version list just has a gap).
 */
import { hashText } from './text-hash'
import { filesDataResourceUri } from '../resource/files-rdf-contract'
import { formatFilesDayLabel } from '../card/card-dialog-model'

export const CARD_HISTORY_MAX_VERSIONS = 20
export const CARD_HISTORY_MERGE_MS = 10 * 60 * 1000
export const CARD_HISTORY_MAX_BODY_CHARS = 200_000
export const CARD_HISTORY_FORMAT_VERSION = 1

export type CardVersionAuthor = 'you' | 'linx'

/** A snapshot of what a card held. Document cards use `body`; table cards also keep their property values. */
export interface CardSnapshot {
  body: string
  /** Table cards: predicate IRI -> patch-ready value tokens. */
  properties?: Record<string, string[]>
}

export interface CardVersion {
  id: string
  /** ISO time, or null for the content that was there before history started. */
  savedAt: string | null
  by: CardVersionAuthor
  snapshot: CardSnapshot
}

export interface CardHistory {
  card: string
  versions: CardVersion[]
}

export function emptyCardHistory(card: string): CardHistory {
  return { card, versions: [] }
}

export function cardHistoryResourceUri(podRootUri: string, cardUri: string): string {
  let tail = cardUri.split('#')[1] ?? cardUri.replace(/\/+$/, '').split('/').pop() ?? 'card'
  try { tail = decodeURIComponent(tail) } catch { /* keep raw */ }
  const slug = tail.replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'card'
  return filesDataResourceUri(podRootUri, `history/${slug}-${hashText(cardUri)}.json`)
}

function isAuthor(value: unknown): value is CardVersionAuthor {
  return value === 'you' || value === 'linx'
}

function normalizeSnapshot(value: unknown): CardSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (typeof candidate.body !== 'string') return null
  const snapshot: CardSnapshot = { body: candidate.body }
  if (candidate.properties && typeof candidate.properties === 'object') {
    const properties: Record<string, string[]> = {}
    for (const [predicate, tokens] of Object.entries(candidate.properties as Record<string, unknown>)) {
      if (Array.isArray(tokens) && tokens.every((token) => typeof token === 'string')) properties[predicate] = tokens as string[]
    }
    snapshot.properties = properties
  }
  return snapshot
}

/** Tolerant reader: an unreadable file is an empty history, never an error in the popup. */
export function parseCardHistory(card: string, content: string | null | undefined): CardHistory {
  if (!content?.trim()) return emptyCardHistory(card)
  let value: unknown
  try { value = JSON.parse(content) } catch { return emptyCardHistory(card) }
  const list = value && typeof value === 'object' ? (value as Record<string, unknown>).versions : null
  if (!Array.isArray(list)) return emptyCardHistory(card)
  const versions: CardVersion[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Record<string, unknown>
    const snapshot = normalizeSnapshot(candidate.snapshot)
    if (!snapshot || typeof candidate.id !== 'string' || !isAuthor(candidate.by)) continue
    versions.push({
      id: candidate.id,
      savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt : null,
      by: candidate.by,
      snapshot,
    })
  }
  return { card, versions: versions.slice(-CARD_HISTORY_MAX_VERSIONS) }
}

export function serializeCardHistory(history: CardHistory): string {
  return `${JSON.stringify({
    linx: { version: CARD_HISTORY_FORMAT_VERSION, card: history.card },
    versions: history.versions,
  }, null, '\t')}\n`
}

function sortedProperties(properties: Record<string, string[]> | undefined) {
  return Object.entries(properties ?? {}).sort(([left], [right]) => left.localeCompare(right))
}

export function cardSnapshotsEqual(a: CardSnapshot, b: CardSnapshot): boolean {
  return a.body === b.body && JSON.stringify(sortedProperties(a.properties)) === JSON.stringify(sortedProperties(b.properties))
}

function snapshotSize(snapshot: CardSnapshot) {
  return snapshot.body.length + JSON.stringify(snapshot.properties ?? {}).length
}

/**
 * Adds the result of a save to the history. `before` is the content the save
 * replaced; it becomes v1 when there is no history yet.
 */
export function recordCardVersion(
  history: CardHistory,
  {
    before,
    after,
    by = 'you',
    now = new Date(),
  }: { before?: CardSnapshot | null; after: CardSnapshot; by?: CardVersionAuthor; now?: Date },
): CardHistory {
  if (snapshotSize(after) > CARD_HISTORY_MAX_BODY_CHARS) return history
  let versions = [...history.versions]
  if (versions.length === 0 && before && snapshotSize(before) <= CARD_HISTORY_MAX_BODY_CHARS && !cardSnapshotsEqual(before, after)) {
    versions.push({ id: `v-${hashText(JSON.stringify(before))}`, savedAt: null, by: 'you', snapshot: before })
  }
  const last = versions[versions.length - 1]
  if (last && cardSnapshotsEqual(last.snapshot, after)) return { ...history, versions }
  const entry: CardVersion = {
    id: `v-${now.getTime().toString(36)}-${hashText(JSON.stringify(after)).slice(0, 4)}`,
    savedAt: now.toISOString(),
    by,
    snapshot: after,
  }
  const lastAt = last?.savedAt ? Date.parse(last.savedAt) : Number.NaN
  const mergeable = last && last.by === by && Number.isFinite(lastAt) && now.getTime() - lastAt < CARD_HISTORY_MERGE_MS && versions.length > 1
  if (mergeable) versions[versions.length - 1] = entry
  else versions.push(entry)
  versions = versions.slice(-CARD_HISTORY_MAX_VERSIONS)
  return { ...history, versions }
}

export interface CardVersionRow {
  id: string
  /** "v3" */
  label: string
  isCurrent: boolean
  /** "9月30日 14:05", or "更早" for content from before history started. */
  whenLabel: string
  authorLabel: '你' | 'LinX'
  snapshot: CardSnapshot
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function whenLabel(savedAt: string | null, now: Date) {
  if (!savedAt) return '更早'
  const date = new Date(savedAt)
  if (Number.isNaN(date.getTime())) return '更早'
  return `${formatFilesDayLabel(savedAt, now)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Newest first; the newest is "当前". */
export function projectCardVersionRows(history: CardHistory, now: Date = new Date()): CardVersionRow[] {
  const count = history.versions.length
  return history.versions
    .map((version, index) => ({
      id: version.id,
      label: `v${index + 1}`,
      isCurrent: index === count - 1,
      whenLabel: whenLabel(version.savedAt, now),
      authorLabel: version.by === 'linx' ? 'LinX' as const : '你' as const,
      snapshot: version.snapshot,
    }))
    .reverse()
}

export type CardDiffLine = { kind: 'same' | 'added' | 'removed'; text: string }

/** Line diff (LCS) between an old version and the current text, for the compare view. */
export function diffCardLines(from: string, to: string): CardDiffLine[] {
  const a = from.split('\n')
  const b = to.split('\n')
  if (a.length * b.length > 250_000) {
    return [...a.map((text) => ({ kind: 'removed' as const, text })), ...b.map((text) => ({ kind: 'added' as const, text }))]
  }
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
    }
  }
  const out: CardDiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push({ kind: 'same', text: a[i]! }); i += 1; j += 1 }
    else if (table[i + 1]![j]! >= table[i]![j + 1]!) { out.push({ kind: 'removed', text: a[i]! }); i += 1 }
    else { out.push({ kind: 'added', text: b[j]! }); j += 1 }
  }
  while (i < a.length) { out.push({ kind: 'removed', text: a[i]! }); i += 1 }
  while (j < b.length) { out.push({ kind: 'added', text: b[j]! }); j += 1 }
  return out
}
