import { describe, expect, it } from 'vitest'
import type { SolidDatabase } from '../src/repository'
import { createRepositoryDescriptor } from '../src/repository'
import {
  chatTable,
  type ChatInsert,
  type ChatRow,
  type ChatUpdate,
} from '../src/chat.schema'

class MockSelectBuilder<Row> {
  constructor(private readonly rows: Row[]) {}
  whereArgs: unknown[] = []
  orderArgs: unknown[] = []
  limitValue?: number

  where(arg: unknown) {
    this.whereArgs.push(arg)
    return this
  }

  orderBy(...args: unknown[]) {
    this.orderArgs.push(args)
    return this
  }

  limit(value: number) {
    this.limitValue = value
    return this
  }

  async execute() {
    return this.rows
  }
}

class MockMutationBuilder {
  whereArgs: unknown[] = []
  payload: unknown = null

  set(value: unknown) {
    this.payload = value
    return this
  }

  where(arg: unknown) {
    this.whereArgs.push(arg)
    return this
  }

  async execute() {
    return []
  }
}

class MockDatabase<Row> {
  constructor(private selectRows: Row[] = [], private insertRow?: Row) {}
  lastSelectQuery: MockSelectBuilder<Row> | null = null
  lastUpdateBuilder: MockMutationBuilder | null = null
  lastDeleteBuilder: MockMutationBuilder | null = null
  lastInsertInput: unknown = null

  setSelectRows(rows: Row[]) {
    this.selectRows = rows
  }

  select() {
    return {
      from: () => {
        const builder = new MockSelectBuilder<Row>(this.selectRows)
        this.lastSelectQuery = builder
        return builder
      },
    }
  }

  insert() {
    return {
      values: (input: ChatInsert) => {
        this.lastInsertInput = input
        return {
          execute: async () => [
            (this.insertRow ?? {
              ...(input as object),
              '@id': 'generated-id',
            }) as Row,
          ],
        }
      },
    }
  }

  update() {
    const builder = new MockMutationBuilder()
    this.lastUpdateBuilder = builder
    return {
      set: (value: ChatUpdate) => {
        builder.set(value)
        return builder
      },
    }
  }

  delete() {
    const builder = new MockMutationBuilder()
    this.lastDeleteBuilder = builder
    return builder
  }
}

const descriptor = createRepositoryDescriptor<
  typeof chatTable,
  ChatRow,
  ChatInsert,
  ChatUpdate
>({
  namespace: 'chat',
  table: chatTable,
  searchableFields: ['title', 'description'],
  defaultSort: { field: 'lastActiveAt', direction: 'desc' },
})

const baseChatRow = {
  '@id': 'chat-1',
  title: 'Sample Chat',
  description: 'Hello world',
  provider: 'openai',
  model: 'gpt-4o-mini',
  systemPrompt: 'Be helpful',
  starred: false,
  participants: ['https://pod.example/profile#me'],
  lastActiveAt: new Date('2024-01-01T00:00:00Z'),
  lastMessageId: 'message-1',
  lastMessagePreview: 'Hi',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
} satisfies ChatRow & { '@id': string }

describe('createRepositoryDescriptor', () => {
  it('applies search filters and sorting for list queries', async () => {
    const db = new MockDatabase<ChatRow>([baseChatRow])
    const rows = await descriptor.list(
      db as unknown as SolidDatabase,
      { search: 'Sample' },
    )

    expect(rows).toEqual([baseChatRow])
    expect(db.lastSelectQuery?.whereArgs.length).toBe(1)
    expect(db.lastSelectQuery?.orderArgs.length).toBe(1)
  })

  it('returns matching row for detail queries', async () => {
    const db = new MockDatabase<ChatRow>([baseChatRow])
    const row = await descriptor.detail(db as unknown as SolidDatabase, 'chat-1')

    expect(row).toEqual(baseChatRow)
    expect(db.lastSelectQuery?.limitValue).toBe(1)
  })

  it('creates rows via insert and returns the created object', async () => {
  const newRow = { ...baseChatRow, '@id': 'chat-99', title: 'New Chat' }
    const db = new MockDatabase<ChatRow>([], newRow as ChatRow)

    const created = await descriptor.create?.(
      db as unknown as SolidDatabase,
      {
        title: 'New Chat',
        description: 'demo',
        provider: 'openai',
        model: 'gpt-4-mini',
        systemPrompt: 'hello',
        starred: false,
        participants: ['https://pod.example/profile#me'],
        lastActiveAt: new Date('2024-01-02T00:00:00Z'),
        lastMessageId: 'message-2',
        lastMessagePreview: 'hello',
        createdAt: new Date('2024-01-02T00:00:00Z'),
        updatedAt: new Date('2024-01-02T00:00:00Z'),
      } satisfies ChatInsert,
    )

    expect(created).toEqual(newRow)
    expect(db.lastInsertInput).toMatchObject({ title: 'New Chat' })
  })

  it('updates and removes rows using @id filters', async () => {
    const updatedRow = { ...baseChatRow, title: 'Updated' }
    const db = new MockDatabase<ChatRow>([updatedRow])

    await descriptor.update?.(
      db as unknown as SolidDatabase,
      'chat-1',
      { title: 'Updated' } as ChatUpdate,
    )

    expect(db.lastUpdateBuilder?.whereArgs[0]).toEqual({ '@id': 'chat-1' })

    await descriptor.remove?.(db as unknown as SolidDatabase, 'chat-1')
    expect(db.lastDeleteBuilder?.whereArgs[0]).toEqual({ '@id': 'chat-1' })
  })
})
