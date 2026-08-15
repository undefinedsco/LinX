import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown> & { id: string }

const mocks = vi.hoisted(() => ({
  useLiveQuery: vi.fn(),
  providerRows: new Map<string, Row>(),
  credentialRows: new Map<string, Row>(),
  modelRows: new Map<string, Row>(),
  providerInsert: vi.fn(),
  providerUpdate: vi.fn(),
  providerDelete: vi.fn(),
  credentialInsert: vi.fn(),
  credentialUpdate: vi.fn(),
  credentialDelete: vi.fn(),
  modelInsert: vi.fn(),
  modelUpdate: vi.fn(),
  modelDelete: vi.fn(),
  providerStartSync: vi.fn(),
  credentialStartSync: vi.fn(),
  modelStartSync: vi.fn(),
}))

function persistedTx() {
  return { isPersisted: { promise: Promise.resolve() } }
}

function configureCollection(
  rows: Map<string, Row>,
  insert: ReturnType<typeof vi.fn>,
  update: ReturnType<typeof vi.fn>,
  remove: ReturnType<typeof vi.fn>,
) {
  insert.mockImplementation((row: Row) => {
    rows.set(row.id, { ...row })
    return persistedTx()
  })
  update.mockImplementation((id: string, mutate: (draft: Row) => void) => {
    const current = rows.get(id)
    if (!current) throw new Error(`Missing row: ${id}`)
    const next = { ...current }
    mutate(next)
    rows.set(id, next)
    return persistedTx()
  })
  remove.mockImplementation((id: string) => {
    rows.delete(id)
    return persistedTx()
  })
}

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: mocks.useLiveQuery,
}))

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => ({ db: {} }),
}))

vi.mock('./collections', () => ({
  providerCollection: {
    startSyncImmediate: mocks.providerStartSync,
    insert: mocks.providerInsert,
    update: mocks.providerUpdate,
    delete: mocks.providerDelete,
  },
  credentialCollection: {
    startSyncImmediate: mocks.credentialStartSync,
    insert: mocks.credentialInsert,
    update: mocks.credentialUpdate,
    delete: mocks.credentialDelete,
  },
  modelCollection: {
    startSyncImmediate: mocks.modelStartSync,
    insert: mocks.modelInsert,
    update: mocks.modelUpdate,
    delete: mocks.modelDelete,
  },
}))

import { useModelServices } from './use-model-services'

