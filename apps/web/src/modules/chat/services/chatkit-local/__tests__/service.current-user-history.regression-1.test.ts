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

  it('loads every Pod history page for the backend model request', async () => {
    const persistedItems = Array.from({ length: 205 }, (_, index) => ({
      id: `user-${index + 1}`,
      thread_id: 'thread-1',
      type: 'user_message',
      content: [{ type: 'input_text', text: `Prompt ${index + 1}` }],
      attachments: [],
      created_at: index + 1,
    }))
    const loadThreadItems = async (
      _threadId: string,
      after: string | undefined,
      limit: number,
    ) => {
      const start = after
        ? persistedItems.findIndex(item => item.id === after) + 1
        : 0
      const data = persistedItems.slice(start, start + limit)
      return {
        data,
        has_more: start + limit < persistedItems.length,
        last_id: data.at(-1)?.id,
      }
    }
    const service = new LocalChatKitService({
      store: { loadThreadItems } as any,
      db: db as any,
      webId: 'https://pod.example/profile/card#me',
      authFetch: fetch,
    })

    const messages = await (service as any).buildConversationHistory('thread-1', {})

    expect(messages).toHaveLength(206)
    expect(messages[1]).toEqual({ role: 'user', content: 'Prompt 1' })
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'Prompt 205' })
  })
})
