import { beforeEach, describe, expect, it } from 'vitest'
import {
  enqueueChatGeneration,
  listChatGenerationOutbox,
  markChatGenerationAttempt,
  removeChatGeneration,
} from '../generation-outbox'

describe('chat generation outbox', () => {
  beforeEach(() => localStorage.clear())

  it('persists, deduplicates and removes deferred generations per account', () => {
    const first = enqueueChatGeneration({
      accountScope: 'alice',
      threadId: 'thread-1',
      userItemId: 'user-1',
      inferenceOptions: { model: 'test-model' },
    })
    const duplicate = enqueueChatGeneration({
      accountScope: 'alice',
      threadId: 'thread-1',
      userItemId: 'user-1',
    })
    enqueueChatGeneration({
      accountScope: 'bob',
      threadId: 'thread-1',
      userItemId: 'user-1',
    })

    expect(duplicate.id).toBe(first.id)
    expect(listChatGenerationOutbox('alice')).toEqual([expect.objectContaining({
      threadId: 'thread-1',
      userItemId: 'user-1',
      inferenceOptions: { model: 'test-model' },
    })])
    expect(listChatGenerationOutbox('bob')).toHaveLength(1)

    expect(markChatGenerationAttempt('alice', first.id)?.attempts).toBe(1)
    removeChatGeneration('alice', first.id)
    expect(listChatGenerationOutbox('alice')).toEqual([])
  })

  it('scopes pending generations to the selected thread', () => {
    enqueueChatGeneration({ accountScope: 'alice', threadId: 'thread-1', userItemId: 'user-1' })
    enqueueChatGeneration({ accountScope: 'alice', threadId: 'thread-2', userItemId: 'user-2' })

    expect(listChatGenerationOutbox('alice', 'thread-1')).toEqual([
      expect.objectContaining({ threadId: 'thread-1', userItemId: 'user-1' }),
    ])
    expect(listChatGenerationOutbox('alice', 'new-thread')).toEqual([])
  })
})
