import { describe, expect, it, vi } from 'vitest'
import type { MatrixRoomInvitation } from './matrix-invitations'
import {
  readOwnerRoomMessages,
  sendSharedRoomMessage,
  sharedRoomCollectionOptions,
  sharedRoomReferenceFromInvitation,
} from './shared-room-reference'
import { findSharedRoomRow, rememberSharedRoom, sharedRoomIndexFromChat, sharedRoomTitleFromChat } from './shared-room-index'
import { isSharedRoomChatRow, sharedRoomReferenceForSelection } from './shared-room-runtime'

const CHAT = 'https://pods.example/alice/.data/chat/matrix-abc/index.ttl#this'
const THREAD = 'https://pods.example/alice/.data/chat/matrix-abc/index.ttl#thread'
const ROOM_CONTAINER = 'https://pods.example/alice/.data/chat/matrix-abc/'
const INVITE: MatrixRoomInvitation = {
  roomId: '!room:api.cloud.example',
  name: 'Alice Room',
  inviterWebId: 'https://alice.example/#me',
  storageBinding: 'https://pods.example/alice/',
  roomContainer: ROOM_CONTAINER,
  chatIri: CHAT,
  threadIri: THREAD,
  bindingSource: 'backend_event',
  backendVerified: true,
}

vi.mock('./collections', () => ({
  chatCollection: {
    insert: vi.fn(() => ({ isPersisted: { promise: Promise.resolve() } })),
    update: vi.fn(() => ({ isPersisted: { promise: Promise.resolve() } })),
    delete: vi.fn(),
  },
}))

