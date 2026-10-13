import { describe, expect, it } from 'vitest'
import { countFavoriteGroups, favoriteGroupOf } from './groups'

const row = (sourceModule: string, extra: Record<string, unknown> = {}) =>
  ({ sourceModule, sourceId: 'x', ...extra }) as never

describe('favorite groups', () => {
  it('maps source modules to the five groups', () => {
    expect(favoriteGroupOf(row('messages'))).toBe('messages')
    expect(favoriteGroupOf(row('chat'))).toBe('chats')
    expect(favoriteGroupOf(row('thread'))).toBe('chats')
    expect(favoriteGroupOf(row('contacts'))).toBe('contacts')
    expect(favoriteGroupOf(row('files', { targetUri: 'https://pod.example/a.md' }))).toBe('files')
  })

  it('treats a subject inside a data document as a card', () => {
    expect(favoriteGroupOf(row('files', { targetUri: 'https://pod.example/t.ttl#row1' }))).toBe('cards')
    expect(favoriteGroupOf(row('files', { snapshotMeta: '{"kind":"card"}' }))).toBe('cards')
  })

  it('counts per group', () => {
    const counts = countFavoriteGroups([row('messages'), row('messages'), row('chat')])
    expect(counts).toMatchObject({ all: 3, messages: 2, chats: 1, files: 0 })
  })
})
