import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MessageRow } from '@undefineds.co/models'
import { createSharedRoomConversation } from './shared-room-conversation'
import type { SharedRoomReference } from '../../data/shared-room-reference'

const CHAT = 'https://pods.example/alice/.data/chat/r/index.ttl#this'
const THREAD = 'https://pods.example/alice/.data/chat/r/index.ttl#thread'
const ROOM = 'https://pods.example/alice/.data/chat/r/'
const REFERENCE: SharedRoomReference = {
  roomId: '!room:api.cloud.example',
  roomContainer: ROOM,
  chatIri: CHAT,
  threadIri: THREAD,
  storageBinding: 'https://pods.example/alice/',
  name: 'Alice Room',
}

let apiKey = 'sk-bob-1'
const CREDENTIAL = () => ({
  apiKey,
  webId: 'https://bob.example/#id',
  origin: 'https://api.cloud.example',
  podUrl: 'https://pods.example/bob/',
  accountOrigin: 'https://id.cloud.example',
})

function matrixAccess() {
  return {
    get: () => CREDENTIAL(),
    accountOrigin: () => 'https://id.cloud.example',
    authorize: vi.fn(),
    importAuthorization: vi.fn(),
    release: vi.fn(),
  } as any
}

function message(overrides: Partial<MessageRow>): MessageRow {
  return {
    id: '2026/10/25/messages.ttl#m1',
    role: 'user',
    content: 'Hello from Alice',
    createdAt: '2026-10-25T10:00:00Z',
    ...overrides,
  } as MessageRow
}

function runtimeWith(rows: () => MessageRow[]) {
  return {
    reference: REFERENCE,
    loadMessages: vi.fn(async () => rows()),
    send: vi.fn(async () => ({ roomId: REFERENCE.roomId, eventId: '$bob-reply' })),
  }
}

afterEach(() => {
  vi.useRealTimers()
  apiKey = 'sk-bob-1'
})

