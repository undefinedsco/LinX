import { describe, expect, it } from 'vitest'
import { LocalChatKitService } from '../service'

describe('LocalChatKitService current-turn conversation history', () => {
  const db = { getDialect: () => ({ getPodUrl: () => 'https://pod.example/' }) }

  it('includes the accepted user item when the Pod index has not returned it yet', async () => {
    // Regression: ISSUE-CHAT-001 — provider request omitted the current user prompt
    // Found by /qa on 2026-07-21
    // Report: .gstack/qa-reports/qa-report-chat-local-2026-07-21.md
    const store = {
      loadThreadItems: async () => ({
        data: [{
          id: 'assistant-existing',
          type: 'assistant_message',
          content: [{ type: 'output_text', text: 'Earlier reply' }],
        }],
      }),
    }
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'https://pod.example/profile/card#me',
      authFetch: fetch,
    })
    const currentUserMessage = {
      id: 'user-current',
      thread_id: 'thread-1',
      type: 'user_message',
      content: [{ type: 'input_text', text: 'Current prompt' }],
      attachments: [],
      created_at: 1,
    }

    const messages = await (service as any).buildConversationHistory(
      'thread-1',
      {},
      currentUserMessage,
    )

    expect(messages).toEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'assistant', content: 'Earlier reply' },
      { role: 'user', content: 'Current prompt' },
    ])
  })

  it('does not duplicate the current item once the Pod index returns it', async () => {
    const currentUserMessage = {
      id: 'user-current',
      thread_id: 'thread-1',
      type: 'user_message',
      content: [{ type: 'input_text', text: 'Current prompt' }],
      attachments: [],
      created_at: 1,
    }
    const store = { loadThreadItems: async () => ({ data: [currentUserMessage] }) }
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'https://pod.example/profile/card#me',
      authFetch: fetch,
    })

    const messages = await (service as any).buildConversationHistory(
      'thread-1',
      {},
      currentUserMessage,
    )

    expect(messages.filter((message: any) => message.role === 'user')).toEqual([
      { role: 'user', content: 'Current prompt' },
    ])
  })
})
