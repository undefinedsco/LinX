import { describe, expect, it, vi } from 'vitest'
import { deleteExactRecord, findExactRecord, updateExactRecord } from './exact-records'

const table = { config: { name: 'test' } }

describe('exact record helpers', () => {
  it('updates by resource when the database has no updateById method', async () => {
    const updateByResource = vi.fn().mockResolvedValue(null)

    await updateExactRecord(
      { updateByResource } as any,
      table as any,
      { id: 'default/index.ttl#this', title: 'AI Secretary' },
      {
        title: 'AI Secretary',
        id: 'ignored',
        subject: 'ignored',
        source: 'ignored',
        updatedAt: new Date('2026-05-21T00:00:00.000Z'),
        skipped: undefined,
      },
    )

    expect(updateByResource).toHaveBeenCalledWith(
      table,
      { id: 'default/index.ttl#this', title: 'AI Secretary' },
      {
        title: 'AI Secretary',
        updatedAt: new Date('2026-05-21T00:00:00.000Z'),
      },
    )
  })

  it('falls back to locator update before legacy id update', async () => {
    const updateByLocator = vi.fn().mockResolvedValue(null)
    const updateById = vi.fn().mockResolvedValue(null)

    await updateExactRecord(
      { updateByLocator, updateById } as any,
      table as any,
      'default/index.ttl#this',
      { title: 'AI Secretary' },
    )

    expect(updateByLocator).toHaveBeenCalledWith(
      table,
      { id: 'default/index.ttl#this' },
      { title: 'AI Secretary' },
    )
    expect(updateById).not.toHaveBeenCalled()
  })

  it('uses IRI-specific APIs for absolute IRI targets', async () => {
    const iri = 'https://pod.example/.data/chat/default/index.ttl#this'
    const findByIri = vi.fn().mockResolvedValue({ id: 'default/index.ttl#this' })
    const deleteByIri = vi.fn().mockResolvedValue(true)

    await expect(findExactRecord({ findByIri } as any, table as any, iri))
      .resolves.toEqual({ id: 'default/index.ttl#this' })
    await deleteExactRecord({ deleteByIri } as any, table as any, iri)

    expect(findByIri).toHaveBeenCalledWith(table, iri)
    expect(deleteByIri).toHaveBeenCalledWith(table, iri)
  })
})
