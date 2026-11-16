import { describe, expect, it, vi } from 'vitest'
import {
  openSharedRoomRuntime,
  sharedRoomReferenceForSelection,
  sharedRoomReferenceFromChatRow,
} from './shared-room-runtime'

const CHAT = 'https://pods.example/alice/.data/chat/r/index.ttl#this'
const THREAD = 'https://pods.example/alice/.data/chat/r/index.ttl#thread'
const ROW = {
  id: 'shared-room:!room:api.example',
  title: 'Alice Room',
  metadata: {
    sharedRoom: {
      roomId: '!room:api.example',
      storage: 'https://pods.example/alice/',
      roomContainer: 'https://pods.example/alice/.data/chat/r/',
      ownerChat: CHAT,
      ownerThread: THREAD,
    },
  },
}

describe('shared room runtime', () => {
  it('recognizes only a row with canonical owner chat/thread/root', () => {
    expect(sharedRoomReferenceFromChatRow(ROW)).toMatchObject({
      chatIri: CHAT,
      threadIri: THREAD,
      storageBinding: 'https://pods.example/alice/',
    })
    expect(sharedRoomReferenceFromChatRow({ id: 'x', metadata: {} })).toBeNull()
    expect(sharedRoomReferenceFromChatRow({ id: 'x', metadata: { sharedRoom: { roomId: '!r' } } })).toBeNull()
  })

  it('selects the owner reference only for a shared discovery row', () => {
    expect(sharedRoomReferenceForSelection(ROW)).toMatchObject({ chatIri: CHAT, threadIri: THREAD })
    expect(sharedRoomReferenceForSelection({ id: 'local', metadata: null })).toBeNull()
    expect(sharedRoomReferenceForSelection(undefined)).toBeNull()
  })

  it('builds a room-scoped DB with the published option, preparation off, no parent init', async () => {
    const createDatabase = vi.fn(async () => ({
      select: () => ({ from: () => ({ where: () => ({ execute: async () => [{ id: 'owner-message' }] }) }) }),
    }))
    const runtime = await openSharedRoomRuntime({
      reference: sharedRoomReferenceFromChatRow(ROW)!,
      session: {} as any,
      credential: {
        apiKey: 'sk-bob',
        webId: 'https://bob.example/#id',
        accountOrigin: 'https://id.cloud.example',
        origin: 'https://api.cloud.example',
        podUrl: 'https://pods.example/bob/',
      },
      createDatabase: createDatabase as any,
    })

    expect(createDatabase).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      // Owner root: row identity must bind to the room Pod, not Bob's.
      podUrl: 'https://pods.example/alice/',
      resourcePreparation: 'off',
      sparqlEndpoint: 'https://pods.example/alice/.data/chat/r/-/sparql',
    }))
    expect(createDatabase.mock.calls[0]?.[1]?.podUrl).not.toBe('https://pods.example/bob/')
    expect(await runtime.loadMessages()).toEqual([{ id: 'owner-message' }])
  })

  it('passes Bob session.fetch unchanged while binding to the owner root', async () => {
    const sessionFetch = vi.fn(async () => new Response(''))
    const session = { info: { webId: 'https://bob.example/#id' }, fetch: sessionFetch }
    const createDatabase = vi.fn(async () => ({ select: () => ({ from: () => ({ where: () => ({ execute: async () => [] }) }) }) }))
    await openSharedRoomRuntime({
      reference: sharedRoomReferenceFromChatRow(ROW)!,
      session: session as any,
      credential: {
        apiKey: 'sk-bob', webId: 'https://bob.example/#id', accountOrigin: 'https://id.cloud.example',
        origin: 'https://api.cloud.example', podUrl: 'https://pods.example/bob/',
      },
      createDatabase: createDatabase as any,
    })
    expect(createDatabase.mock.calls[0]?.[0]).toBe(session)
    expect((createDatabase.mock.calls[0]?.[0] as any).fetch).toBe(sessionFetch)
  })

  it('proves a Bob-root binding would decode the owner row to a wrong canonical IRI', async () => {
    const { messageResource } = await import('@undefineds.co/models')
    const rowId = 'chat/probe-room/2026/10/25/messages.ttl#probe-message'
    const ownerIri = messageResource.buildIri('https://pods.example/alice/', { id: rowId })
    const bobIri = messageResource.buildIri('https://pods.example/bob/', { id: rowId })
    expect(ownerIri).toBe('https://pods.example/alice/.data/chat/probe-room/2026/10/25/messages.ttl#probe-message')
    expect(bobIri).not.toBe(ownerIri)
    expect(bobIri.startsWith('https://pods.example/bob/')).toBe(true)
  })

  it('does not mutate any global selected Pod when opening the read DB', async () => {
    const globalBefore = (globalThis as any).__LINX_SELECTED_POD__
    const createDatabase = vi.fn(async () => ({ select: () => ({ from: () => ({ where: () => ({ execute: async () => [] }) }) }) }))
    await openSharedRoomRuntime({
      reference: sharedRoomReferenceFromChatRow(ROW)!,
      session: {} as any,
      credential: {
        apiKey: 'sk-bob', webId: 'https://bob.example/#id', accountOrigin: 'https://id.cloud.example',
        origin: 'https://api.cloud.example', podUrl: 'https://pods.example/bob/',
      },
      createDatabase: createDatabase as any,
    })
    expect((globalThis as any).__LINX_SELECTED_POD__).toBe(globalBefore)
  })
})
