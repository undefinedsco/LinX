import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MessageRow } from '@undefineds.co/models'
import { itemsToAgUiMessages } from './ag-ui/history'
import { createSharedRoomConversation } from './shared-room-conversation'
import { describeConversationLoadError } from '../../domain/conversation-load-error'
import type { SharedRoomReference } from '../../data/shared-room-reference'

/**
 * Surface integration for the shared room: real adapter + real AG-UI history
 * mapping, with only the owner-Pod network boundary replaced. The sink mimics
 * assistant-ui's `thread.import(repository)` contract: the surface's displayed
 * messages are exactly what the import receives.
 */
const ROOM = 'https://pods.example/alice/.data/chat/r/'
const THREAD = `${ROOM}index.ttl#thread`
const REFERENCE: SharedRoomReference = {
  roomId: '!room:api.cloud.example',
  roomContainer: ROOM,
  chatIri: `${ROOM}index.ttl#this`,
  threadIri: THREAD,
  storageBinding: 'https://pods.example/alice/',
  name: 'Alice Room',
}

const CREDENTIAL = {
  apiKey: 'sk-bob',
  webId: 'https://bob.example/#id',
  origin: 'https://api.cloud.example',
  podUrl: 'https://pods.example/bob/',
  accountOrigin: 'https://id.cloud.example',
}

function access() {
  return { get: () => CREDENTIAL, accountOrigin: () => CREDENTIAL.accountOrigin } as any
}

function row(id: string, role: 'user' | 'assistant', text: string, createdAt: string): MessageRow {
  return { id, role, content: text, createdAt } as MessageRow
}

/** The part of the surface that turns a loaded thread into displayed messages. */
function mountSurface(conversation: ReturnType<typeof createSharedRoomConversation>) {
  const displayed: string[] = []
  let imports = 0
  const importThread = async () => {
    const loaded = await conversation.load()
    const messages = itemsToAgUiMessages(loaded.items)
    // assistant-ui's thread.import replaces the visible repository contents.
    displayed.splice(0, displayed.length, ...messages.map((message) => (
      typeof message.content === 'string'
        ? message.content
        : (message.content ?? []).map((part) => String(part.text ?? '')).join('')
    )))
    imports += 1
  }
  const unsubscribe = conversation.subscribe(() => { void importThread() })
  return {
    displayed,
    get imports() { return imports },
    importThread,
    stop: unsubscribe,
  }
}

afterEach(() => vi.useRealTimers())

describe('shared room surface integration (network boundary faked)', () => {
  it('shows owner messages and later owner replies through the import path', async () => {
    vi.useFakeTimers()
    let rows = [
      row('2026/10/25/messages.ttl#a1', 'user', 'Alice: kickoff at ten', '2026-10-25T10:00:00Z'),
      row('2026/10/25/messages.ttl#a2', 'assistant', 'Alice: agenda attached', '2026-10-25T10:01:00Z'),
    ]
    const openRuntime = vi.fn(async () => ({
      reference: REFERENCE,
      loadMessages: vi.fn(async () => rows),
      send: vi.fn(),
    }))
    const conversation = createSharedRoomConversation({
      session: {} as any,
      reference: REFERENCE,
      matrixAccess: access(),
      openRuntime: openRuntime as any,
      pollIntervalMs: 40,
    })
    const surface = mountSurface(conversation)
    await surface.importThread()
    expect(surface.displayed).toEqual(['Alice: kickoff at ten', 'Alice: agenda attached'])

    rows = [...rows, row('2026/10/26/messages.ttl#a3', 'user', 'Alice: joining now', '2026-10-26T09:00:00Z')]
    await vi.advanceTimersByTimeAsync(50)

    expect(surface.displayed).toEqual([
      'Alice: kickoff at ten',
      'Alice: agenda attached',
      'Alice: joining now',
    ])
    // Real owners: one poll loop, one runtime.
    expect(openRuntime).toHaveBeenCalledTimes(1)
    surface.stop()
    conversation.dispose()
  })

  it('renders Bob reply through own send and then shows it from the owner timeline', async () => {
    vi.useFakeTimers()
    const rows: MessageRow[] = [row('2026/10/25/messages.ttl#a1', 'user', 'Alice: hello', '2026-10-25T10:00:00Z')]
    const send = vi.fn(async (text: string) => {
      rows.push(row('2026/10/26/messages.ttl#b1', 'user', text, '2026-10-26T09:00:00Z'))
      return { roomId: REFERENCE.roomId, eventId: '$bob-event' }
    })
    const openRuntime = vi.fn(async () => ({
      reference: REFERENCE, loadMessages: vi.fn(async () => rows), send,
    }))
    const conversation = createSharedRoomConversation({
      session: {} as any, reference: REFERENCE, matrixAccess: access(),
      openRuntime: openRuntime as any, pollIntervalMs: 40,
    })
    const surface = mountSurface(conversation)
    await surface.importThread()

    const events: any[] = []
    for await (const event of conversation.run({
      type: 'threads.add_user_message',
      params: { thread_id: THREAD, input: { content: [{ type: 'input_text', text: 'Bob: on my way' }] } },
    })) events.push(event)

    expect(send).toHaveBeenCalledWith('Bob: on my way')
    expect(events.find((event) => event.type === 'thread.item.added').item.id).toBe('$bob-event')
    await vi.advanceTimersByTimeAsync(50)
    expect(surface.displayed).toContain('Alice: hello')
    expect(surface.displayed).toContain('Bob: on my way')
    surface.stop()
    conversation.dispose()
  })

  it('keeps the real permission reason available for the banner on 403', async () => {
    vi.useFakeTimers()
    const error = new Error('HTTP 403: 没有读取这个空间的权限')
    const onError = vi.fn()
    const conversation = createSharedRoomConversation({
      session: {} as any, reference: REFERENCE, matrixAccess: access(),
      openRuntime: (async () => ({
        reference: REFERENCE,
        loadMessages: vi.fn(async () => { throw error }),
        send: vi.fn(),
      })) as any,
      pollIntervalMs: 30,
      onError,
    })
    const surface = mountSurface(conversation)
    await vi.advanceTimersByTimeAsync(35)
    expect(onError).toHaveBeenCalledWith(error)
    expect(describeConversationLoadError(error)).toContain('HTTP 403')
    expect(describeConversationLoadError(error)).not.toMatch(/登录|logout/iu)
    surface.stop()
    conversation.dispose()
  })
})
