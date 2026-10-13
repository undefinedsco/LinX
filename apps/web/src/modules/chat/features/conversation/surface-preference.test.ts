import { afterEach, describe, expect, it } from 'vitest'
import {
  CONVERSATION_SURFACE_STORAGE_KEY,
  readConversationSurface,
  writeConversationSurface,
} from './surface-preference'

afterEach(() => localStorage.removeItem(CONVERSATION_SURFACE_STORAGE_KEY))

describe('conversation surface switch', () => {
  it('defaults to ChatKit', () => {
    expect(readConversationSurface()).toBe('chatkit')
  })

  it('switches to assistant-ui and back, ignoring unknown values', () => {
    writeConversationSurface('assistant-ui')
    expect(readConversationSurface()).toBe('assistant-ui')
    localStorage.setItem(CONVERSATION_SURFACE_STORAGE_KEY, 'something-else')
    expect(readConversationSurface()).toBe('chatkit')
    writeConversationSurface('chatkit')
    expect(readConversationSurface()).toBe('chatkit')
  })
})
