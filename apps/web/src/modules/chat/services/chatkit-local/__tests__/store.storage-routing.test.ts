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

    const messageInsert = inserts.find((entry) => (
      typeof entry.id === 'string'
      && entry.id.endsWith('/messages.ttl#msg-1')
    ))
    expect(messageInsert?.id).toBe('chat/default/1970/01/01/messages.ttl#msg-1')
    expect(messageInsert?.chat).toBe('https://node-0000.undefineds.co/alice/.data/chat/default/index.ttl#this')
    expect(messageInsert?.thread).toBe('https://node-0000.undefineds.co/alice/.data/chat/default/index.ttl#thread-1')
    expect(messageInsert?.maker).toBe('https://id.undefineds.co/alice/profile/card#me')
    expect(messageInsert?.metadata).toEqual({ chatkitItemId: 'msg-1' })
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

  it('does not hide message lookup failures after creating a Pod message row', async () => {
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://node-0000.undefineds.co/alice/',
      }),
      findById: vi.fn(async () => {
        throw new Error('findById failed')
      }),
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
    } as any, {})).rejects.toThrow('findById failed')
  })

  it('resolves assistant maker from a contact IRI with findByIri instead of deriving a row id', async () => {
    const inserts: Array<Record<string, unknown>> = []
    const contactIri = 'https://node-0000.undefineds.co/alice/.data/contacts/contact-1.ttl'
    const agentIri = 'https://node-0000.undefineds.co/alice/agents/agent-1/'
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://node-0000.undefineds.co/alice/',
      }),
      findById: vi.fn(async (_resource: unknown, id?: string) => {
        if (id === 'default/index.ttl#this') {
          return {
            id: 'default/index.ttl#this',
            participants: [contactIri],
          }
        }
        return null
      }),
      findByIri: vi.fn(async (_resource: unknown, iri?: string) => {
        if (iri === contactIri) {
          return {
            id: 'contact-1',
            entityUri: agentIri,
          }
        }
        return null
      }),
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
      id: 'msg-2',
      thread_id: 'thread-1',
      type: 'assistant_message',
      content: [{ type: 'output_text', text: 'hello' }],
      status: 'completed',
      created_at: 0,
    } as any, {})

    expect(db.findByIri).toHaveBeenCalledWith(expect.anything(), contactIri)
    expect(db.findById).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining('https://'))
    expect(inserts[0]?.maker).toBe(agentIri)
  })
})
