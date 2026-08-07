import { describe, expect, it, vi } from 'vitest'
import { agentResource, contactResource } from '@undefineds.co/models'
import { createAgentContactRecords, ensureAgentContactRecords, writeCollectionRow } from './direct-chat-records'

describe('direct-chat-records', () => {
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
