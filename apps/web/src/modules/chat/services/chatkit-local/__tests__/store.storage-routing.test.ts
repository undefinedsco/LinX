import { describe, expect, it, vi } from 'vitest'
import { LocalChatKitStore } from '../store'

describe('LocalChatKitStore storage routing', () => {
  it('stores message resource refs under the selected SP Pod, not the WebID origin', async () => {
    const inserts: Array<Record<string, unknown>> = []
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://node-0000.undefineds.co/alice/',
      }),
      findById: vi.fn(async () => null),
      insert: vi.fn(() => ({
        values(values: Record<string, unknown>) {
          inserts.push(values)
          return { execute: vi.fn(async () => undefined) }
        },
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          execute: vi.fn(async () => []),
        })),
      })),
    }
    const store = new LocalChatKitStore(
      db as any,
      'https://id.undefineds.co/alice/profile/card#me',
      vi.fn() as any,
    )

    await store.addThreadItem('thread-1', {
      id: 'msg-1',
      thread_id: 'thread-1',
      type: 'user_message',
      content: [{ type: 'input_text', text: 'hello' }],
      attachments: [],
      created_at: 0,
    } as any, {})

    const messageInsert = inserts.find((entry) => entry.id === 'msg-1')
    expect(messageInsert?.chat).toBe('https://node-0000.undefineds.co/alice/.data/chat/default/index.ttl#this')
    expect(messageInsert?.thread).toBe('https://node-0000.undefineds.co/alice/.data/chat/default/index.ttl#thread-1')
    expect(messageInsert?.maker).toBe('https://id.undefineds.co/alice/profile/card#me')
  })

  it('fails closed instead of deriving storage from a Cloud WebID when the selected SP Pod URL is missing', async () => {
    const db = {
      getDialect: () => ({
        getPodUrl: () => null,
      }),
      findById: vi.fn(async () => null),
      insert: vi.fn(() => ({
        values() {
          return { execute: vi.fn(async () => undefined) }
        },
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          execute: vi.fn(async () => []),
        })),
      })),
    }
    const store = new LocalChatKitStore(
      db as any,
      'https://id.undefineds.co/alice/profile/card#me',
      vi.fn() as any,
    )

    await expect(store.addThreadItem('thread-1', {
      id: 'msg-1',
      thread_id: 'thread-1',
      type: 'user_message',
      content: [{ type: 'input_text', text: 'hello' }],
      attachments: [],
      created_at: 0,
    } as any, {})).rejects.toThrow('Unable to resolve current Pod URL')
  })
})
