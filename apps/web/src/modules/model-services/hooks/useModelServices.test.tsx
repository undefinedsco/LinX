import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => {
  const credentialRows: Record<string, unknown>[] = []
  const providerRows: Record<string, unknown>[] = []
  const modelRows: Record<string, unknown>[] = []

  function persistedTx() {
    return { isPersisted: { promise: Promise.resolve() } }
  }

  return {
    credentialRows,
    providerRows,
    modelRows,
    liveQueryCall: 0,
    credentialInsert: vi.fn().mockReturnValue(persistedTx()),
    credentialUpdate: vi.fn().mockReturnValue(persistedTx()),
    providerInsert: vi.fn().mockReturnValue(persistedTx()),
    providerUpdate: vi.fn().mockReturnValue(persistedTx()),
    modelInsert: vi.fn().mockReturnValue(persistedTx()),
    modelUpdate: vi.fn().mockReturnValue(persistedTx()),
    modelDelete: vi.fn().mockReturnValue(persistedTx()),
    startSyncImmediate: vi.fn(),
    reset() {
      credentialRows.length = 0
      providerRows.length = 0
      modelRows.length = 0
      this.liveQueryCall = 0
      this.credentialInsert.mockClear()
      this.credentialUpdate.mockClear()
      this.providerInsert.mockClear()
      this.providerUpdate.mockClear()
      this.modelInsert.mockClear()
      this.modelUpdate.mockClear()
      this.modelDelete.mockClear()
      this.startSyncImmediate.mockClear()
    },
  }
})

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: vi.fn(() => {
    const rows = [
      mocked.credentialRows.map((c) => ({ c })),
      mocked.providerRows.map((p) => ({ p })),
      mocked.modelRows.map((m) => ({ m })),
    ][mocked.liveQueryCall++ % 3]
    return { data: rows }
  }),
}))

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => ({ db: {} }),
}))

vi.mock('../collections', () => ({
  credentialCollection: {
    startSyncImmediate: mocked.startSyncImmediate,
    insert: mocked.credentialInsert,
    update: mocked.credentialUpdate,
  },
  providerCollection: {
    startSyncImmediate: mocked.startSyncImmediate,
    insert: mocked.providerInsert,
    update: mocked.providerUpdate,
  },
  modelCollection: {
    startSyncImmediate: mocked.startSyncImmediate,
    insert: mocked.modelInsert,
    update: mocked.modelUpdate,
    delete: mocked.modelDelete,
  },
}))

import {
  clearModelServicesSyncResults,
  getModelServicesSyncResults,
  useModelServices,
} from './useModelServices'

describe('useModelServices sync modeling', () => {
  beforeEach(() => {
    mocked.reset()
    clearModelServicesSyncResults()
  })

  it('models provider updates as app-to-Pod control-plane sync without leaking api keys', async () => {
    const { result } = renderHook(() => useModelServices())

    await act(async () => {
      await result.current.updateProvider('openai', {
        enabled: true,
        apiKey: 'sk-secret',
        baseUrl: 'https://api.openai.com/v1',
        models: [
          { id: 'gpt-4o', name: 'GPT-4o', enabled: true, capabilities: [] },
        ],
      })
    })

    expect(mocked.providerInsert).toHaveBeenCalledTimes(1)
    expect(mocked.credentialInsert).toHaveBeenCalledTimes(1)
    expect(mocked.modelInsert).toHaveBeenCalledTimes(1)

    expect(getModelServicesSyncResults()).toHaveLength(1)
    expect(getModelServicesSyncResults()[0]).toMatchObject({
      source: 'app-model-services',
      target: 'pod',
      direction: 'local-to-core',
      plane: 'control-plane',
      authority: 'core',
      status: 'completed',
      metadata: {
        action: 'provider.update',
        resourceBindings: {
          provider: {
            uri: '/settings/providers/openai.ttl',
            local: 'openai',
          },
          model: {
            uri: '/settings/providers/openai.ttl#gpt-4o',
            local: 'gpt-4o',
          },
        },
        providerPayload: true,
        credentialPayload: true,
        modelUpsertCount: 1,
        modelDeleteCount: 0,
        updateKeys: ['enabled', 'baseUrl', 'models'],
        modelIds: ['gpt-4o'],
      },
    })
    expect(JSON.stringify(getModelServicesSyncResults()[0].metadata)).not.toContain('sk-secret')
    expect(JSON.stringify(getModelServicesSyncResults()[0].metadata)).not.toContain('apiKey')
  })
})
