import { describe, expect, it } from 'vitest'
import { upsertStateRow, writeCollectionRow } from './direct-chat-records'

describe('direct-chat-records', () => {
  it('requires row.id or an explicit rowId for collection state writes', () => {
    const state = new Map<string, Record<string, unknown> & { id: string }>()

    // @ts-expect-error Collection rows must carry a base-relative row.id.
    expect(() => upsertStateRow(state, {
      '@id': 'https://alice.example/.data/agents/__secretary__/index.ttl#this',
      name: 'AI Secretary',
    })).toThrow('collection row is missing row.id.')

    upsertStateRow(state, {
      '@id': 'https://alice.example/.data/agents/__secretary__/index.ttl#this',
      id: '__secretary__/index.ttl#this',
      name: 'AI Secretary',
    })

    expect(state.get('__secretary__/index.ttl#this')).toMatchObject({
      id: '__secretary__/index.ttl#this',
      name: 'AI Secretary',
    })
  })

  it('refuses full RDF subject IRIs as collection row ids', () => {
    const state = new Map<string, Record<string, unknown> & { id: string }>()

    expect(() => upsertStateRow(state, {
      id: 'https://alice.example/.data/agents/__secretary__/index.ttl#this',
      name: 'AI Secretary',
    })).toThrow('base-relative resource id')

    const collection = {
      _state: {
        syncedData: new Map<string, Record<string, unknown> & { id: string }>(),
        syncedKeys: new Set<string>(),
      },
    }

    expect(() => writeCollectionRow(collection, {
      id: 'https://alice.example/.data/contacts/__secretary__.ttl',
      name: 'AI Secretary',
    })).toThrow('base-relative resource id')
  })

  it('requires row.id or an explicit rowId for TanStack collection writes', () => {
    const collection = {
      _state: {
        syncedData: new Map<string, Record<string, unknown> & { id: string }>(),
        syncedKeys: new Set<string>(),
      },
      state: new Map<string, Record<string, unknown> & { id: string }>(),
    }

    // @ts-expect-error Collection rows must carry a base-relative row.id.
    expect(() => writeCollectionRow(collection, {
      '@id': 'https://alice.example/.data/contacts/__secretary__.ttl',
      name: 'AI Secretary',
    })).toThrow('collection row is missing row.id.')

    writeCollectionRow(collection, {
      '@id': 'https://alice.example/.data/contacts/__secretary__.ttl',
      id: '__secretary__',
      name: 'AI Secretary',
    })

    expect(collection._state.syncedData.get('__secretary__')).toMatchObject({
      name: 'AI Secretary',
    })
  })
})
