import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createPodCollection: vi.fn(() => ({})),
  rebindPodCollections: vi.fn(async () => undefined),
  cancelQueries: vi.fn(async () => undefined),
}))

vi.mock('@/lib/data/pod-collection', () => ({
  createPodCollection: mocks.createPodCollection,
}))

vi.mock('@/lib/data/pod-collection-rebind', () => ({
  rebindPodCollections: mocks.rebindPodCollections,
}))

vi.mock('@/providers/query-provider', () => ({
  queryClient: { cancelQueries: mocks.cancelQueries },
}))

describe('model service collection database binding', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.createPodCollection.mockImplementation(() => ({}))
    mocks.rebindPodCollections.mockResolvedValue(undefined)
  })

  it('rebinds once per database identity and tears down on null', async () => {
    const { initializeModelCollections } = await import('./collections')
    const first = { id: 'first' }
    const second = { id: 'second' }

    await initializeModelCollections(first as never)
    await initializeModelCollections(first as never)
    await initializeModelCollections(second as never)
    await initializeModelCollections(null)

    expect(mocks.rebindPodCollections).toHaveBeenCalledTimes(3)
    expect(mocks.rebindPodCollections.mock.calls.map((call) => call[1])).toEqual([
      true,
      true,
      false,
    ])
  })

  it('allows the same database to retry after a failed rebind', async () => {
    const { initializeModelCollections } = await import('./collections')
    const database = { id: 'retry' }
    mocks.rebindPodCollections.mockRejectedValueOnce(new Error('rebind failed'))

    await expect(initializeModelCollections(database as never)).rejects.toThrow('rebind failed')
    await expect(initializeModelCollections(database as never)).resolves.toBeUndefined()

    expect(mocks.rebindPodCollections).toHaveBeenCalledTimes(2)
  })
})
