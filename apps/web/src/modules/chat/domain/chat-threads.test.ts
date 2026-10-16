import { describe, expect, it } from 'vitest'
import { mergeThreadTimelines, pickSendThread } from './chat-threads'

describe('pickSendThread', () => {
  it('sends into the most recently active thread of the chat', () => {
    const threads = [
      { id: 'old', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z' },
      { id: 'busy', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-09T00:00:00Z' },
      { id: 'new-but-idle', createdAt: '2026-10-05T00:00:00Z' },
    ]
    expect(pickSendThread(threads)?.id).toBe('busy')
  })

  it('falls back to creation time and accepts Date or number times', () => {
    expect(pickSendThread([
      { id: 'a', createdAt: new Date('2026-10-01T00:00:00Z') },
      { id: 'b', createdAt: new Date('2026-10-03T00:00:00Z').getTime() },
    ])?.id).toBe('b')
  })

  it('returns null when the chat has no thread, so the caller creates the default one', () => {
    expect(pickSendThread([])).toBeNull()
    expect(pickSendThread([{ id: null, updatedAt: 5 }])).toBeNull()
  })
})

describe('mergeThreadTimelines', () => {
  it('merges several threads into one timeline in time order, keeping each uri', () => {
    const merged = mergeThreadTimelines([
      [{ uri: 'pod/t1#m1', createdAt: 10 }, { uri: 'pod/t1#m2', createdAt: 30 }],
      [{ uri: 'pod/t2#m1', createdAt: 20 }, { uri: 'pod/t2#m2', createdAt: 40 }],
    ])
    expect(merged.map((entry) => entry.uri)).toEqual(['pod/t1#m1', 'pod/t2#m1', 'pod/t1#m2', 'pod/t2#m2'])
  })

  it('keeps a thread\'s own order on ties', () => {
    const merged = mergeThreadTimelines([
      [{ uri: 'a1', createdAt: 5 }, { uri: 'a2', createdAt: 5 }],
      [{ uri: 'b1', createdAt: 5 }],
    ])
    expect(merged.map((entry) => entry.uri)).toEqual(['a1', 'a2', 'b1'])
  })
})
