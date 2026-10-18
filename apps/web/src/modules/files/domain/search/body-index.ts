import MiniSearch from 'minisearch'

/**
 * Client-side full-text index of file bodies (MiniSearch, MIT).
 * Pure: no React, no Pod access. The store in `data/queries/body-search-store.ts`
 * feeds it and persists `snapshot()` in IndexedDB (per Pod); the index itself is
 * rebuilt in memory from the saved texts, so only plain records are persisted.
 */

export interface BodyDoc {
  uri: string
  title: string
  text: string
  /** Hash of the normalized text: unchanged content is never re-indexed. */
  hash: string
  /** Listing stamp (modified time + size) of the file when it was read. */
  stamp: string
}

export interface BodyHit {
  uri: string
  title: string
  score: number
  /** Short excerpt around the first match. */
  snippet: string
  /** What matched, as found in the text. */
  matched: string
  /** Plain-word reason shown next to the result. */
  reason: string
  /** 1-based line of the first match. */
  line: number
  quote: string
}

const CJK_CLASS = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}'
const WORD = new RegExp(`[${CJK_CLASS}]|[^\\s\\p{P}\\p{S}${CJK_CLASS}]+`, 'gu')

/**
 * Latin: lowercase words. CJK: one token per character, because pair tokens cost
 * ~14x the memory for the same text (measured). Phrases are then verified against
 * the text itself in `search`, so "排班" does not match 排…班 far apart.
 */
export function tokenizeBody(text: string): string[] {
  return text.toLowerCase().match(WORD) ?? []
}

const SNIPPET_BEFORE = 24
const SNIPPET_AFTER = 56

function createEngine() {
  return new MiniSearch<{ id: string; text: string }>({
    fields: ['text'],
    idField: 'id',
    tokenize: tokenizeBody,
  })
}

function locate(text: string, query: string, terms: string[]) {
  const lower = text.toLowerCase()
  const whole = query.trim().toLowerCase()
  const wholeIndex = whole ? lower.indexOf(whole) : -1
  if (wholeIndex >= 0) return { index: wholeIndex, needle: whole }
  const candidates = [...query.toLowerCase().split(/\s+/), ...terms].filter(Boolean)
  let best: { index: number; needle: string } | null = null
  for (const needle of candidates) {
    const index = lower.indexOf(needle)
    if (index >= 0 && (!best || index < best.index)) best = { index, needle }
  }
  return best
}

export function buildBodySnippet(text: string, query: string, terms: string[] = []) {
  const found = locate(text, query, terms)
  if (!found) return null
  const { index, needle } = found
  const lineStart = text.lastIndexOf('\n', index - 1) + 1
  const lineEndRaw = text.indexOf('\n', index)
  const lineEnd = lineEndRaw < 0 ? text.length : lineEndRaw
  const from = Math.max(lineStart, index - SNIPPET_BEFORE)
  const to = Math.min(lineEnd, index + needle.length + SNIPPET_AFTER)
  const excerpt = text.slice(from, to).trim()
  const snippet = `${from > lineStart ? '…' : ''}${excerpt}${to < lineEnd ? '…' : ''}`
  const line = text.slice(0, index).split('\n').length
  const matched = text.slice(index, index + needle.length)
  return { snippet, matched, line, quote: excerpt }
}

export class BodyIndex {
  private engine = createEngine()
  private docs = new Map<string, BodyDoc>()

  get size() { return this.docs.size }
  get totalChars() {
    let total = 0
    for (const doc of this.docs.values()) total += doc.text.length
    return total
  }
  has(uri: string) { return this.docs.has(uri) }
  get(uri: string) { return this.docs.get(uri) }
  uris() { return [...this.docs.keys()] }

  /** Incremental: same hash only refreshes the stamp and title. */
  upsert(doc: BodyDoc): 'added' | 'updated' | 'unchanged' {
    const current = this.docs.get(doc.uri)
    if (current && current.hash === doc.hash) {
      if (current.stamp !== doc.stamp || current.title !== doc.title) {
        this.docs.set(doc.uri, { ...current, stamp: doc.stamp, title: doc.title })
      }
      return 'unchanged'
    }
    if (current) this.engine.discard(doc.uri)
    this.docs.set(doc.uri, doc)
    this.engine.add({ id: doc.uri, text: doc.text })
    return current ? 'updated' : 'added'
  }

  remove(uri: string): boolean {
    if (!this.docs.delete(uri)) return false
    this.engine.discard(uri)
    return true
  }

  snapshot(): BodyDoc[] {
    return [...this.docs.values()]
  }

  restore(docs: readonly BodyDoc[]) {
    this.engine = createEngine()
    this.docs = new Map()
    this.engine.addAll(docs.map((doc) => ({ id: doc.uri, text: doc.text })))
    for (const doc of docs) this.docs.set(doc.uri, doc)
  }

  search(query: string, options: { limit?: number; filter?: (uri: string) => boolean } = {}): BodyHit[] {
    const trimmed = query.trim()
    if (!trimmed) return []
    const filter = options.filter
    const pieces = trimmed.toLowerCase().split(/\s+/).filter(Boolean)
    const results = this.engine.search(trimmed, {
      combineWith: 'AND',
      filter: filter ? (result) => filter(result.id as string) : undefined,
    })
    const hits: BodyHit[] = []
    for (const result of results) {
      const doc = this.docs.get(result.id as string)
      if (!doc) continue
      const lower = doc.text.toLowerCase()
      // Every typed word must really be in the text (as a phrase for CJK runs).
      if (!pieces.every((piece) => lower.includes(piece))) continue
      const located = buildBodySnippet(doc.text, trimmed, result.queryTerms)
      if (!located) continue
      const shown = located.matched.length > 20 ? `${located.matched.slice(0, 20)}…` : located.matched
      hits.push({
        uri: doc.uri,
        title: doc.title,
        score: result.score,
        snippet: located.snippet,
        matched: located.matched,
        reason: `正文里有 “${shown}”`,
        line: located.line,
        quote: located.quote,
      })
      if (options.limit && hits.length >= options.limit) break
    }
    return hits
  }
}

export interface BodyCoverage {
  /** Files a person would search into (no folders, no sidecars). */
  totalFiles: number
  /** Of those, how many have body text in the index. */
  indexedFiles: number
  /** Readable files still being read. */
  indexing: boolean
}

/** At most one grey line, only when coverage is partial. */
export function projectBodyCoverageNote(coverage: BodyCoverage): string | null {
  if (coverage.indexing) return '文件正文还在建立索引，部分文件只按标题搜索'
  const nameOnly = coverage.totalFiles - coverage.indexedFiles
  if (nameOnly > 0) return `还有 ${nameOnly} 个文件的正文没建索引，只按名字找`
  return null
}
