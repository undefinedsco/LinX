import { describe, expect, it } from 'vitest'
import {
  createMessageDeleteConfirmation,
  createMessageQuoteDraft,
  projectActionableMessages,
  selectActionableMessage,
} from './message-actions'

describe('message actions', () => {
  it('projects a chronological action list with role-specific capabilities', () => {
    const messages = projectActionableMessages(
      [{ id: 'user-1', role: 'user', content: 'Question', createdAt: '2026-01-01T00:00:00Z' }],
      [{ id: 'assistant-1', content: 'Answer', createdAt: '2026-01-01T00:00:01Z' }],
    )

    expect(messages.map((message) => message.id)).toEqual(['user-1', 'assistant-1'])
    expect(messages[0]).toMatchObject({ canEdit: true, canRegenerate: true })
    expect(messages[1]).toMatchObject({ canEdit: false, canRegenerate: false })
  })

  it('falls back to the latest message when selection is absent or stale', () => {
    const messages = projectActionableMessages(
      [{ id: 'user-1', role: 'user', content: 'Question' }],
      [{ id: 'assistant-1', content: 'Answer' }],
    )
    expect(selectActionableMessage(messages, 'missing')?.id).toBe('assistant-1')
    expect(selectActionableMessage(messages, null)?.id).toBe('assistant-1')
  })

  it('creates quote and destructive confirmation copy from the selected role', () => {
    const assistant = projectActionableMessages([], [{ id: 'assistant-1', content: 'Answer' }])[0]!
    expect(createMessageQuoteDraft(assistant)).toBe('> Answer\n\n')
    expect(createMessageDeleteConfirmation(assistant)).toContain('助手消息')
  })
})
