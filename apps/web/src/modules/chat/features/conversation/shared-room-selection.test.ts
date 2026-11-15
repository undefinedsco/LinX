import { describe, expect, it, vi } from 'vitest'
import { sharedRoomReferenceForSelection } from '../../data/shared-room-runtime'
import { createSharedRoomConversation } from './shared-room-conversation'

const ROW = {
  id: 'abc/index.ttl#this',
  title: 'Alice Room',
  metadata: {
    protocol: 'matrix',
    sharedRoom: {
      roomId: '!room:api.cloud.example',
      storage: 'https://pods.example/alice/',
      roomContainer: 'https://pods.example/alice/.data/chat/r/',
      ownerChat: 'https://pods.example/alice/.data/chat/r/index.ttl#this',
      ownerThread: 'https://pods.example/alice/.data/chat/r/index.ttl#thread',
    },
  },
}

describe('conversation surface selection', () => {
  it('maps a selected shared row to the owner reference used by the surface', () => {
    const reference = sharedRoomReferenceForSelection(ROW)
    expect(reference).toMatchObject({
      chatIri: 'https://pods.example/alice/.data/chat/r/index.ttl#this',
      threadIri: 'https://pods.example/alice/.data/chat/r/index.ttl#thread',
      storageBinding: 'https://pods.example/alice/',
    })
  })

  it('creates the shared adapter only from that selected reference', async () => {
    const reference = sharedRoomReferenceForSelection(ROW)!
    const openRuntime = vi.fn(async () => ({
      reference,
      loadMessages: vi.fn(async () => []),
      send: vi.fn(),
    }))
    const conversation = createSharedRoomConversation({
      session: {} as any,
      reference,
      matrixAccess: { get: () => ({
        apiKey: 'sk-bob', webId: 'https://bob.example/#id', origin: 'https://api.cloud.example',
        podUrl: 'https://pods.example/bob/', accountOrigin: 'https://id.cloud.example',
      }) } as any,
      openRuntime: openRuntime as any,
      pollIntervalMs: 0,
    })
    await conversation.load()
    expect(openRuntime).toHaveBeenCalledTimes(1)
    expect(openRuntime.mock.calls[0]?.[0]).toMatchObject({ reference })
    conversation.dispose()
  })

  it('keeps a normal row on the local path (no owner reference)', () => {
    expect(sharedRoomReferenceForSelection({ id: 'local/index.ttl#this', metadata: null })).toBeNull()
  })

  it('requires active authorization before the adapter can open the room', async () => {
    const reference = sharedRoomReferenceForSelection(ROW)!
    const openRuntime = vi.fn()
    const conversation = createSharedRoomConversation({
      session: {} as any,
      reference,
      matrixAccess: { get: () => null } as any,
      openRuntime: openRuntime as any,
      pollIntervalMs: 0,
    })
    await expect(conversation.load()).rejects.toThrow('群聊服务还没有授权')
    expect(openRuntime).not.toHaveBeenCalled()
    conversation.dispose()
  })
})
