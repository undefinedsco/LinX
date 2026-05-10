import { describe, expect, it, vi } from 'vitest'
import { createLinxSolidDatabase } from './linx-solid-database'

const drizzleMock = vi.fn()
const initializeLinxPodStorageMock = vi.fn()

vi.mock('@undefineds.co/drizzle-solid', () => ({
  configureSparqlEngine: vi.fn(),
  drizzle: (...args: unknown[]) => drizzleMock(...args),
}))

vi.mock('@undefineds.co/models', () => ({
  schema: { chat: 'schema' },
}))

vi.mock('./pod-storage-bootstrap', () => ({
  initializeLinxPodStorage: (...args: unknown[]) => initializeLinxPodStorageMock(...args),
}))

describe('createLinxSolidDatabase', () => {
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
    const runtime = { setPodUrl: vi.fn() }
    const dialect = {
      getPodUrl: vi.fn(() => 'https://id.example/alice/'),
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
