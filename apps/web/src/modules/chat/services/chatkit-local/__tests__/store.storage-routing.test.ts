import { describe, expect, it, vi } from 'vitest'
import { Parser } from 'sparqljs'
import { LocalChatKitStore } from '../store'

describe('LocalChatKitStore storage routing', () => {
  it('persists feedback without moving the conversation activity timestamp', async () => {
    const storedItem = {
      id: 'assistant-1',
      thread_id: 'thread-1',
      type: 'assistant_message',
      content: [{ type: 'output_text', text: 'answer', annotations: [] }],
      status: 'completed',
      created_at: 1,
    }
    const messageRow = {
      id: 'chat/default/1970/01/01/messages.ttl#assistant-1',
      chat: 'https://node-0000.undefineds.co/alice/.data/chat/default/index.ttl#this',
      thread: 'https://node-0000.undefineds.co/alice/.data/index.ttl#thread-1',
      role: 'assistant',
      content: 'answer',
      richContent: JSON.stringify(storedItem),
      metadata: { chatkitItemId: 'assistant-1' },
      status: 'completed',
      createdAt: '1970-01-01T00:00:01.000Z',
    }
    const authFetch = vi.fn(async () => new Response(null, { status: 205 }))
    const onChatSummaryChange = vi.fn()
    const db = {
      getDialect: () => ({ getPodUrl: () => 'https://node-0000.undefineds.co/alice/' }),
      resolveRowIri: vi.fn((_resource: unknown, row: { id: string }) => (
        new URL(`.data/${row.id}`, 'https://node-0000.undefineds.co/alice/').toString()
      )),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          execute: vi.fn(async () => [messageRow]),
        })),
      })),
    }
    const store = new LocalChatKitStore(
      db as any,
      'https://id.undefineds.co/alice/profile/card#me',
      authFetch as any,
      {
        id: 'thread-1',
        title: 'Thread',
        status: { type: 'active' },
        created_at: 1,
        updated_at: 1,
        metadata: { chat_id: 'default' },
      },
      undefined,
      onChatSummaryChange,
    )

    await store.loadThreadItems('thread-1', undefined, 20, 'asc', {})
    await store.saveItem('thread-1', { ...storedItem, feedback: 'positive' } as any, {})

    expect(authFetch).toHaveBeenCalledWith(
      expect.stringContaining('messages.ttl'),
      expect.objectContaining({ method: 'PATCH' }),
    )
    expect(onChatSummaryChange).not.toHaveBeenCalled()
  })

  it('preserves the required status when editing a user message', async () => {
    const storedItem = {
      id: 'user-1',
      thread_id: 'thread-1',
      type: 'user_message',
      content: [{ type: 'input_text', text: 'original' }],
      created_at: 1,
    }
    const messageRow = {
      id: 'chat/default/1970/01/01/messages.ttl#user-1',
      chat: 'https://node-0000.undefineds.co/alice/.data/chat/default/index.ttl#this',
      thread: 'https://node-0000.undefineds.co/alice/.data/index.ttl#thread-1',
      role: 'user',
      content: 'original',
      richContent: JSON.stringify(storedItem),
      metadata: { chatkitItemId: 'user-1' },
      status: 'completed',
      createdAt: '1970-01-01T00:00:01.000Z',
    }
    const authFetch = vi.fn(async () => new Response(null, { status: 205 }))
    const db = {
      getDialect: () => ({ getPodUrl: () => 'https://node-0000.undefineds.co/alice/' }),
      resolveRowIri: vi.fn((_resource: unknown, row: { id: string }) => (
        new URL(`.data/${row.id}`, 'https://node-0000.undefineds.co/alice/').toString()
      )),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          execute: vi.fn(async () => [messageRow]),
        })),
      })),
    }
    const store = new LocalChatKitStore(
      db as any,
      'https://id.undefineds.co/alice/profile/card#me',
      authFetch as any,
      {
        id: 'thread-1',
        title: 'Thread',
        status: { type: 'active' },
        created_at: 1,
        updated_at: 1,
        metadata: { chat_id: 'default' },
      },
    )

    await store.loadThreadItems('thread-1', undefined, 20, 'asc', {})
    await store.saveItem('thread-1', {
      ...storedItem,
      content: [{ type: 'input_text', text: 'edited' }],
    } as any, {})

    const patch = String((authFetch.mock.calls[0]?.[1] as RequestInit).body)
    expect(() => new Parser().parse(patch)).not.toThrow()
    expect(patch).not.toContain('messageStatus')
  })

  it('writes Markdown formulas and code as valid SPARQL string literals', async () => {
    const originalItem = {
      id: 'assistant-markdown',
      thread_id: 'thread-1',
      type: 'assistant_message',
      content: [{ type: 'output_text', text: 'streaming', annotations: [] }],
      status: 'in_progress',
      created_at: 1,
    }
    const messageRow = {
      id: 'chat/default/1970/01/01/messages.ttl#assistant-markdown',
      chat: 'https://node-0000.undefineds.co/alice/.data/chat/default/index.ttl#this',
      thread: 'https://node-0000.undefineds.co/alice/.data/index.ttl#thread-1',
      role: 'assistant',
      content: 'streaming',
      richContent: JSON.stringify(originalItem),
      metadata: { chatkitItemId: 'assistant-markdown' },
      status: 'in_progress',
      createdAt: '1970-01-01T00:00:01.000Z',
    }
    const authFetch = vi.fn(async () => new Response(null, { status: 205 }))
    const db = {
      getDialect: () => ({ getPodUrl: () => 'https://node-0000.undefineds.co/alice/' }),
      resolveRowIri: vi.fn((_resource: unknown, row: { id: string }) => (
        new URL(`.data/${row.id}`, 'https://node-0000.undefineds.co/alice/').toString()
      )),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          execute: vi.fn(async () => [messageRow]),
        })),
      })),
    }
    const store = new LocalChatKitStore(
      db as any,
      'https://id.undefineds.co/alice/profile/card#me',
      authFetch as any,
      {
        id: 'thread-1',
        title: 'Thread',
        status: { type: 'active' },
        created_at: 1,
        updated_at: 1,
        metadata: { chat_id: 'default' },
      },
    )
    const markdown = [
      '## 扩展验收',
      String.raw`$$\int_0^1 x^2 dx = \frac{1}{3}$$`,
      '```ts',
      String.raw`const windowsPath = "C:\temp\report.md"`,
      'const triple = `"""`',
      '```',
    ].join('\n')

    await store.loadThreadItems('thread-1', undefined, 20, 'asc', {})
    await store.saveItem('thread-1', {
      ...originalItem,
      content: [{ type: 'output_text', text: markdown, annotations: [] }],
      status: 'completed',
    } as any, {})

    const patch = String((authFetch.mock.calls[0]?.[1] as RequestInit).body)
    expect(() => new Parser().parse(patch)).not.toThrow()
    expect(patch).toContain('\\\\int_0^1')
    expect(patch).toContain('C:\\\\temp\\\\report.md')
    expect(patch).toContain('\\n')
  })

  it('finds a historical item by richContent when shared RDF metadata is stale', async () => {
    const storedItem = {
      id: 'assistant-history',
      thread_id: 'thread-1',
      type: 'assistant_message',
      content: [{ type: 'output_text', text: 'history', annotations: [] }],
      status: 'completed',
      created_at: 1,
      feedback: 'positive',
    }
    const db = {
      getDialect: () => ({ getPodUrl: () => 'https://node-0000.undefineds.co/alice/' }),
      findById: vi.fn(async () => null),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          execute: vi.fn(async () => [{
            id: 'chat/default/1970/01/01/messages.ttl#row-1',
            chat: 'https://node-0000.undefineds.co/alice/.data/chat/default/index.ttl#this',
            thread: 'https://node-0000.undefineds.co/alice/.data/index.ttl#thread-1',
            role: 'assistant',
            content: 'history',
            richContent: JSON.stringify(storedItem),
            metadata: { chatkitItemId: 'another-item' },
            status: 'completed',
            createdAt: '1970-01-01T00:00:01.000Z',
          }]),
        })),
      })),
    }
    const store = new LocalChatKitStore(
      db as any,
      'https://id.undefineds.co/alice/profile/card#me',
      vi.fn() as any,
    )

    await expect(store.loadItem('thread-1', 'assistant-history', {})).resolves.toMatchObject(storedItem)
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
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
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
      inference_options: { tool_choice: { id: 'web_search' }, model: 'linx-lite' },
      created_at: 0,
    } as any, {})

    const messageInsert = inserts.find((entry) => (
      typeof entry.id === 'string'
      && entry.id.endsWith('/messages.ttl#msg-1')
    ))
    expect(messageInsert?.id).toBe('chat/default/1970/01/01/messages.ttl#msg-1')
    expect(messageInsert?.chat).toBe('https://node-0000.undefineds.co/alice/.data/chat/default/index.ttl#this')
    expect(messageInsert?.thread).toMatch(/^https:\/\/node-0000\.undefineds\.co\/alice\/\.data\/.*#thread-1$/)
    expect(messageInsert?.maker).toBe('https://id.undefineds.co/alice/profile/card#me')
    expect((messageInsert?.metadata as any)?.chatkitItemId).toBe('msg-1')
    expect((messageInsert?.metadata as any)?.reconciler?.latest?.eventType).toBe('message.appended')
    expect((messageInsert?.metadata as any)?.reconciler?.latest?.wakeJobs?.[0]?.targetRole).toBe('primary-agent')
    expect(JSON.parse(String(messageInsert?.richContent))).toMatchObject({
      inference_options: { tool_choice: { id: 'web_search' }, model: 'linx-lite' },
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
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
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
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
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
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
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

  it('stores completed client tool calls as richContent with ChatKit replay data and file artifacts', async () => {
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
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
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
      id: 'tool-1',
      thread_id: 'thread-1',
      type: 'client_tool_call',
      name: 'write_file',
      arguments: { path: 'summary.md' },
      call_id: 'call-1',
      status: 'completed',
      output: JSON.stringify({
        artifacts: [{
          type: 'artifact',
          name: 'summary.md',
          resourceUri: 'https://node-0000.undefineds.co/alice/.data/workspaces/thread-1/summary.md',
          contentType: 'text/markdown',
          size: 128,
        }],
      }),
      created_at: 0,
    } as any, {})

    const messageInsert = inserts.find((entry) => entry.id === 'chat/default/1970/01/01/messages.ttl#tool-1')
    expect(messageInsert?.content).toBe('write_file')
    const richContent = JSON.parse(String(messageInsert?.richContent))
    expect(richContent.chatkitItem).toMatchObject({
      type: 'client_tool_call',
      call_id: 'call-1',
      output: expect.stringContaining('summary.md'),
    })
    expect(richContent.items).toEqual([
      expect.objectContaining({
        type: 'tool',
        toolName: 'write_file',
        toolCallId: 'call-1',
        status: 'done',
        result: {
          artifacts: [expect.objectContaining({
            resourceUri: 'https://node-0000.undefineds.co/alice/.data/workspaces/thread-1/summary.md',
            contentType: 'text/markdown',
          })],
        },
      }),
    ])
  })

  it('persists assistant citation annotations for history replay after refresh', async () => {
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
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
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
      id: 'assistant-with-source',
      thread_id: 'thread-1',
      type: 'assistant_message',
      content: [{
        type: 'output_text',
        text: '有来源的回答',
        annotations: [{
          index: 6,
          source: {
            type: 'url',
            url: 'https://example.com/report',
            title: 'Example report',
          },
        }],
      }],
      attachments: [],
      status: 'completed',
      created_at: 0,
    } as any, {})

    const messageInsert = inserts.find((entry) => (
      typeof entry.id === 'string'
      && entry.id.endsWith('/messages.ttl#assistant-with-source')
    ))
    expect(JSON.parse(String(messageInsert?.richContent))).toMatchObject({
      content: [{
        type: 'output_text',
        annotations: [{
          index: 6,
          source: {
            type: 'url',
            url: 'https://example.com/report',
          },
        }],
      }],
    })
  })

  it('replays Markdown and fenced code without rewriting ChatKit content', async () => {
    const markdown = [
      '## Result',
      '',
      '| name | value |',
      '| --- | ---: |',
      '| answer | 42 |',
      '',
      '```ts',
      'const answer: number = 42',
      '```',
      '',
      '$$E = mc^2$$',
    ].join('\n')
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
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          execute: vi.fn(async () => [{
            id: 'chat/default/2026/08/09/messages.ttl#markdown-1',
            chat: 'https://node-0000.undefineds.co/alice/.data/chat/default/index.ttl#this',
            thread: 'https://node-0000.undefineds.co/alice/.data/index.ttl#thread-1',
            role: 'assistant',
            content: markdown,
            richContent: null,
            metadata: { chatkitItemId: 'markdown-1' },
            status: 'completed',
            createdAt: '2026-08-09T00:00:00.000Z',
          }]),
        })),
      })),
    }
    const store = new LocalChatKitStore(
      db as any,
      'https://id.undefineds.co/alice/profile/card#me',
      vi.fn() as any,
    )

    const result = await store.loadThreadItems('thread-1', undefined, 20, 'asc', {})

    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'markdown-1',
        type: 'assistant_message',
        content: [{ type: 'output_text', text: markdown, annotations: [] }],
      }),
    ])
  })

  it('replays client tool calls from richContent envelopes', async () => {
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
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          execute: vi.fn(async () => [{
            id: 'chat/default/1970/01/01/messages.ttl#tool-1',
            chat: 'https://node-0000.undefineds.co/alice/.data/chat/default/index.ttl#this',
            thread: 'https://node-0000.undefineds.co/alice/.data/index.ttl#thread-1',
            role: 'system',
            content: 'write_file',
            richContent: JSON.stringify({
              chatkitItem: {
                id: 'tool-1',
                thread_id: 'thread-1',
                type: 'client_tool_call',
                name: 'write_file',
                arguments: { path: 'summary.md' },
                call_id: 'call-1',
                status: 'completed',
                output: '{"artifacts":[]}',
                created_at: 0,
              },
              items: [{
                type: 'tool',
                toolName: 'write_file',
                result: { artifacts: [] },
              }],
            }),
            createdAt: '1970-01-01T00:00:00.000Z',
          }]),
        })),
      })),
    }
    const store = new LocalChatKitStore(
      db as any,
      'https://id.undefineds.co/alice/profile/card#me',
      vi.fn() as any,
    )

    const result = await store.loadThreadItems('thread-1', undefined, 20, 'asc', {})

    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'tool-1',
        type: 'client_tool_call',
        call_id: 'call-1',
        output: '{"artifacts":[]}',
      }),
    ])
  })
})
