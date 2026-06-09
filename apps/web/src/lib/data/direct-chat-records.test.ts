import { describe, expect, it, vi } from 'vitest'
import { agentTable, contactTable } from '@undefineds.co/models'
import { createAgentContactRecords, ensureAgentContactRecords } from './direct-chat-records'

describe('direct-chat-records', () => {
  it('preserves canonical Agent resource ids when repository create returns a short id', async () => {
    const agentIri = 'https://pod.example/agents/__secretary__/profile/card#me'
    const contactIri = 'https://pod.example/.data/contacts/__secretary__'

    const db = {
      insert: vi.fn((resource: unknown) => ({
        values: (input: Record<string, unknown>) => ({
          execute: vi.fn(async () => {
            if (resource === agentTable) {
              return [{
                ...input,
                id: '__secretary__',
                '@id': agentIri,
              }]
            }
            if (resource === contactTable) {
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
        if (resource === agentTable) {
          expect(row.id).toBe('__secretary__/profile/card#me')
          return agentIri
        }
        if (resource === contactTable) {
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

    expect(result.agentId).toBe('__secretary__/profile/card#me')
    expect(result.agent.id).toBe('__secretary__/profile/card#me')
    expect(result.contactId).toBe('__secretary__')
    expect(result.contactUri).toBe(contactIri)
    expect(result.contact.entityUri).toBe(agentIri)
  })

  it('ensures an Agent contact by base-relative ids before chat bootstrap', async () => {
    const agentIri = 'https://pod.example/agents/__secretary__/profile/card#me'
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
        if (resource === agentTable) {
          expect(row.id).toBe('__secretary__/profile/card#me')
          return agentIri
        }
        if (resource === contactTable) {
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

    expect(findById).toHaveBeenNthCalledWith(1, agentTable, '__secretary__/profile/card#me')
    expect(findById).toHaveBeenNthCalledWith(2, contactTable, '__secretary__.ttl')
    expect(insertedRows.map(({ resource }) => resource)).toEqual([agentTable, contactTable])
    expect(insertedRows[0].row).toMatchObject({
      id: '__secretary__/profile/card#me',
      '@id': agentIri,
      name: 'AI Secretary',
    })
    expect(insertedRows[1].row).toMatchObject({
      id: '__secretary__',
      '@id': contactIri,
      entity: agentIri,
    })
    expect(result.agentId).toBe('__secretary__/profile/card#me')
    expect(result.contactId).toBe('__secretary__')
    expect(result.contactUri).toBe(contactIri)
    expect(result.contact.entityUri).toBe(agentIri)
  })
})
