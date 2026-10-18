import { describe, expect, it } from 'vitest'

import {
  CARD_HISTORY_MAX_VERSIONS,
  cardHistoryResourceUri,
  diffCardLines,
  emptyCardHistory,
  parseCardHistory,
  projectCardVersionRows,
  recordCardVersion,
  serializeCardHistory,
} from './card-history'

const card = 'https://pod.example/notes/a.md'
const at = (minutes: number) => new Date(Date.UTC(2026, 8, 30, 12, 0) + minutes * 60_000)

describe('card history', () => {
  it('records the content before the first save as v1', () => {
    const history = recordCardVersion(emptyCardHistory(card), { before: { body: 'a' }, after: { body: 'b' }, now: at(0) })
    expect(history.versions.map((v) => v.snapshot.body)).toEqual(['a', 'b'])
    expect(history.versions[0]?.savedAt).toBeNull()
  })

  it('merges quick saves by the same author and skips identical ones', () => {
    let history = recordCardVersion(emptyCardHistory(card), { before: { body: 'a' }, after: { body: 'b' }, now: at(0) })
    history = recordCardVersion(history, { after: { body: 'bc' }, now: at(2) })
    expect(history.versions.map((v) => v.snapshot.body)).toEqual(['a', 'bc'])
    history = recordCardVersion(history, { after: { body: 'bc' }, now: at(3) })
    expect(history.versions).toHaveLength(2)
    history = recordCardVersion(history, { after: { body: 'bcd' }, now: at(30) })
    expect(history.versions).toHaveLength(3)
    history = recordCardVersion(history, { after: { body: 'x' }, by: 'linx', now: at(31) })
    expect(history.versions).toHaveLength(4)
  })

  it('caps the list and projects rows newest first', () => {
    let history = emptyCardHistory(card)
    for (let i = 0; i < 30; i += 1) history = recordCardVersion(history, { after: { body: `v${i}` }, now: at(i * 60) })
    expect(history.versions).toHaveLength(CARD_HISTORY_MAX_VERSIONS)
    const rows = projectCardVersionRows(history, at(30 * 60))
    expect(rows[0]).toMatchObject({ isCurrent: true, authorLabel: '你' })
    expect(rows[1]?.isCurrent).toBe(false)
  })

  it('round-trips and tolerates garbage', () => {
    const history = recordCardVersion(emptyCardHistory(card), { after: { body: 'x', properties: { p: ['"1"'] } }, now: at(0) })
    expect(parseCardHistory(card, serializeCardHistory(history)).versions).toEqual(history.versions)
    expect(parseCardHistory(card, '{nope').versions).toEqual([])
  })

  it('diffs lines and names the sidecar under the data area', () => {
    expect(diffCardLines('a\nb', 'a\nc').map((l) => l.kind)).toEqual(['same', 'removed', 'added'])
    expect(cardHistoryResourceUri('https://pod.example/', card)).toMatch(/^https:\/\/pod\.example\/\.data\/history\/a-[0-9a-f]{8}\.json$/)
  })
})