describe('useModelServices data persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.providerRows.clear()
    mocks.credentialRows.clear()
    mocks.modelRows.clear()

    configureCollection(
      mocks.providerRows,
      mocks.providerInsert,
      mocks.providerUpdate,
      mocks.providerDelete,
    )
    configureCollection(
      mocks.credentialRows,
      mocks.credentialInsert,
      mocks.credentialUpdate,
      mocks.credentialDelete,
    )
    configureCollection(
      mocks.modelRows,
      mocks.modelInsert,
      mocks.modelUpdate,
      mocks.modelDelete,
    )

    mocks.useLiveQuery
      .mockReturnValueOnce({ data: [], isError: false })
      .mockReturnValueOnce({ data: [], isError: false })
      .mockReturnValueOnce({ data: [], isError: false })
  })

  it('delegates initial hydration to useLiveQuery without manual collection starts', () => {
    renderHook(() => useModelServices())

    expect(mocks.useLiveQuery).toHaveBeenCalledTimes(3)
    expect(mocks.providerStartSync).not.toHaveBeenCalled()
    expect(mocks.credentialStartSync).not.toHaveBeenCalled()
    expect(mocks.modelStartSync).not.toHaveBeenCalled()
  })

  it('keeps Pod-defined custom providers visible to consumers', () => {
    mocks.useLiveQuery.mockReset()
    mocks.useLiveQuery
      .mockReturnValueOnce({
        data: [{ c: { id: 'timecc-default.ttl', provider: '/settings/providers/timecc.ttl', apiKey: 'secret' } }],
        isError: false,
      })
      .mockReturnValueOnce({
        data: [{ p: { id: 'timecc.ttl', displayName: 'TimeCC', baseUrl: 'https://example.test/v1' } }],
        isError: false,
      })
      .mockReturnValueOnce({
        data: [{ m: { id: 'timecc.ttl#gpt-test', displayName: 'GPT Test', isProvidedBy: '/settings/providers/timecc.ttl' } }],
        isError: false,
      })

    const { result } = renderHook(() => useModelServices())

    expect(result.current.providers.timecc).toMatchObject({
      id: 'timecc',
      name: 'TimeCC',
      baseUrl: 'https://example.test/v1',
    })
    expect(result.current.providers.timecc.models).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'gpt-test', name: 'GPT Test' }),
    ]))
  })

  it('accepts flat rows returned by the live collection runtime', () => {
    mocks.useLiveQuery.mockReset()
    mocks.useLiveQuery
      .mockReturnValueOnce({
        data: [{ id: 'timecc-default', provider: '/settings/providers/timecc.ttl', apiKey: 'secret' }],
        isError: false,
      })
      .mockReturnValueOnce({
        data: [{ id: 'timecc.ttl', displayName: 'TimeCC', baseUrl: 'https://example.test/v1' }],
        isError: false,
      })
      .mockReturnValueOnce({
        data: [{ id: 'timecc.ttl#gpt-test', displayName: 'GPT Test', isProvidedBy: '/settings/providers/timecc.ttl' }],
        isError: false,
      })

    const { result } = renderHook(() => useModelServices())

    expect(result.current.providers.timecc).toMatchObject({
      id: 'timecc',
      name: 'TimeCC',
      enabled: true,
    })
    expect(result.current.providers.timecc.models).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'gpt-test', name: 'GPT Test' }),
    ]))
  })

  it('persists explicit provider runtime capabilities in the provider resource', async () => {
    const { result } = renderHook(() => useModelServices())

    await act(async () => {
      await result.current.updateProvider('openai', {
        capabilities: ['chat_completions', 'responses', 'responses_web_search'],
      })
    })

    expect([...mocks.providerRows.values()]).toEqual([
      expect.objectContaining({
        capabilities: ['chat_completions', 'responses', 'responses_web_search'],
      }),
    ])
  })

  it('enables Responses when Web Search is enabled', async () => {
    const { result } = renderHook(() => useModelServices())

    await act(async () => {
      await result.current.updateProviderCapability(
        'openai',
        'responses_web_search',
        true,
        ['chat_completions'],
      )
    })

    expect([...mocks.providerRows.values()]).toEqual([
      expect.objectContaining({
        capabilities: ['chat_completions', 'responses_web_search', 'responses'],
      }),
    ])
  })

  it('merges serialized capability mutations against the latest persisted row', async () => {
    const providerRow = {
      id: 'timecc.ttl',
      displayName: 'TimeCC',
      capabilities: ['responses'],
    }
    mocks.providerRows.set(providerRow.id, providerRow)
    mocks.useLiveQuery.mockReset()
    mocks.useLiveQuery
      .mockReturnValueOnce({ data: [], isError: false })
      .mockReturnValueOnce({ data: [{ p: providerRow }], isError: false })
      .mockReturnValueOnce({ data: [], isError: false })
    const { result } = renderHook(() => useModelServices())

    await act(async () => {
      await Promise.all([
        result.current.updateProviderCapability('timecc', 'image_input', true),
        result.current.updateProviderCapability('timecc', 'tool_calls', true),
      ])
    })

    expect(mocks.providerRows.get('timecc.ttl')?.capabilities).toEqual([
      'responses',
      'image_input',
      'tool_calls',
    ])
  })

  it('updates an existing Pod model when its row id includes the provider path', async () => {
    const providerRow = {
      id: '/settings/providers/timecc.ttl',
      displayName: 'TimeCC',
      baseUrl: 'https://example.test/v1',
    }
    const modelRow = {
      id: '/settings/providers/timecc.ttl#linx-lite',
      displayName: 'LinX Lite',
      isProvidedBy: '/settings/providers/timecc.ttl',
      status: 'active',
      capabilities: [],
      createdAt: new Date('2026-08-16T00:00:00.000Z'),
      updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    }
    mocks.providerRows.set(providerRow.id, providerRow)
    mocks.modelRows.set(modelRow.id, modelRow)
    mocks.useLiveQuery.mockReset()
    mocks.useLiveQuery
      .mockReturnValueOnce({ data: [], isError: false })
      .mockReturnValueOnce({ data: [{ p: providerRow }], isError: false })
      .mockReturnValueOnce({ data: [{ m: modelRow }], isError: false })

    const { result } = renderHook(() => useModelServices())

    await act(async () => {
      await result.current.updateProvider('timecc', {
        models: [{
          id: 'linx-lite',
          name: 'LinX Lite',
          enabled: true,
          capabilities: ['vision'],
        }],
      })
    })

    expect(mocks.modelUpdate).toHaveBeenCalledWith(
      modelRow.id,
      expect.any(Function),
    )
    expect(mocks.modelRows.get(modelRow.id)?.rdfType).toEqual([
      'https://undefineds.co/ns#AIModel',
      'https://undefineds.co/ns#ChatModel',
    ])
    expect(mocks.modelInsert).not.toHaveBeenCalled()
  })

  it('restores earlier provider and credential writes when later model persistence fails', async () => {
    const persistenceError = new Error('model persistence failed')
    mocks.modelInsert.mockImplementation((row: Row) => {
      mocks.modelRows.set(row.id, { ...row })
      return {
        isPersisted: {
          promise: Promise.reject(persistenceError).catch((error) => {
            mocks.modelRows.delete(row.id)
            throw error
          }),
        },
      }
    })

    const { result } = renderHook(() => useModelServices())

    let surfacedError: unknown
    await act(async () => {
      try {
        await result.current.updateProvider('openai', {
          apiKey: 'sk-new',
          baseUrl: 'https://api.example.test/v1',
          models: [{
            id: 'test-model',
            name: 'Test Model',
            enabled: true,
            capabilities: [],
          }],
        })
      } catch (error) {
        surfacedError = error
      }
    })

    expect(surfacedError).toBe(persistenceError)
    expect(mocks.providerRows).toEqual(new Map())
    expect(mocks.credentialRows).toEqual(new Map())
    expect(mocks.modelRows).toEqual(new Map())
    expect(mocks.providerDelete).toHaveBeenCalledOnce()
    expect(mocks.credentialDelete).toHaveBeenCalledOnce()
  })
})
