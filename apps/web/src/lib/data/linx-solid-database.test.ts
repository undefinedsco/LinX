import { beforeEach, describe, expect, it, vi } from 'vitest'
import { solidProfileTable } from '@undefineds.co/models'
import { createLinxSolidDatabase } from './linx-solid-database'

const drizzleMock = vi.fn()
const initializeLinxPodStorageMock = vi.fn()

vi.mock('@undefineds.co/drizzle-solid', () => ({
  configureSparqlEngine: vi.fn(),
  drizzle: (...args: unknown[]) => drizzleMock(...args),
}))

vi.mock('@undefineds.co/models', () => ({
  solidProfileTable: { config: { base: 'idp:///profile/card' } },
  solidSchema: { chat: 'schema' },
}))

vi.mock('./pod-storage-bootstrap', () => ({
  initializeLinxPodStorage: (...args: unknown[]) => initializeLinxPodStorageMock(...args),
}))

describe('createLinxSolidDatabase', () => {
  beforeEach(() => {
    drizzleMock.mockReset()
    initializeLinxPodStorageMock.mockReset()
  })

  it('creates and initializes the database before returning it', async () => {
    const session = { info: { webId: 'https://id.example/alice#me' } }
    const db = { id: 'db' }
    drizzleMock.mockReturnValue(db)
    initializeLinxPodStorageMock.mockResolvedValue(undefined)

    await expect(createLinxSolidDatabase(session)).resolves.toBe(db)

    expect(drizzleMock).toHaveBeenCalledWith(session, {
      disableInteropDiscovery: true,
      podUrl: undefined,
      schema: { chat: 'schema' },
    })
    expect(initializeLinxPodStorageMock).toHaveBeenCalledWith(db)
  })

  it('passes an explicit Pod URL for split IdP/SP deployments', async () => {
    const session = { info: { webId: 'https://id.example/alice#me' } }
    const db = {
      id: 'db',
      getDialect: vi.fn(() => ({
        getPodUrl: () => 'https://pod.example.com/',
      })),
    }
    drizzleMock.mockReturnValue(db)
    initializeLinxPodStorageMock.mockResolvedValue(undefined)

    await createLinxSolidDatabase(session, { podUrl: 'https://pod.example.com' })

    expect(drizzleMock).toHaveBeenCalledWith(session, {
      disableInteropDiscovery: true,
      podUrl: 'https://pod.example.com/',
      schema: { chat: 'schema' },
    })
  })

  it('overrides the dialect runtime when drizzle-solid does not forward podUrl yet', async () => {
    let currentPodUrl = 'https://id.example/alice/'
    const runtime = {
      setPodUrl: vi.fn((podUrl: string) => {
        currentPodUrl = podUrl
      }),
    }
    const dialect = {
      getPodUrl: vi.fn(() => currentPodUrl),
      runtime,
      refreshBaseUrlFromRuntime: vi.fn(),
    }
    const db = {
      id: 'db',
      getDialect: vi.fn(() => dialect),
    }
    drizzleMock.mockReturnValue(db)
    initializeLinxPodStorageMock.mockResolvedValue(undefined)

    await createLinxSolidDatabase({}, { podUrl: 'https://pod.example.com' })

    expect(runtime.setPodUrl).toHaveBeenCalledWith('https://pod.example.com/')
    expect(dialect.refreshBaseUrlFromRuntime).toHaveBeenCalledTimes(1)
  })

  it('keeps split IdP/SP storage rooted at the explicit SP Pod URL', async () => {
    const runtime = { setPodUrl: vi.fn() }
    const dialect = {
      getPodUrl: vi.fn(() => 'https://id.undefineds.co/alice/'),
      runtime,
      refreshBaseUrlFromRuntime: vi.fn(() => {
        dialect.getPodUrl.mockReturnValue('https://node-0000.undefineds.co/alice/')
      }),
    }
    const db = {
      id: 'db',
      getDialect: vi.fn(() => dialect),
    }
    const session = {
      info: {
        webId: 'https://id.undefineds.co/alice/profile/card#me',
      },
    }
    drizzleMock.mockReturnValue(db)
    initializeLinxPodStorageMock.mockImplementation(async (instance) => {
      expect(instance.getDialect().getPodUrl()).toBe('https://node-0000.undefineds.co/alice/')
    })

    await createLinxSolidDatabase(session, { podUrl: 'https://node-0000.undefineds.co/alice/' })

    expect(drizzleMock).toHaveBeenCalledWith(session, expect.objectContaining({
      podUrl: 'https://node-0000.undefineds.co/alice/',
    }))
    expect(runtime.setPodUrl).toHaveBeenCalledWith('https://node-0000.undefineds.co/alice/')
  })

  it('guards the first business insert against stale Cloud-origin subjects', async () => {
    const execute = vi.fn(async () => [])
    const values = vi.fn(() => ({ execute }))
    const insert = vi.fn(() => ({ values }))
    const runtime = { setPodUrl: vi.fn() }
    const dialect = {
      getPodUrl: vi.fn(() => 'https://node-0000.undefineds.co/alice/'),
      runtime,
      refreshBaseUrlFromRuntime: vi.fn(),
    }
    const db = {
      id: 'db',
      getDialect: vi.fn(() => dialect),
      insert,
    }
    drizzleMock.mockReturnValue(db)
    initializeLinxPodStorageMock.mockResolvedValue(undefined)

    const instance = await createLinxSolidDatabase({}, { podUrl: 'https://node-0000.undefineds.co/alice/' })

    expect(() => {
      ;(instance as any).insert({}).values({
        id: 'https://id.undefineds.co/alice/.data/chat/cloud/index.ttl#this',
        title: 'Wrong space',
      })
    }).toThrow('outside the current SP')
    expect(values).not.toHaveBeenCalled()
  })

  it('guards direct business update/delete calls against stale Cloud-origin IRIs', async () => {
    const updateByIri = vi.fn(async () => undefined)
    const deleteByIri = vi.fn(async () => undefined)
    const updateById = vi.fn(async () => undefined)
    const deleteById = vi.fn(async () => undefined)
    const dialect = {
      getPodUrl: vi.fn(() => 'https://node-0000.undefineds.co/alice/'),
    }
    const db = {
      id: 'db',
      getDialect: vi.fn(() => dialect),
      updateByIri,
      deleteByIri,
      updateById,
      deleteById,
    }
    drizzleMock.mockReturnValue(db)
    initializeLinxPodStorageMock.mockResolvedValue(undefined)

    const instance = await createLinxSolidDatabase({}, { podUrl: 'https://node-0000.undefineds.co/alice/' })
    const cloudIri = 'https://id.undefineds.co/alice/.data/chat/default/index.ttl#this'
    const localIri = 'https://node-0000.undefineds.co/alice/.data/chat/default/index.ttl#this'

    await expect((instance as any).updateByIri({}, cloudIri, { title: 'Wrong space' }))
      .rejects.toThrow('outside the current SP')
    await expect((instance as any).deleteByIri({}, cloudIri))
      .rejects.toThrow('outside the current SP')
    await expect((instance as any).updateById({}, cloudIri, { title: 'Wrong space' }))
      .rejects.toThrow('outside the current SP')
    await expect((instance as any).deleteById({}, cloudIri))
      .rejects.toThrow('outside the current SP')

    await expect((instance as any).updateByIri({}, localIri, { title: 'Selected SP' }))
      .resolves.toBeUndefined()
    await expect((instance as any).deleteByIri({}, localIri))
      .resolves.toBeUndefined()
    await expect((instance as any).updateById({}, 'chat/default/index.ttl#this', { title: 'Selected SP' }))
      .resolves.toBeUndefined()
    await expect((instance as any).deleteById({}, 'chat/default/index.ttl#this'))
      .resolves.toBeUndefined()

    expect(updateByIri).toHaveBeenCalledTimes(1)
    expect(deleteByIri).toHaveBeenCalledTimes(1)
    expect(updateById).toHaveBeenCalledTimes(1)
    expect(deleteById).toHaveBeenCalledTimes(1)
  })

  it('guards direct business update payloads that repoint relations outside the current SP', async () => {
    const updateById = vi.fn(async () => undefined)
    const db = {
      id: 'db',
      getDialect: vi.fn(() => ({
        getPodUrl: vi.fn(() => 'https://node-0000.undefineds.co/alice/'),
      })),
      updateById,
    }
    drizzleMock.mockReturnValue(db)
    initializeLinxPodStorageMock.mockResolvedValue(undefined)

    const instance = await createLinxSolidDatabase({}, { podUrl: 'https://node-0000.undefineds.co/alice/' })

    await expect((instance as any).updateById({}, 'chat/default/index.ttl#this', {
      thread: 'https://id.undefineds.co/alice/.data/chat/default/index.ttl#thread-1',
    })).rejects.toThrow('outside the current SP')

    expect(updateById).not.toHaveBeenCalled()
  })

  it('allows IDP profile writes by WebID without treating the WebID origin as business storage', async () => {
    const updateByIri = vi.fn(async () => undefined)
    const insertValues = vi.fn(() => ({ execute: vi.fn(async () => []) }))
    const insert = vi.fn(() => ({ values: insertValues }))
    const db = {
      id: 'db',
      getDialect: vi.fn(() => ({
        getPodUrl: vi.fn(() => 'https://node-0000.undefineds.co/alice/'),
      })),
      insert,
      updateByIri,
    }
    drizzleMock.mockReturnValue(db)
    initializeLinxPodStorageMock.mockResolvedValue(undefined)

    const instance = await createLinxSolidDatabase({}, { podUrl: 'https://node-0000.undefineds.co/alice/' })
    const webId = 'https://id.undefineds.co/alice/profile/card#me'

    expect(() => (instance as any).insert(solidProfileTable).values({
      id: webId,
      name: 'Alice',
    })).not.toThrow()
    await expect((instance as any).updateByIri(solidProfileTable, webId, { name: 'Alice' }))
      .resolves.toBeUndefined()

    expect(insertValues).toHaveBeenCalledWith({ id: webId, name: 'Alice' })
    expect(updateByIri).toHaveBeenCalledWith(solidProfileTable, webId, { name: 'Alice' })
  })

  it('fails closed when an explicit SP Pod URL cannot be applied to the dialect runtime', async () => {
    const dialect = {
      getPodUrl: vi.fn(() => 'https://id.undefineds.co/alice/'),
    }
    const db = {
      id: 'db',
      getDialect: vi.fn(() => dialect),
    }
    drizzleMock.mockReturnValue(db)
    initializeLinxPodStorageMock.mockResolvedValue(undefined)

    await expect(
      createLinxSolidDatabase({}, { podUrl: 'https://node-0000.undefineds.co/alice/' }),
    ).rejects.toThrow('Selected SP Pod URL was not applied before Pod initialization')

    expect(initializeLinxPodStorageMock).not.toHaveBeenCalled()
  })

  it('fails closed if Pod initialization mutates the database back to the WebID origin', async () => {
    const runtime = { setPodUrl: vi.fn() }
    const dialect = {
      getPodUrl: vi.fn(() => 'https://node-0000.undefineds.co/alice/'),
      runtime,
      refreshBaseUrlFromRuntime: vi.fn(),
    }
    const db = {
      id: 'db',
      getDialect: vi.fn(() => dialect),
    }
    drizzleMock.mockReturnValue(db)
    initializeLinxPodStorageMock.mockImplementation(async () => {
      dialect.getPodUrl.mockReturnValue('https://id.undefineds.co/alice/')
    })

    await expect(
      createLinxSolidDatabase({}, { podUrl: 'https://node-0000.undefineds.co/alice/' }),
    ).rejects.toThrow('Selected SP Pod URL was not applied after Pod initialization')
  })

  it('does not return a half-created database when initialization times out', async () => {
    const db = { id: 'db' }
    drizzleMock.mockReturnValue(db)
    initializeLinxPodStorageMock.mockReturnValue(new Promise(() => {}))

    vi.useFakeTimers()
    const pending = createLinxSolidDatabase({}, { initTimeoutMs: 10 })
    const assertion = expect(pending).rejects.toThrow('Pod init timed out')

    await vi.advanceTimersByTimeAsync(10)

    await assertion
    vi.useRealTimers()
  })
})
