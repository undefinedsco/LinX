import { describe, expect, it } from 'vitest'
import {
  THREAD_HANDOFF_MESSAGES,
  THREAD_HANDOFF_MESSAGE_CHARS,
  THREAD_ROLLOVER_MAX_ESTIMATED_TOKENS,
  THREAD_ROLLOVER_MAX_MESSAGES,
  buildHandoffSummary,
  estimateTokens,
  threadRolloverReason,
} from './chat-threads'

describe('thread rollover policy', () => {
  const now = Date.parse('2026-10-17T12:00:00Z')
  const fresh = { id: 't', updatedAt: '2026-10-17T11:00:00Z' }

  it('keeps going in a thread that is short and recent', () => {
    expect(threadRolloverReason(fresh, { messageCount: 20, estimatedTokens: 3000 }, now)).toBeNull()
  })

  it('never rolls over an empty thread', () => {
    expect(threadRolloverReason({ id: 't', updatedAt: '2020-01-01T00:00:00Z' }, { messageCount: 0, estimatedTokens: 0 }, now)).toBeNull()
  })

  it('rolls over when the thread is too long by count or by size', () => {
    expect(threadRolloverReason(fresh, { messageCount: THREAD_ROLLOVER_MAX_MESSAGES, estimatedTokens: 10 }, now)).toBe('long')
    expect(threadRolloverReason(fresh, { messageCount: 10, estimatedTokens: THREAD_ROLLOVER_MAX_ESTIMATED_TOKENS }, now)).toBe('long')
  })

  it('rolls over after a long quiet time, judged by the newest message first', () => {
    const old = { id: 't', updatedAt: '2026-10-01T00:00:00Z' }
    expect(threadRolloverReason(old, { messageCount: 4, estimatedTokens: 100 }, now)).toBe('idle')
    expect(threadRolloverReason(old, { messageCount: 4, estimatedTokens: 100, lastMessageAt: '2026-10-17T10:00:00Z' }, now)).toBeNull()
  })

  it('estimates Chinese denser than English', () => {
    expect(estimateTokens('你好世界')).toBe(4)
    expect(estimateTokens('hello world')).toBeLessThan(5)
  })

  it('builds a short handoff note from the tail of the old thread', () => {
    const messages = Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      text: `第${index}条 ${'很长'.repeat(200)}`,
      createdAt: 1000 + index,
    }))
    const lines = buildHandoffSummary([...messages].reverse()).split('\n')
    expect(lines).toHaveLength(THREAD_HANDOFF_MESSAGES)
    expect(lines[0]).toMatch(/^用户：第4条/)
    expect(lines.at(-1)).toMatch(/^助手：第9条/)
    expect(lines.every((line) => line.length <= THREAD_HANDOFF_MESSAGE_CHARS + 4)).toBe(true)
    expect(buildHandoffSummary([{ role: 'user', text: '  ' }])).toBe('')
  })
})
