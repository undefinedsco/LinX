import { describe, expect, it } from 'vitest'
import { createAssistantTextDeltaEvent } from '../thread-stream-events'

// Regression: ISSUE-CHAT-P1-STREAM — ChatKit 1.9 rejected text deltas that used the legacy part_index field.
// Found by /qa on 2026-08-09.
// Report: .gstack/qa-reports/qa-report-linx-local-2026-08-09.md
describe('ChatKit streaming protocol', () => {
  it('addresses assistant text parts with content_index', () => {
    expect(createAssistantTextDeltaEvent('assistant-1', 'hello')).toEqual({
      type: 'thread.item.updated',
      item_id: 'assistant-1',
      update: {
        type: 'assistant_message.content_part.text_delta',
        content_index: 0,
        delta: 'hello',
      },
    })
  })
})
