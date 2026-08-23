import { describe, expect, it } from 'vitest'
import { canonicalChatKitItemId } from './useMessageActionsController'

describe('canonicalChatKitItemId', () => {
  it('treats a full RDF subject and its base-relative id as the same item', () => {
    expect(canonicalChatKitItemId('chat/__secretary__/2026/08/23/messages.ttl#user-message-1'))
      .toBe('user-message-1')
    expect(canonicalChatKitItemId('user-message-1')).toBe('user-message-1')
  })

  it('keeps ids without a fragment unchanged', () => {
    expect(canonicalChatKitItemId('assistant-message-1')).toBe('assistant-message-1')
  })
})
