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

  it('does not let profile discovery swallow a different room binding', async () => {
    let release: (() => void) | null = null
    const gate = new Promise<void>((resolve) => { release = resolve })
    drizzleMock.mockImplementation((_s: unknown, config: any) => fakeDb(config.sparqlEndpoint ?? 'discovery'))
    initializeLinxPodStorageMock.mockImplementationOnce(async () => { await gate }).mockResolvedValue(undefined)

    const discovery = createLinxSolidDatabase(SESSION)
    const room = createLinxSolidDatabase(SESSION, {
      podUrl: OWNER, sparqlEndpoint: `${ROOM_A}-/sparql`, resourcePreparation: 'off',
    })
    expect(drizzleMock).toHaveBeenCalledTimes(2)
    release!()
    const [discoveryDb, roomDb] = await Promise.all([discovery, room])
    expect(discoveryDb).not.toBe(roomDb)
    expect(initializeLinxPodStorageMock).toHaveBeenCalledTimes(1)
  })

  it('never shares an authenticated DB across accounts even for the same owner room', async () => {
    const drizzleCalls: Array<{ session: any; config: any }> = []
    drizzleMock.mockImplementation((session: any, config: any) => {
      drizzleCalls.push({ session, config })
      return fakeDb(`db-${drizzleCalls.length}`)
    })
    initializeLinxPodStorageMock.mockResolvedValue(undefined)
    const aliceFetch = vi.fn(async () => new Response('alice'))
    const bobFetch = vi.fn(async () => new Response('bob'))
    const alice = { info: { webId: 'https://ids.example/alice/profile/card#me', sessionId: 'sa' }, fetch: aliceFetch }
    const bob = { info: { webId: 'https://ids.example/bob/profile/card#me', sessionId: 'sb' }, fetch: bobFetch }
    const room = {
      podUrl: OWNER,
      sparqlEndpoint: `${ROOM_A}-/sparql`,
      resourcePreparation: 'off' as const,
    }

    const [a, b] = await Promise.all([
      createLinxSolidDatabase(alice, room),
      createLinxSolidDatabase(bob, room),
    ])

    expect(drizzleMock).toHaveBeenCalledTimes(2)
    expect(a).not.toBe(b)
    // Each authenticated DB keeps its own caller fetch: no credential borrowing.
    // (The factory wraps fetch for cache-bypass, so prove provenance by call.)
    await drizzleCalls[0]?.session.fetch('https://pods.example/alice/.data/chat/r/index.ttl')
    await drizzleCalls[1]?.session.fetch('https://pods.example/alice/.data/chat/r/index.ttl')
    expect(aliceFetch).toHaveBeenCalledTimes(1)
    expect(bobFetch).toHaveBeenCalledTimes(1)
  })

  it('does not borrow an in-flight auth DB across two sessions of the same WebID', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const drizzleCalls: any[] = []
    drizzleMock.mockImplementation((session: any) => {
      drizzleCalls.push(session)
      return fakeDb(`db-${drizzleCalls.length}`)
    })
    initializeLinxPodStorageMock
      .mockImplementationOnce(async () => { await gate })
      .mockResolvedValue(undefined)
    const firstFetch = vi.fn(async () => new Response('one'))
    const secondFetch = vi.fn(async () => new Response('two'))
    const first = { info: { webId: 'https://ids.example/bob/profile/card#me' }, fetch: firstFetch }
    const second = { info: { webId: 'https://ids.example/bob/profile/card#me' }, fetch: secondFetch }
    const room = { podUrl: OWNER, sparqlEndpoint: `${ROOM_A}-/sparql`, resourcePreparation: 'off' as const }

    const pending = createLinxSolidDatabase(first, room)
    const other = createLinxSolidDatabase(second, room)
    expect(drizzleMock).toHaveBeenCalledTimes(2)
    release()
    const [a, b] = await Promise.all([pending, other])
    expect(a).not.toBe(b)
    await drizzleCalls[0].fetch('https://pods.example/alice/.data/chat/r/index.ttl')
    await drizzleCalls[1].fetch('https://pods.example/alice/.data/chat/r/index.ttl')
    expect(firstFetch).toHaveBeenCalledTimes(1)
    expect(secondFetch).toHaveBeenCalledTimes(1)
  })

  it('does not reuse a pending Bob DB after the same object becomes Charlie', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    drizzleMock.mockImplementation((_s: unknown, config: any) => fakeDb(config.sparqlEndpoint ?? 'broad'))
    initializeLinxPodStorageMock
      .mockImplementationOnce(async () => { await gate })
      .mockResolvedValue(undefined)
    const session = { info: { webId: 'https://ids.example/bob/profile/card#me' }, fetch: vi.fn() }
    const room = { podUrl: OWNER, sparqlEndpoint: `${ROOM_A}-/sparql`, resourcePreparation: 'off' as const }

    const bobPending = createLinxSolidDatabase(session, room)
    session.info.webId = 'https://ids.example/charlie/profile/card#me'
    const charlie = await createLinxSolidDatabase(session, room)

    expect(drizzleMock).toHaveBeenCalledTimes(2)
    release()
    const bob = await bobPending
    expect(bob).not.toBe(charlie)
  })

  it('promotes an anonymous in-flight creation to the first known identity only', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let calls = 0
    drizzleMock.mockImplementation(() => fakeDb(`db-${++calls}`))
    initializeLinxPodStorageMock
      .mockImplementationOnce(async () => { await gate })
      .mockResolvedValue(undefined)
    const fetchImpl = vi.fn(async () => new Response(''))
    const session = { info: {} as { webId?: string }, fetch: fetchImpl }
    const room = { podUrl: OWNER, sparqlEndpoint: `${ROOM_A}-/sparql`, resourcePreparation: 'off' as const }

    // 1) anonymous creation pending
    const anonymous = createLinxSolidDatabase(session, room)
    // 2) settled to Bob: claims the anonymous creation exactly once
    session.info.webId = 'https://ids.example/bob/profile/card#me'
    const bob = createLinxSolidDatabase(session, room)
    // 3) same object, now Charlie, while the first is still pending: must NOT
    //    reuse Bob's database, even though the anonymous alias is gone.
    session.info.webId = 'https://ids.example/charlie/profile/card#me'
    const charlie = createLinxSolidDatabase(session, room)
    // 4) Bob again while pending still coalesces with his claimed creation.
    session.info.webId = 'https://ids.example/bob/profile/card#me'
    const bobAgain = createLinxSolidDatabase(session, room)

    expect(drizzleMock).toHaveBeenCalledTimes(2)
    release()
    expect(await bob).toBe(await anonymous)
    expect(await bobAgain).toBe(await anonymous)
    expect(await charlie).not.toBe(await bob)

    // After resolve, all aliases are cleared: a new call creates a fresh DB.
    const fresh = await createLinxSolidDatabase(session, room)
    expect(drizzleMock).toHaveBeenCalledTimes(3)
    expect(fresh).not.toBe(await bob)
  })

  it('does not share anonymous or discovery creations across session objects', async () => {
    drizzleMock.mockImplementation(() => fakeDb('db'))
    initializeLinxPodStorageMock.mockResolvedValue(undefined)
    const [c, d] = await Promise.all([
      createLinxSolidDatabase({ info: {}, fetch: vi.fn() }),
      createLinxSolidDatabase({ info: {}, fetch: vi.fn() }),
    ])
    expect(c).not.toBe(d)
    const e = createLinxSolidDatabase({ info: { webId: 'https://ids.example/alice/profile/card#me' }, fetch: vi.fn() })
    const f = createLinxSolidDatabase({ info: { webId: 'https://ids.example/alice/profile/card#me' }, fetch: vi.fn() })
    expect(await e).not.toBe(await f)
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
