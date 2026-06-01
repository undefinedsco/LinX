import { describe, expect, it } from 'vitest'
import { normalizeResourceId } from './direct-chat-records'

describe('direct-chat-records', () => {
  it('keeps durable resource ids independent from subject file suffixes', () => {
    expect(normalizeResourceId('__secretary__')).toBe('__secretary__')
    expect(normalizeResourceId('__secretary__.ttl')).toBe('__secretary__')
    expect(normalizeResourceId('https://alice.example/.data/agents/__secretary__.ttl#this')).toBe('__secretary__')
  })
})
