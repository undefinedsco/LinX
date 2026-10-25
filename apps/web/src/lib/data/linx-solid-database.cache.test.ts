import { beforeEach, describe, expect, it, vi } from 'vitest'

const drizzleMock = vi.fn()
const initializeLinxPodStorageMock = vi.fn()

vi.mock('@undefineds.co/drizzle-solid', () => ({
  configureSparqlEngine: vi.fn(),
  drizzle: (...args: unknown[]) => drizzleMock(...args),
}))

vi.mock('@undefineds.co/models', () => ({
  solidProfileResource: { config: { base: 'idp:///profile/card' } },
  solidSchema: { chat: 'schema' },
}))

vi.mock('./pod-storage-bootstrap', () => ({
  initializeLinxPodStorage: (...args: unknown[]) => initializeLinxPodStorageMock(...args),
}))

import { createLinxSolidDatabase } from './linx-solid-database'

const SESSION = { info: { webId: 'https://ids.example/bob/profile/card#me', sessionId: 's-bob' }, fetch: vi.fn() }
const OWNER = 'https://pods.example/alice/'
const ROOM_A = 'https://pods.example/alice/.data/chat/room-a/'
const ROOM_B = 'https://pods.example/alice/.data/chat/room-b/'

function fakeDb(id: string) {
  return {
    id,
    getDialect: () => ({ getPodUrl: () => OWNER, config: {} }),
    subscribe: vi.fn(),
  }
}

beforeEach(() => {
  drizzleMock.mockReset()
  initializeLinxPodStorageMock.mockReset().mockResolvedValue(undefined)
})

describe('createLinxSolidDatabase in-flight binding', () => {
  it('does not coalesce two rooms of the same owner/session into one DB', async () => {
    let releaseA: (() => void) | null = null
    const gateA = new Promise<void>((resolve) => { releaseA = resolve })
    const dbs = [fakeDb('room-a'), fakeDb('room-b')]
    drizzleMock
      .mockImplementationOnce(() => dbs[0])
      .mockImplementationOnce(() => dbs[1])
    initializeLinxPodStorageMock
      .mockImplementationOnce(async () => { await gateA })
      .mockResolvedValueOnce(undefined)

    const a = createLinxSolidDatabase(SESSION, {
      podUrl: OWNER,
      sparqlEndpoint: `${ROOM_A}-/sparql`,
      resourcePreparation: 'off',
    })
    const b = createLinxSolidDatabase(SESSION, {
      podUrl: OWNER,
      sparqlEndpoint: `${ROOM_B}-/sparql`,
      resourcePreparation: 'off',
    })
    expect(drizzleMock).toHaveBeenCalledTimes(2)
    releaseA!()
    const [dbA, dbB] = await Promise.all([a, b])
    expect(dbA).not.toBe(dbB)
    expect((dbA as any).id).toBe('room-a')
    expect((dbB as any).id).toBe('room-b')
  })

  it('still dedups an identical binding', async () => {
    let release: (() => void) | null = null
    const gate = new Promise<void>((resolve) => { release = resolve })
    drizzleMock.mockReturnValue(fakeDb('only'))
    initializeLinxPodStorageMock.mockImplementationOnce(async () => { await gate })

    const options = { podUrl: OWNER, sparqlEndpoint: `${ROOM_A}-/sparql`, resourcePreparation: 'off' as const }
    const first = createLinxSolidDatabase(SESSION, options)
    const second = createLinxSolidDatabase(SESSION, options)
    expect(drizzleMock).toHaveBeenCalledTimes(1)
    release!()
    expect(await first).toBe(await second)
  })

  it('separates room DB from a broad bootstrap with the same root', async () => {
    let release: (() => void) | null = null
    const gate = new Promise<void>((resolve) => { release = resolve })
    drizzleMock.mockImplementationOnce(() => fakeDb('broad')).mockImplementationOnce(() => fakeDb('room'))
    initializeLinxPodStorageMock.mockImplementationOnce(async () => { await gate }).mockResolvedValue(undefined)

    const broad = createLinxSolidDatabase(SESSION, { podUrl: OWNER })
    const room = createLinxSolidDatabase(SESSION, {
      podUrl: OWNER, sparqlEndpoint: `${ROOM_A}-/sparql`, resourcePreparation: 'off',
    })
    expect(drizzleMock).toHaveBeenCalledTimes(2)
    release!()
    const [broadDb, roomDb] = await Promise.all([broad, room])
    expect(broadDb).not.toBe(roomDb)
    // Room DB must never trigger the broad Pod bootstrap.
    expect(initializeLinxPodStorageMock).toHaveBeenCalledTimes(1)
  })

  it('separates different transport rewrites on the same root', async () => {
    drizzleMock.mockImplementation((_s: unknown, config: any) => fakeDb(config.podUrl))
    initializeLinxPodStorageMock.mockResolvedValue(undefined)
    await Promise.all([
      createLinxSolidDatabase(SESSION, { podUrl: OWNER, transportUrlRewrite: { fromBaseUrl: 'https://api.a/', toBaseUrl: 'http://localhost:1/' } }),
      createLinxSolidDatabase(SESSION, { podUrl: OWNER, transportUrlRewrite: { fromBaseUrl: 'https://api.b/', toBaseUrl: 'http://localhost:2/' } }),
    ])
    expect(drizzleMock).toHaveBeenCalledTimes(2)
  })

  it('keeps separate bindings after the in-flight entry clears', async () => {
    drizzleMock.mockImplementation((_s: unknown, config: any) => fakeDb(config.sparqlEndpoint ?? 'broad'))
    initializeLinxPodStorageMock.mockResolvedValue(undefined)
    const a1 = await createLinxSolidDatabase(SESSION, { podUrl: OWNER, sparqlEndpoint: `${ROOM_A}-/sparql`, resourcePreparation: 'off' })
    const b1 = await createLinxSolidDatabase(SESSION, { podUrl: OWNER, sparqlEndpoint: `${ROOM_B}-/sparql`, resourcePreparation: 'off' })
    expect((a1 as any).id).toBe(`${ROOM_A}-/sparql`)
    expect((b1 as any).id).toBe(`${ROOM_B}-/sparql`)
  })

  it('honors a shorter caller deadline when joining an existing creation', async () => {
    drizzleMock.mockReturnValue(fakeDb('slow'))
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    initializeLinxPodStorageMock.mockImplementationOnce(() => gate)
    const original = createLinxSolidDatabase(SESSION, {
      podUrl: OWNER, sparqlEndpoint: `${ROOM_A}-/sparql`, initTimeoutMs: 60_000,
    })
    try {
      await expect(createLinxSolidDatabase(SESSION, {
        podUrl: OWNER, sparqlEndpoint: `${ROOM_A}-/sparql`, initTimeoutMs: 20,
      })).rejects.toThrow('Pod init timed out')
    } finally {
      release()
      await original
    }
  })
})
