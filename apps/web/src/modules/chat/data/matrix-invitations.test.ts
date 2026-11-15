import { describe, expect, it, vi } from 'vitest'
import type { MatrixSyncResponse } from '@linx/agent-runtime/matrix-client'
import type { MatrixInterfaceAccess } from '@/lib/matrix/pod-interface-access'
import {
  acceptMatrixInvitation,
  isInvitationBindingUsable,
  loadMatrixInvitations,
  readMatrixInvitations,
} from './matrix-invitations'

const WEB_ID = 'https://bob.example/#id'
const SERVICE = 'https://api.cloud.example'
// Real Cloud shape: API service origin and storage Pod origin are different.
// storage = registered canonical POD ROOT; the room container is separate.
const STORAGE = 'https://pods.example/alice/'
const ROOM_CONTAINER = 'https://pods.example/alice/.data/chat/r/'
const ROOM = '!room:api.cloud.example'

function access(podUrl = 'https://pods.cloud.example/bob/'): MatrixInterfaceAccess {
  return {
    get: () => ({
      apiKey: 'sk-bob',
      webId: WEB_ID,
      accountOrigin: 'https://id.cloud.example',
      origin: SERVICE,
      podUrl,
    }),
    authorize: vi.fn(),
    importAuthorization: vi.fn(),
    accountOrigin: () => 'https://id.cloud.example',
    release: vi.fn(async () => undefined),
  }
}

const CHAT_IRI = `${ROOM_CONTAINER}index.ttl#this`
const THREAD_IRI = `${ROOM_CONTAINER}index.ttl#thread`

function bindingEvent(storage = STORAGE, verified = true) {
  return {
    type: 'co.undefineds.matrix.storage_binding',
    content: { storage, room_container: ROOM_CONTAINER, chat: CHAT_IRI, thread: THREAD_IRI, verified },
  }
}

function syncWith(events: Array<Record<string, unknown>>): MatrixSyncResponse {
  return {
    next_batch: 'n1',
    rooms: {
      join: {},
      invite: { [ROOM]: { invite_state: { events: events as any } } },
    },
  } as unknown as MatrixSyncResponse
}

describe('matrix invitations', () => {
  it('reads an invite and its backend-verified storage binding without host equality', () => {
    const [invitation] = readMatrixInvitations(syncWith([
      { type: 'm.room.member', state_key: 'https://alice.example/#me', content: { membership: 'invite' } },
      { type: 'm.room.name', content: { name: 'Alice Room' } },
      bindingEvent(),
    ]))

    expect(invitation).toMatchObject({
      roomId: ROOM,
      name: 'Alice Room',
      inviterWebId: 'https://alice.example/#me',
      storageBinding: STORAGE,
      bindingSource: 'backend_event',
      backendVerified: true,
    })
    expect(new URL(STORAGE).origin).not.toBe(SERVICE)
    expect(isInvitationBindingUsable(invitation!)).toBe(true)
  })

  it('does not trust a binding the backend did not verify or a caller-built record', () => {
    const [unverified] = readMatrixInvitations(syncWith([bindingEvent(STORAGE, false)]))
    expect(isInvitationBindingUsable(unverified!)).toBe(false)

    const [noBinding] = readMatrixInvitations(syncWith([]))
    expect(noBinding?.bindingSource).toBeNull()
    expect(isInvitationBindingUsable(noBinding!)).toBe(false)

    expect(isInvitationBindingUsable({
      roomId: ROOM,
      name: null,
      inviterWebId: null,
      storageBinding: STORAGE,
      bindingSource: null,
      backendVerified: true,
    })).toBe(false)
  })

  it('never joins on discovery; invitations stay pending', async () => {
    const sync = vi.fn(async () => syncWith([bindingEvent()]))
    const invitations = await loadMatrixInvitations({
      db: { getDialect: () => ({ getPodUrl: () => 'https://pods.cloud.example/bob/' }) } as any,
      access: access(),
      client: { sync } as any,
    })
    expect(invitations).toHaveLength(1)
    expect(isInvitationBindingUsable(invitations[0]!)).toBe(true)
    expect(sync).toHaveBeenCalledWith({ timeout: 0 })
  })

  it('accepts with a cross-origin storage binding but keeps the sk on the pinned service', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ room_id: ROOM }))
    const [invitation] = readMatrixInvitations(syncWith([bindingEvent()]))
    const joined = await acceptMatrixInvitation({
      db: { getDialect: () => ({ getPodUrl: () => 'https://pods.cloud.example/bob/' }) } as any,
      access: access(),
      invitation: invitation!,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(joined).toEqual({ roomId: ROOM, storageBinding: STORAGE })
    const [request] = fetchImpl.mock.calls[0] as unknown as [Request]
    expect(new URL(request.url).origin).toBe(SERVICE)
    expect(request.headers.get('x-xpod-pod-url')).toBe(STORAGE)
    expect(request.headers.get('authorization')).toBe('Bearer sk-bob')
    expect(request.headers.get('dpop')).toBeNull()
    expect(request.credentials).toBe('omit')
  })

  it('refuses to accept an unverified or missing binding and sends nothing', async () => {
    const fetchImpl = vi.fn()
    const [invitation] = readMatrixInvitations(syncWith([bindingEvent(STORAGE, false)]))
    await expect(acceptMatrixInvitation({
      db: { getDialect: () => ({ getPodUrl: () => 'https://pods.cloud.example/bob/' }) } as any,
      access: access(),
      invitation: invitation!,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toThrow('服务端验证')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('never puts Bob key on Alice service origin', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ room_id: ROOM }))
    const [invitation] = readMatrixInvitations(syncWith([bindingEvent()]))
    await acceptMatrixInvitation({
      db: { getDialect: () => ({ getPodUrl: () => 'https://pods.cloud.example/bob/' }) } as any,
      access: access(),
      invitation: invitation!,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const [request] = fetchImpl.mock.calls[0] as unknown as [Request]
    expect(request.url).not.toContain('alice.example')
  })
})
