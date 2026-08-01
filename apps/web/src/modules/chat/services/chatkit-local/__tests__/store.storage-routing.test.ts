import { describe, expect, it, vi } from 'vitest'
import { LocalChatKitStore } from '../store'

describe('LocalChatKitStore storage routing', () => {
  it('resolves a short thread id only after it is explicitly bound to the current Chat', async () => {
    const findById = vi.fn(async (_resource: unknown, id?: string) => id === 'chat/__secretary__/index.ttl#__default__'
      ? {
          id,
          parent: 'http://localhost:5737/cuilinsu/.data/chat/__secretary__/index.ttl#this',
        }
      : null)
    const select = vi.fn()
    const db = {
      getDialect: () => ({ getPodUrl: () => 'http://localhost:5737/cuilinsu/' }),
      findById,
      select,
    }
    const store = new LocalChatKitStore(
      db as any,
      'http://localhost:5737/cuilinsu/profile/card#me',
      vi.fn() as any,
    )

    store.bindThreadToChat('__default__', '__secretary__')
    await expect(store.loadThread('__default__', {})).resolves.toMatchObject({
      id: '__default__',
      metadata: { chat_id: '__secretary__' },
    })
    expect(findById).toHaveBeenCalledWith(expect.anything(), 'chat/__secretary__/index.ttl#__default__')
    expect(select).not.toHaveBeenCalled()
  })

  it('fails closed for an unbound short thread id without scanning all Pods', async () => {
    const select = vi.fn()
    const db = {
      getDialect: () => ({ getPodUrl: () => 'http://localhost:5737/cuilinsu/' }),
      findById: vi.fn(async () => null),
      select,
    }
    const store = new LocalChatKitStore(
      db as any,
      'http://localhost:5737/cuilinsu/profile/card#me',
      vi.fn() as any,
    )

    await expect(store.loadThread('__default__', {})).rejects.toThrow('Thread not found')
    expect(select).not.toHaveBeenCalled()
  })

  it('scopes message loading to the required Chat parent before filtering the durable Thread', async () => {
    const durableId = 'chat/__secretary__/index.ttl#__default__'
    const where = vi.fn(() => ({ execute: vi.fn(async () => []) }))
    const from = vi.fn(() => ({ where }))
    const db = {
      getDialect: () => ({ getPodUrl: () => 'http://localhost:5737/cuilinsu/' }),
      findById: vi.fn(async () => ({
        id: durableId,
        parent: 'http://localhost:5737/cuilinsu/.data/chat/__secretary__/index.ttl#this',
      })),
      select: vi.fn(() => ({ from })),
    }
    const store = new LocalChatKitStore(
      db as any,
      'http://localhost:5737/cuilinsu/profile/card#me',
      vi.fn() as any,
    )

    await expect(store.loadThreadItems(durableId, undefined, 20, 'asc', {})).resolves.toEqual({
      data: [],
      has_more: false,
      after: undefined,
    })
    expect(where).toHaveBeenCalledTimes(1)
    const condition = where.mock.calls[0]?.[0]
    expect(condition).toMatchObject({ operator: '=' })
  })

  it('restores date-sharded messages from exact Thread membership links', async () => {
    const durableId = 'chat/default/index.ttl#__default__'
    const threadIri = 'http://localhost:5737/cuilinsu/.data/chat/default/index.ttl#__default__'
    const messageIri = 'http://localhost:5737/cuilinsu/.data/chat/default/2026/07/28/messages.ttl#message-1'
    const db = {
      getDialect: () => ({ getPodUrl: () => 'http://localhost:5737/cuilinsu/' }),
      findById: vi.fn(async () => ({
        id: durableId,
        parent: 'http://localhost:5737/cuilinsu/.data/chat/default/index.ttl#this',
      })),
      findByIri: vi.fn(async () => ({
        id: 'chat/default/2026/07/28/messages.ttl#message-1',
        role: 'user',
        content: 'persisted',
        createdAt: new Date('2026-07-28T17:00:05.000Z'),
      })),
      select: vi.fn(),
    }
    const authFetch = vi.fn(async (input: RequestInfo | URL) => new Response(
      String(input).includes('messages.ttl')
        ? `@prefix sioc: <http://rdfs.org/sioc/ns#>.
@prefix dct: <http://purl.org/dc/terms/>.
@prefix udfs: <https://undefineds.co/ns#>.
<${messageIri}> udfs:messageType "user";
  sioc:content "persisted";
  udfs:messageStatus "completed";
  dct:created "2026-07-28T17:00:05.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>.`
        : `@prefix sioc: <http://rdfs.org/sioc/ns#>.
<${threadIri}> sioc:has_member <${messageIri}>.`,
      { status: 200, headers: { 'Content-Type': 'text/turtle' } },
    ))
    const store = new LocalChatKitStore(
      db as any,
      'http://localhost:5737/cuilinsu/profile/card#me',
      authFetch as any,
    )

    await expect(store.loadThreadItems(durableId, undefined, 20, 'asc', {})).resolves.toMatchObject({
      data: [expect.objectContaining({
        type: 'user_message',
        content: [{ type: 'input_text', text: 'persisted' }],
      })],
    })
    expect(authFetch).toHaveBeenCalledWith(
      'http://localhost:5737/cuilinsu/.data/chat/default/index.ttl',
      expect.anything(),
    )
    expect(authFetch).toHaveBeenCalledWith(
      'http://localhost:5737/cuilinsu/.data/chat/default/2026/07/28/messages.ttl',
      expect.anything(),
    )
    expect(db.select).not.toHaveBeenCalled()
  })

  it('falls back to the scoped Message query when a legacy Thread index cannot be parsed', async () => {
    const durableId = 'chat/default/index.ttl#__default__'
    const execute = vi.fn(async () => [{
      id: 'chat/default/2026/07/28/messages.ttl#message-1',
      parent: 'http://localhost:5737/cuilinsu/.data/chat/default/index.ttl#this',
      role: 'assistant',
      content: 'recovered',
      createdAt: new Date('2026-07-28T17:00:06.000Z'),
    }])
    const where = vi.fn(() => ({ execute }))
    const db = {
      getDialect: () => ({ getPodUrl: () => 'http://localhost:5737/cuilinsu/' }),
      findById: vi.fn(async () => ({
        id: durableId,
        parent: 'http://localhost:5737/cuilinsu/.data/chat/default/index.ttl#this',
      })),
      findByIri: vi.fn(),
      select: vi.fn(() => ({ from: vi.fn(() => ({ where })) })),
    }
    const store = new LocalChatKitStore(
      db as any,
      'http://localhost:5737/cuilinsu/profile/card#me',
      vi.fn(async () => { throw new Error('legacy Turtle parse failure') }) as any,
    )

    await expect(store.loadThreadItems(durableId, undefined, 20, 'asc', {})).resolves.toMatchObject({
      data: [expect.objectContaining({
        type: 'assistant_message',
        content: [{ type: 'output_text', text: 'recovered', annotations: [] }],
      })],
    })
    expect(where).toHaveBeenCalled()
  })

  it('loads a durable thread id by exact record without scanning the Pod thread index', async () => {
    const durableId = 'chat/__secretary__/index.ttl#__default__'
    const where = vi.fn(() => ({ execute: vi.fn(async () => []) }))
    const select = vi.fn(() => ({ from: vi.fn(() => ({ where })) }))
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'http://localhost:5737/cuilinsu/',
      }),
      findById: vi.fn(async (_resource: unknown, id?: string) => id === durableId
        ? {
            id: durableId,
            title: '默认话题',
            status: 'active',
            createdAt: new Date('2026-07-20T00:00:00.000Z'),
            updatedAt: new Date('2026-07-20T00:00:00.000Z'),
          }
        : null),
      select,
    }
    const store = new LocalChatKitStore(
      db as any,
      'http://localhost:5737/cuilinsu/profile/card#me',
      vi.fn() as any,
    )

    await expect(store.loadThread(durableId, {})).resolves.toMatchObject({
      id: '__default__',
      title: '默认话题',
    })
    await expect(store.loadThreadItems('__default__', undefined, 20, 'asc', {})).resolves.toMatchObject({
      data: [],
    })
    expect(db.findById).toHaveBeenCalledWith(expect.anything(), durableId)
    expect(db.findById).toHaveBeenCalledTimes(1)
    expect(select).toHaveBeenCalledTimes(1)
    expect(where.mock.calls[0]?.[0]).toMatchObject({
      right: expect.stringContaining('__secretary__'),
    })
  })

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
    expect((messageInsert?.metadata as any)?.chatkitItemId).toBe('msg-1')
    expect((messageInsert?.metadata as any)?.reconciler?.latest?.eventType).toBe('message.appended')
    expect((messageInsert?.metadata as any)?.reconciler?.latest?.wakeJobs?.[0]?.targetRole).toBe('primary-agent')
  })

  it('archives user image attachments in richContent and restores them from Pod messages', async () => {
    const inserts: Array<Record<string, unknown>> = []
    const attachment = {
      id: 'attach-image-1',
      attachment_id: 'attach-image-1',
      name: 'screen.png',
      mime_type: 'image/png',
      data_url: 'data:image/png;base64,aW1hZ2U=',
      preview_url: 'data:image/png;base64,aW1hZ2U=',
    }
    const db = {
      getDialect: () => ({ getPodUrl: () => 'http://localhost:5737/cuilinsu/' }),
      findById: vi.fn(async (_resource: unknown, id: string) => id.includes('#thread-1')
        ? { id, parent: 'http://localhost:5737/cuilinsu/.data/chat/default/index.ttl#this' }
        : null),
      insert: vi.fn(() => ({
        values(values: Record<string, unknown>) {
          inserts.push(values)
          return { execute: vi.fn(async () => undefined) }
        },
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({ execute: vi.fn(async () => []) })),
      })),
    }
    const store = new LocalChatKitStore(
      db as any,
      'http://localhost:5737/cuilinsu/profile/card#me',
      vi.fn() as any,
    )
    store.bindThreadToChat('thread-1', 'default')

    await store.addThreadItem('thread-1', {
      id: 'user-message-1',
      thread_id: 'thread-1',
      type: 'user_message',
      content: [{ type: 'input_text', text: '看看这张图' }],
      attachments: [attachment],
      created_at: 0,
    } as any, {})

    const inserted = inserts.find((entry) => entry.role === 'user')
    expect(JSON.parse(String(inserted?.richContent))).toEqual({ attachments: [attachment] })

    const reloadedDb = {
      ...db,
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            execute: vi.fn(async () => [{
              id: 'chat/default/1970/01/01/messages.ttl#user-message-1',
              role: 'user',
              content: '看看这张图',
              richContent: inserted?.richContent,
              createdAt: new Date(0),
            }]),
          })),
        })),
      })),
    }
    const reloadedStore = new LocalChatKitStore(
      reloadedDb as any,
      'http://localhost:5737/cuilinsu/profile/card#me',
      vi.fn() as any,
    )
    reloadedStore.bindThreadToChat('thread-1', 'default')

    await expect(reloadedStore.loadThreadItems('thread-1', undefined, 20, 'asc', {}))
      .resolves.toMatchObject({
        data: [expect.objectContaining({ attachments: [attachment] })],
      })
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

  it('does not read a message back after creating its deterministic Pod resource', async () => {
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://node-0000.undefineds.co/alice/',
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
    } as any, {})).resolves.toBeUndefined()
    // A user message may read its Chat once to decide whether the default title
    // should be replaced. It must not read the newly inserted Message back.
    expect(db.findById).toHaveBeenCalledTimes(1)
    expect(db.findById).toHaveBeenCalledWith(expect.anything(), 'default/index.ttl#this')
  })

  it('patches a newly created message by its cached IRI without a read or broad SELECT', async () => {
    const execute = vi.fn(async () => undefined)
    const select = vi.fn(() => ({
      from: vi.fn(() => ({
        execute: vi.fn(async () => []),
      })),
    }))
    const authFetch = vi.fn(async () => new Response(null, { status: 205 }))
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://node-0000.undefineds.co/alice/',
      }),
      findById: vi.fn(async () => null),
      insert: vi.fn(() => ({
        values() {
          return { execute }
        },
      })),
      select,
    }
    const store = new LocalChatKitStore(
      db as any,
      'https://id.undefineds.co/alice/profile/card#me',
      authFetch as any,
    )
    const item = {
      id: 'msg-stream-1',
      thread_id: 'thread-1',
      type: 'user_message',
      content: [{ type: 'input_text', text: 'hello' }],
      attachments: [],
      created_at: 0,
    } as any

    await store.addThreadItem('thread-1', item, {})
    db.findById.mockClear()
    select.mockClear()
    await store.saveItem('thread-1', {
      ...item,
      content: [{ type: 'input_text', text: 'hello "updated"\n```ts\nconst ok = true\n```' }],
    }, {})

    expect(db.findById).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
    expect(authFetch).toHaveBeenCalledWith(
      'https://node-0000.undefineds.co/alice/.data/chat/default/1970/01/01/messages.ttl',
      expect.objectContaining({ method: 'PATCH' }),
    )
    const patchCall = authFetch.mock.calls.find((call) => call[1]?.method === 'PATCH')
    const patchBody = String(patchCall?.[1]?.body)
    expect(patchBody).toContain('hello \\"updated\\"\\n```ts\\nconst ok = true\\n```')
    expect(patchBody).not.toContain('"""')
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
            about: agentIri,
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