describe('shared room conversation adapter', () => {
  it('opens the owner room runtime and uses canonical Message IRIs, not fabricated fragments', async () => {
    const openRuntime = vi.fn(async () => runtimeWith(() => [
      message({ id: '2026/10/25/messages.ttl#m1', role: 'user', content: 'Alice asks' }),
      message({ id: '2026/10/25/messages.ttl#m2', role: 'assistant', content: 'Alice answers', createdAt: '2026-10-25T10:01:00Z' }),
    ]))
    const conversation = createSharedRoomConversation({
      session: {} as any, reference: REFERENCE, matrixAccess: matrixAccess(),
      openRuntime: openRuntime as any, pollIntervalMs: 0,
    })

    const loaded = await conversation.load()

    expect(openRuntime).toHaveBeenCalledWith(expect.objectContaining({ reference: REFERENCE, credential: CREDENTIAL() }))
    expect(loaded.threadUri).toBe(THREAD)
    expect(loaded.items.map((entry) => entry.uri)).toEqual([
      'https://pods.example/alice/.data/2026/10/25/messages.ttl#m1',
      'https://pods.example/alice/.data/2026/10/25/messages.ttl#m2',
    ])
    expect(loaded.items.map((entry) => [entry.item.type, entry.item.content[0]?.text])).toEqual([
      ['user_message', 'Alice asks'],
      ['assistant_message', 'Alice answers'],
    ])
    for (const entry of loaded.items) {
      expect(entry.uri).not.toContain('#thread#')
      expect(entry.item.id).toBe(entry.uri)
      expect(conversation.resolveItemUri(entry.item.id)).toBe(entry.uri)
    }
  })

  it('polls once and notifies every current listener, importing via callback not fabricated state', async () => {
    vi.useFakeTimers()
    let rows = [message({ id: '2026/10/25/messages.ttl#m1', content: 'first' })]
    const openRuntime = vi.fn(async () => runtimeWith(() => rows))
    const conversation = createSharedRoomConversation({
      session: {} as any, reference: REFERENCE, matrixAccess: matrixAccess(),
      openRuntime: openRuntime as any, pollIntervalMs: 50,
    })
    const first = vi.fn()
    const second = vi.fn()
    conversation.subscribe(first)
    conversation.subscribe(second)
    await vi.advanceTimersByTimeAsync(60)
    const callsAfterFirstTick = openRuntime.mock.calls.length

    rows = [...rows, message({ id: '2026/10/25/messages.ttl#m2', role: 'assistant', content: 'new owner reply' })]
    await vi.advanceTimersByTimeAsync(60)

    expect(first).toHaveBeenCalled()
    expect(second).toHaveBeenCalled()
    // One runtime open, one poll owner.
    expect(openRuntime).toHaveBeenCalledTimes(1)
    expect(openRuntime.mock.calls.length).toBe(callsAfterFirstTick)
    const loaded = await conversation.load()
    expect(loaded.items.map((entry) => entry.item.content[0]?.text)).toContain('new owner reply')
    conversation.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('coalesces overlapping polls into one in-flight read', async () => {
    vi.useFakeTimers()
    let resolveRead: ((rows: MessageRow[]) => void) | null = null
    const loadMessages = vi.fn(() => new Promise<MessageRow[]>((resolve) => { resolveRead = resolve }))
    const openRuntime = vi.fn(async () => ({
      reference: REFERENCE, loadMessages, send: vi.fn(),
    }))
    const conversation = createSharedRoomConversation({
      session: {} as any, reference: REFERENCE, matrixAccess: matrixAccess(),
      openRuntime: openRuntime as any, pollIntervalMs: 10,
    })
    const listener = vi.fn()
    conversation.subscribe(listener)
    await vi.advanceTimersByTimeAsync(15)
    expect(loadMessages).toHaveBeenCalledTimes(1)
    // Two more intervals while the read is hung: no second concurrent read.
    await vi.advanceTimersByTimeAsync(25)
    expect(loadMessages).toHaveBeenCalledTimes(1)
    resolveRead!([])
    await vi.advanceTimersByTimeAsync(1)
    await vi.advanceTimersByTimeAsync(15)
    expect(loadMessages.mock.calls.length).toBeLessThanOrEqual(2)
    conversation.dispose()
  })

  it('does not schedule or notify after unsubscribe, even if a tick was in flight', async () => {
    vi.useFakeTimers()
    let resolveRead: ((rows: MessageRow[]) => void) | null = null
    const loadMessages = vi.fn(() => new Promise<MessageRow[]>((resolve) => { resolveRead = resolve }))
    const openRuntime = vi.fn(async () => ({ reference: REFERENCE, loadMessages, send: vi.fn() }))
    const conversation = createSharedRoomConversation({
      session: {} as any, reference: REFERENCE, matrixAccess: matrixAccess(),
      openRuntime: openRuntime as any, pollIntervalMs: 10,
    })
    const listener = vi.fn()
    const unsubscribe = conversation.subscribe(listener)
    await vi.advanceTimersByTimeAsync(15)
    unsubscribe()
    resolveRead!([message({ id: '2026/10/25/messages.ttl#m9' })])
    await vi.advanceTimersByTimeAsync(50)
    expect(listener).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    conversation.dispose()
  })

  it('surfaces a real 403 instead of swallowing it and never logs out', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    const openRuntime = vi.fn(async () => ({
      reference: REFERENCE,
      loadMessages: vi.fn(async () => { throw new Error('HTTP 403: 没有读取这个空间的权限') }),
      send: vi.fn(),
    }))
    const conversation = createSharedRoomConversation({
      session: {} as any, reference: REFERENCE, matrixAccess: matrixAccess(),
      openRuntime: openRuntime as any, pollIntervalMs: 10, onError,
    })
    conversation.subscribe(vi.fn())
    await vi.advanceTimersByTimeAsync(15)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('HTTP 403') }))
    await expect(conversation.load()).rejects.toThrow('HTTP 403')
    conversation.dispose()
  })

  it('requires an explicit credential error before any runtime opens', async () => {
    const openRuntime = vi.fn()
    const access = matrixAccess()
    access.get = () => null
    const conversation = createSharedRoomConversation({
      session: {} as any, reference: REFERENCE, matrixAccess: access,
      openRuntime: openRuntime as any, pollIntervalMs: 0,
    })
    await expect(conversation.load()).rejects.toMatchObject({ code: 'shared_room_authorization_required' })
    expect(openRuntime).not.toHaveBeenCalled()
  })

  it('reopens the room runtime after credential rotation and never reuses the old one', async () => {
    const openRuntime = vi.fn(async (input: { credential: { apiKey: string } }) => ({
      reference: REFERENCE,
      loadMessages: vi.fn(async () => [message({ content: `read with ${input.credential.apiKey}` })]),
      send: vi.fn(),
    }))
    const conversation = createSharedRoomConversation({
      session: {} as any, reference: REFERENCE, matrixAccess: matrixAccess(),
      openRuntime: openRuntime as any, pollIntervalMs: 0,
    })
    await conversation.load()
    apiKey = 'sk-bob-2'
    const loaded = await conversation.load()
    expect(openRuntime).toHaveBeenCalledTimes(2)
    expect(loaded.items[0]?.item.content[0]?.text).toBe('read with sk-bob-2')
    conversation.dispose()
  })

  it('sends through the owner room runtime and yields the sent event without inventing an RDF URI', async () => {
    const runtime = runtimeWith(() => [])
    const conversation = createSharedRoomConversation({
      session: {} as any, reference: REFERENCE, matrixAccess: matrixAccess(),
      openRuntime: async () => runtime as any, pollIntervalMs: 0,
    })
    const events: any[] = []
    for await (const event of conversation.run({
      type: 'threads.add_user_message',
      params: { thread_id: THREAD, input: { content: [{ type: 'input_text', text: 'Bob reply' }] } },
    })) events.push(event)

    expect(runtime.send).toHaveBeenCalledWith('Bob reply')
    const added = events.find((event) => event.type === 'thread.item.added')
    expect(added.item.id).toBe('$bob-reply')
    expect(added.item.id).not.toContain('/.data/')
    expect(events.some((event) => event.item?.content[0]?.text === 'Bob reply')).toBe(true)
  })

  it('rejects unsupported requests instead of falling back to the AI path', async () => {
    const openRuntime = vi.fn(async () => runtimeWith(() => []))
    const conversation = createSharedRoomConversation({
      session: {} as any, reference: REFERENCE, matrixAccess: matrixAccess(),
      openRuntime: openRuntime as any, pollIntervalMs: 0,
    })
    await expect(async () => {
      for await (const _event of conversation.run({ type: 'threads.create', params: {} })) { /* noop */ }
    }).rejects.toThrow('共享群聊只支持发送消息')
  })
})
