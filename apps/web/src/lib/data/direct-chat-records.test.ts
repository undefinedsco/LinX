import { describe, expect, it, vi } from 'vitest'
import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { QueryClient } from '@tanstack/react-query'
import { agentResource, contactResource } from '@undefineds.co/models'
import {
  createAgentContactRecords,
  createGroupContactRecord,
  createSolidContactRecord,
  ensureAgentContactRecords,
  writeCollectionRow,
} from './direct-chat-records'

describe('direct-chat-records', () => {
  it('notifies live subscribers when publishing a persisted thread', async () => {
    const client = new QueryClient()
    const collection = createCollection(queryCollectionOptions({
      queryKey: ['persisted-thread-notification'],
      queryClient: client,
      queryFn: async (): Promise<Array<{ id: string; title: string }>> => [],
      getKey: (row) => row.id,
    }))
    await collection.preload()
    const changes: string[] = []
    const subscription = collection.subscribeChanges((events) => {
      changes.push(...events.map((event) => event.type))
    })
    try {
      writeCollectionRow(collection, { id: 'default', title: 'Default topic' })
      expect(collection.get('default')?.title).toBe('Default topic')
      expect(changes).toContain('insert')
      changes.length = 0
      writeCollectionRow(collection, { id: 'default', title: 'Updated topic' })
      expect(changes).toContain('update')
    } finally {
      subscription.unsubscribe()
      await collection.cleanup()
      client.clear()
    }
  })
  it('publishes a persisted row to both public and internal collection state', () => {
    const row = { id: 'chat-1', title: 'Visible immediately' }
    const state = { data: [] as typeof row[] }
    const syncedData = new Map<string, typeof row>()
    const collection = {
      state,
      _state: { syncedData, syncedKeys: new Set<string>(), size: 0 },
    }

    writeCollectionRow(collection, row)

    expect(state.data).toEqual([row])
    expect(syncedData.get('chat-1')).toEqual(row)
    expect(collection._state.syncedKeys.has('chat-1')).toBe(true)
    expect(collection._state.size).toBe(1)
  })

  it('preserves canonical Agent Home ids while creating the Contact record', async () => {
    const agentIri = 'https://pod.example/agents/__secretary__/'
    const contactIri = 'https://pod.example/.data/contacts/__secretary__'

    const db = {
      insert: vi.fn((resource: unknown) => ({
        values: (input: Record<string, unknown>) => ({
          execute: vi.fn(async () => {
            if (resource === contactResource) {
              return [{
                ...input,
                id: '__secretary__',
                '@id': contactIri,
              }]
            }
            return [{ ...input }]
          }),
        }),
      })),
      resolveRowIri: vi.fn((resource: unknown, row: Record<string, unknown>) => {
        if (resource === agentResource) {
          expect(row.id).toBe('__secretary__/')
          return agentIri
        }
        if (resource === contactResource) {
          return contactIri
        }
        return null
      }),
    }

    const result = await createAgentContactRecords(db as any, {
      agentId: '__secretary__',
      contactId: '__secretary__',
      name: 'AI Secretary',
      provider: 'undefineds',
      model: 'undefineds/linx-lite',
    })

    expect(result.agentId).toBe('__secretary__/')
    expect(result.agent.id).toBe('__secretary__/')
    expect(result.contactId).toBe('__secretary__')
    expect(result.contactUri).toBe(contactIri)
    expect(result.contact.about).toBe(agentIri)
  })

  // Regression for the RC62 own-assistant selection failure. The created
  // contact row was returned with the BARE input key as `id` while the
  // collection rehydrated the same row under the repository's canonical
  // `<key>.ttl` id. ContactList compares `selectedId === contact.id` and keys
  // rows with `getKey: item => item.id`, so the bare selectedId matched zero
  // rows and the detail pane stayed on its loading branch.
  //
  // These cases use a real TanStack collection whose queryFn independently
  // returns the persisted canonical row, then verify the id handed to
  // selection actually resolves through collection.get().
  const COLLECTION_CASES = [
    {
      name: 'agent contact',
      key: '9f1c2a44-1111-2222-3333-444455556666',
      create: (db: any, contactId: string, agentId: string) => createAgentContactRecords(db, {
        agentId,
        contactId,
        name: '助手 alpha',
        provider: 'openai',
        model: 'gpt-4o-mini',
      }),
    },
    {
      name: 'Solid friend contact',
      key: '11112222-3333-4444-5555-666677778888',
      create: (db: any) => createSolidContactRecord(db, {
        name: 'Alice',
        webId: 'https://alice.example/profile/card#me',
      }),
    },
    {
      name: 'group contact',
      key: 'aaaabbbb-cccc-dddd-eeee-ffff00001111',
      create: (db: any) => createGroupContactRecord(db, {
        name: '共享群聊',
        about: 'https://pod.example/groups/team',
      }),
    },
  ] as const

  it.each(COLLECTION_CASES)(
    'returns the canonical persisted id for a $name so selection resolves in the collection',
    async ({ key, create }) => {
      const agentKey = `${key}-agent`
      const canonicalId = `${key}.ttl`
      const agentIri = `https://pod.example/agents/${agentKey}/`
      const contactIri = `https://pod.example/.data/contacts/${canonicalId}`

      const db = {
        insert: vi.fn(() => ({
          values: (input: Record<string, unknown>) => ({
            // The repository resolves the row id from the row IRI instead of
            // echoing the bare key it was handed.
            execute: vi.fn(async () => [{
              success: true,
              source: contactIri,
              input,
            }]),
          }),
        })),
        resolveRowIri: vi.fn((resource: unknown) => {
          if (resource === agentResource) return agentIri
          if (resource === contactResource) return contactIri
          return null
        }),
        resolveRowId: vi.fn((resource: unknown) => {
          if (resource === contactResource) return canonicalId
          if (resource === agentResource) return `${agentKey}/`
          return key
        }),
      }

      const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue(key)
      let result: Awaited<ReturnType<typeof create>>
      try {
        result = await create(db, key, agentKey)
      } finally {
        uuid.mockRestore()
      }

      // The row the product receives must carry the canonical persisted id.
      expect(result.contact.id).toBe(canonicalId)
      expect(result.contactId).toBe(canonicalId)

      // A real collection whose source of truth is the persisted row.
      const client = new QueryClient()
      const collection = createCollection(queryCollectionOptions({
        queryKey: ['canonical-contact-id', key],
        queryClient: client,
        queryFn: async (): Promise<Array<{ id: string; name: string }>> => ([
          { id: canonicalId, name: 'Persisted contact' },
        ]),
        getKey: (row) => row.id,
      }))
      try {
        await collection.preload()
        // Selection uses result.contactId; it must find the rehydrated row.
        expect(collection.get(result.contactId)).toBeDefined()
        expect(collection.get(result.contactId)?.id).toBe(canonicalId)
        // The bare key must NOT resolve, which is exactly the old defect.
        expect(collection.get(key)).toBeUndefined()
      } finally {
        await collection.cleanup()
        client.clear()
      }
    },
  )

  it('ensures an Agent contact by base-relative ids before chat bootstrap', async () => {
    const agentIri = 'https://pod.example/agents/__secretary__/'
    const contactIri = 'https://pod.example/.data/contacts/__secretary__.ttl'
    const insertedRows: Array<{ resource: unknown; row: Record<string, unknown> }> = []
    const findById = vi.fn(async () => null)
    const db = {
      findById,
      insert: vi.fn((resource: unknown) => ({
        values: (input: Record<string, unknown>) => ({
          execute: vi.fn(async () => {
            insertedRows.push({ resource, row: input })
            return [{ ...input }]
          }),
        }),
      })),
      resolveRowIri: vi.fn((resource: unknown, row: Record<string, unknown>) => {
        if (resource === agentResource) {
          expect(row.id).toBe('__secretary__/')
          return agentIri
        }
        if (resource === contactResource) {
          expect(row.id).toBe('__secretary__.ttl')
          return contactIri
        }
        return null
      }),
    }

    const result = await ensureAgentContactRecords(db as any, {
      agentId: '__secretary__',
      contactId: '__secretary__',
      contactResourceId: '__secretary__.ttl',
      name: 'AI Secretary',
      provider: 'undefineds',
      model: 'undefineds/linx-lite',
    })

    expect(findById).toHaveBeenCalledTimes(1)
    expect(findById).toHaveBeenNthCalledWith(1, contactResource, '__secretary__.ttl')
    expect(insertedRows.map(({ resource }) => resource)).toEqual([contactResource])
    expect(insertedRows[0].row).toMatchObject({
      id: '__secretary__',
      '@id': contactIri,
      about: agentIri,
    })
    expect(result.agentId).toBe('__secretary__/')
    expect(result.contactId).toBe('__secretary__')
    expect(result.contactUri).toBe(contactIri)
    expect(result.contact.about).toBe(agentIri)
  })
})