describe('shared room reference identity', () => {
  it('uses the owner canonical chat/thread IRIs and registered Pod root', () => {
    expect(sharedRoomReferenceFromInvitation(INVITE)).toEqual({
      roomId: INVITE.roomId,
      roomContainer: ROOM_CONTAINER,
      chatIri: CHAT,
      threadIri: THREAD,
      storageBinding: 'https://pods.example/alice/',
      name: 'Alice Room',
    })
  })

  it('never invents shared/<room> ids or #thread fragments', () => {
    const reference = sharedRoomReferenceFromInvitation(INVITE)
    expect(JSON.stringify(reference)).not.toContain('shared/')
    expect(reference.chatIri).not.toContain('shared/')
    expect(reference.threadIri).toBe(THREAD)
  })

  it('rejects an invite without canonical owner IRIs', () => {
    expect(() => sharedRoomReferenceFromInvitation({ ...INVITE, chatIri: null }))
      .toThrow('缺少共享空间信息')
  })

  it('fails closed when room_container is missing or is actually a chat IRI', () => {
    expect(() => sharedRoomReferenceFromInvitation({ ...INVITE, roomContainer: null }))
      .toThrow('缺少共享空间信息')
    // Never fall back to a fragment-bearing chat IRI as the container.
    expect(() => sharedRoomReferenceFromInvitation({ ...INVITE, roomContainer: INVITE.chatIri }))
      .toThrow('缺少共享空间信息')
    expect(() => sharedRoomReferenceFromInvitation({ ...INVITE, roomContainer: ROOM_CONTAINER.slice(0, -1) }))
      .toThrow('缺少共享空间信息')
  })

  it('binds SELECT to the room container, never the Pod root', () => {
    expect(sharedRoomCollectionOptions(sharedRoomReferenceFromInvitation(INVITE)).sparqlEndpoint)
      .toBe('https://pods.example/alice/.data/chat/matrix-abc/-/sparql')
  })

  it('routes reads to the owner thread IRI through the room-scoped DB', async () => {
    const where = vi.fn(() => ({ execute: vi.fn(async () => [{ id: 'm1' }]) }))
    const roomDb = { select: vi.fn(() => ({ from: vi.fn(() => ({ where })) })) }
    const rows = await readOwnerRoomMessages({
      roomDb: roomDb as any,
      reference: sharedRoomReferenceFromInvitation(INVITE),
    })
    expect(rows).toEqual([{ id: 'm1' }])
    expect(where).toHaveBeenCalledWith({ thread: THREAD })
  })

  it('sends through Bob own service/sk with the owner room and thread metadata', async () => {
    const requests: Request[] = []
    const fetchImpl = vi.fn(async (request: Request) => {
      requests.push(request)
      return Response.json({ event_id: '$reply' })
    })
    const result = await sendSharedRoomMessage({
      credential: {
        apiKey: 'sk-bob',
        webId: 'https://bob.example/#id',
        origin: 'https://api.cloud.example',
        podUrl: 'https://pods.example/bob/',
        accountOrigin: 'https://id.cloud.example',
      },
      reference: sharedRoomReferenceFromInvitation(INVITE),
      body: 'hello Alice',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(result.roomId).toBe(INVITE.roomId)
    const request = requests[0]!
    expect(new URL(request.url).origin).toBe('https://api.cloud.example')
    expect(request.headers.get('authorization')).toBe('Bearer sk-bob')
    expect(request.headers.get('x-xpod-pod-url')).toBe('https://pods.example/alice/')
    expect(request.credentials).toBe('omit')
    const body = JSON.parse(await request.text())
    expect(body['co.undefineds.linx']).toEqual({ chat: CHAT, thread: THREAD })
    const [sentUrl] = requests.map((item) => item.url)
    expect(sentUrl).toMatch(
      /^https:\/\/api\.cloud\.example\/_matrix\/client\/v3\/rooms\/!room%3Aapi\.cloud\.example\/send\/m\.room\.message\/.+$/,
    )
  })

  it('maps owner Message rows into the existing ThreadItem timeline', async () => {
    const { ownerMessagesToThreadItems } = await import('./shared-room-reference')
    const items = ownerMessagesToThreadItems([
      { id: 'm1', role: 'user', content: 'Alice asks', createdAt: '2026-10-25T10:00:00Z' },
      { id: 'm2', role: 'assistant', content: 'Alice answers', createdAt: '2026-10-25T10:01:00Z' },
      { id: 'm3', role: 'system', content: 'ignored', createdAt: '2026-10-25T10:02:00Z' },
    ] as any, sharedRoomReferenceFromInvitation(INVITE))
    expect(items.map((item) => [item.type, item.content[0]?.text])).toEqual([
      ['user_message', 'Alice asks'],
      ['assistant_message', 'Alice answers'],
    ])
    expect(items.every((item) => item.thread_id === THREAD)).toBe(true)
    // Canonical Message IRIs come from the models builder, not manual fragments.
    const { ownerMessageEntries } = await import('./shared-room-reference')
    const entries = ownerMessageEntries([
      { id: '2026/10/25/messages.ttl#m1', role: 'user', content: 'x', createdAt: '2026-10-25T10:00:00Z' },
    ] as any, sharedRoomReferenceFromInvitation(INVITE))
    expect(entries[0]?.uri).toBe('https://pods.example/alice/.data/2026/10/25/messages.ttl#m1')
    expect(entries[0]?.uri).not.toContain('#thread#')
  })

  it('persists a discovery row with a model-generated id and dedups by room+storage', async () => {
    const row = await rememberSharedRoom(sharedRoomReferenceFromInvitation(INVITE))
    expect(row.ownerChat).toBe(CHAT)
    expect(row.id).toMatch(/\/index\.ttl#this$/)
    expect(row.ownerThread).toBe(THREAD)

    const again = await rememberSharedRoom(sharedRoomReferenceFromInvitation(INVITE), [
      {
        id: row.id,
        metadata: {
          sharedRoom: {
            roomId: row.roomId,
            storage: row.storage,
            roomContainer: row.roomContainer,
            ownerChat: row.ownerChat,
            ownerThread: row.ownerThread,
          },
        },
      },
    ])
    expect(again.id).toBe(row.id)
    expect(findSharedRoomRow([{ id: row.id, metadata: { sharedRoom: { roomId: row.roomId, storage: row.storage } } }], {
      roomId: row.roomId,
      storage: row.storage,
    })?.id).toBe(row.id)
    expect(sharedRoomIndexFromChat({
      id: row.id,
      metadata: {
        sharedRoom: {
          roomId: row.roomId,
          storage: row.storage,
          roomContainer: row.roomContainer,
          ownerChat: row.ownerChat,
          ownerThread: row.ownerThread,
        },
      },
    })).toMatchObject({ ownerChat: CHAT, ownerThread: THREAD })
  })

  // After a browser reload the discovery row is read back from the Pod, not from
  // the in-memory object that the invitation flow wrote. The chat `metadata`
  // column is an inline object whose nested values are stored as xsd:json
  // literals, so a nested `sharedRoom` comes back as a JSON STRING. Treating it
  // as "not an object" made the row look like a plain local chat after reload,
  // which is exactly when the shared history disappeared in RC55.
  describe('discovery row read back from the Pod after reload', () => {
    const recorded = {
      roomId: INVITE.roomId,
      storage: INVITE.storageBinding,
      roomContainer: ROOM_CONTAINER,
      ownerChat: CHAT,
      ownerThread: THREAD,
    }

    it('still selects the owner room when sharedRoom comes back as a JSON string', () => {
      const reloadedRow = {
        id: 'matrix-abc/index.ttl#this',
        title: 'Alice Room',
        // Exactly what the inline-object read path yields for a nested object.
        metadata: { protocol: 'matrix', sharedRoom: JSON.stringify(recorded) },
      }

      expect(sharedRoomIndexFromChat(reloadedRow)).toMatchObject({
        ownerChat: CHAT,
        ownerThread: THREAD,
        storage: INVITE.storageBinding,
        roomContainer: ROOM_CONTAINER,
      })
      // The reloaded row must still be recognized as a shared room, so the
      // conversation keeps reading the owner's thread instead of going local.
      expect(sharedRoomReferenceForSelection(reloadedRow)).toMatchObject({
        chatIri: CHAT,
        threadIri: THREAD,
      })
      expect(isSharedRoomChatRow(reloadedRow)).toBe(true)
      expect(sharedRoomTitleFromChat(reloadedRow)).toBe('Alice Room')
    })

    it('accepts the object form as well, so both write and read paths work', () => {
      expect(sharedRoomIndexFromChat({ id: 'r', metadata: { sharedRoom: recorded } }))
        .toMatchObject({ ownerChat: CHAT, ownerThread: THREAD })
    })

    it('still fails closed on a string that is not a usable shared-room record', () => {
      for (const bad of ['not json', '{}', '"text"', JSON.stringify({ roomId: '!r' }), 'null']) {
        expect(sharedRoomIndexFromChat({ id: 'r', metadata: { sharedRoom: bad } })).toBeNull()
        expect(isSharedRoomChatRow({ id: 'r', metadata: { sharedRoom: bad } })).toBe(false)
      }
    })

    it('does not treat an unrelated string metadata value as a shared room', () => {
      expect(sharedRoomIndexFromChat({ id: 'r', metadata: { sharedRoom: 'true' } })).toBeNull()
      expect(sharedRoomIndexFromChat({ id: 'r', metadata: null })).toBeNull()
      expect(sharedRoomIndexFromChat({ id: 'r', metadata: {} })).toBeNull()
    })
  })
})
