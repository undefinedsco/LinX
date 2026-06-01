import { describe, expect, it, vi } from 'vitest'
import { Chat, Message, Thread, type ThreadItem, type ThreadMetadata } from '@/lib/vendor/xpod-chatkit'
import { LocalChatKitStore } from '../store'

type InsertRecord = {
  table: unknown
  values: Record<string, unknown>
}

function createMockDb() {
  const inserts: InsertRecord[] = []
  const rows = new Map<unknown, Array<Record<string, unknown>>>()

  function tableRows(table: unknown): Array<Record<string, unknown>> {
    const existing = rows.get(table)
    if (existing) return existing
    const next: Array<Record<string, unknown>> = []
    rows.set(table, next)
    return next
  }

  return {
    db: {
      insert(table: unknown) {
        return {
          values(values: Record<string, unknown>) {
            inserts.push({ table, values })
            tableRows(table).push(values)
            return {
              execute: vi.fn().mockResolvedValue([values]),
            }
          },
        }
      },
      findById(table: unknown, id: string) {
        return Promise.resolve(tableRows(table).find((row) => row.id === id) ?? null)
      },
      select() {
        return {
          from(table: unknown) {
            return {
              execute: vi.fn().mockResolvedValue([...tableRows(table)]),
            }
          },
        }
      },
    },
    inserts,
  }
}

const thread: ThreadMetadata = {
  id: 'thread-1',
  title: 'Thread title',
  status: { type: 'active' },
  created_at: 1,
  updated_at: 1,
  metadata: { chat_id: 'chat-1' },
}

const userItem: ThreadItem = {
  id: 'item-1',
  thread_id: 'thread-1',
  type: 'user_message',
  content: [{ type: 'input_text', text: 'hello' }],
  attachments: [],
  created_at: 1,
}

const updatedUserItem: ThreadItem = {
  ...userItem,
  content: [{ type: 'input_text', text: 'hello updated' }],
}

describe('LocalChatKitStore', () => {
  it('projects thread and message writes through shared sync results', async () => {
    const { db, inserts } = createMockDb()
    const authFetch = vi.fn(async () => new Response('', { status: 200 }))
    const onSyncResult = vi.fn()
    const store = new LocalChatKitStore(
      db as any,
      'https://alice.example/profile/card#me',
      authFetch as any,
      {
        now: () => new Date('2026-05-21T00:00:00.000Z'),
        onSyncResult,
      },
    )

    await store.saveThread(thread, {})
    await store.addThreadItem(thread.id, userItem, {})
    await store.saveItem(thread.id, updatedUserItem, {})

    expect(inserts.filter((item) => item.table === Chat)).toHaveLength(1)
    expect(inserts.filter((item) => item.table === Thread)).toHaveLength(1)
    expect(inserts.filter((item) => item.table === Message)).toHaveLength(1)
    expect(inserts.find((item) => item.table === Message)?.values).toMatchObject({
      id: 'chat/chat-1/1970/01/01/messages.ttl#item-1',
      chat: 'https://alice.example/.data/chat/chat-1/index.ttl#this',
      thread: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
      maker: 'https://alice.example/profile/card#me',
      role: 'user',
      content: 'hello',
    })
    expect(authFetch).toHaveBeenCalledWith(
      'https://alice.example/.data/chat/chat-1/1970/01/01/messages.ttl',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/sparql-update' },
      }),
    )
    expect(String(authFetch.mock.calls[0]?.[1]?.body)).toContain('hello updated')

    expect(store.getSyncResults()).toHaveLength(3)
    expect(onSyncResult).toHaveBeenCalledTimes(3)
    expect(store.getSyncResults().map((result) => result.source)).toEqual([
      'chatkit-local-store',
      'chatkit-local-store',
      'chatkit-local-store',
    ])
    expect(store.getSyncResults().map((result) => result.target)).toEqual(['pod', 'pod', 'pod'])
    expect(store.getSyncResults().map((result) => result.direction)).toEqual([
      'local-to-core',
      'local-to-core',
      'local-to-core',
    ])
    expect(store.getSyncResults().map((result) => result.plane)).toEqual([
      'projection',
      'projection',
      'projection',
    ])
    expect(store.getSyncResults().map((result) => result.authority)).toEqual(['core', 'core', 'core'])
    expect(store.getSyncResults().map((result) => result.status)).toEqual([
      'completed',
      'completed',
      'completed',
    ])
  })
})
