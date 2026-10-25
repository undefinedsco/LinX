import { describe, expect, it } from 'vitest'
import { favoriteAuthorLabel } from './favorite-author'

describe('favoriteAuthorLabel', () => {
  it('shows 我 for the current user, never the raw account label', () => {
    expect(favoriteAuthorLabel({ role: 'user', speaker: null, selfName: 'test@localhost:42140' })).toBe('我')
    expect(favoriteAuthorLabel({ role: 'user', speaker: 'test@localhost:42140', selfName: 'test@localhost:42140' })).toBe('我')
  })

  it('shows the contact name for other people in a group', () => {
    expect(favoriteAuthorLabel({ role: 'user', speaker: '小王', selfName: 'test@localhost:42140' })).toBe('小王')
  })

  it('shows the assistant name for assistant messages', () => {
    expect(favoriteAuthorLabel({ role: 'assistant', speaker: null, agentName: '小助手' })).toBe('小助手')
  })
})
