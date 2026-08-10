import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  process: vi.fn(),
  addThreadItem: vi.fn(),
  generateItemId: vi.fn(() => 'assistant-artifact'),
}))

vi.mock('../store', () => ({
  LocalChatKitStore: class LocalChatKitStore {
    refreshThreadItems = vi.fn()
    loadAttachmentObjectUrl = vi.fn()
    addThreadItem = mocks.addThreadItem
    generateItemId = mocks.generateItemId
    loadThread = vi.fn(async (threadId: string) => ({ id: threadId, status: { type: 'active' }, created_at: 1, updated_at: 1 }))
    dispose = vi.fn()
  },
}))

vi.mock('../service', () => ({
  LocalChatKitService: class LocalChatKitService {
    process = mocks.process
  },
}))

import { createLocalChatKitFetch } from '../fetch-handler'
import { enqueueChatGeneration, listChatGenerationOutbox } from '../generation-outbox'

function streamingResult(events: Array<Record<string, unknown>>) {
  const encoder = new TextEncoder()
  return {
    type: 'streaming' as const,
    stream: async function* () {
      for (const event of events) {
        yield encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
      }
    },
  }
}

describe('LocalChatKitFetch generation outbox', () => {
  const webId = 'https://id.example/alice#me'

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => vi.restoreAllMocks())

  it('replays queued generations in order and removes successful entries', async () => {
    enqueueChatGeneration({ accountScope: webId, threadId: 'thread-1', userItemId: 'user-1' })
    enqueueChatGeneration({ accountScope: webId, threadId: 'thread-2', userItemId: 'user-2' })
    const outboxCounts: number[] = []
    mocks.process.mockResolvedValue(streamingResult([{ type: 'thread.item.done' }]))
    const localFetch = createLocalChatKitFetch({
      db: {} as any,
      webId,
      authFetch: vi.fn() as any,
      onOutboxChange: (count) => outboxCounts.push(count),
    })

    const result = await localFetch.flushOutbox()

    expect(result).toEqual({ completed: 2, pending: 0 })
    expect(mocks.process).toHaveBeenNthCalledWith(1, expect.stringContaining('"thread_id":"thread-1"'), {})
    expect(mocks.process).toHaveBeenNthCalledWith(2, expect.stringContaining('"thread_id":"thread-2"'), {})
    expect(listChatGenerationOutbox(webId)).toEqual([])
    expect(outboxCounts.at(-1)).toBe(0)
  })

  it('keeps the failed entry and later entries queued after a replay error', async () => {
    enqueueChatGeneration({ accountScope: webId, threadId: 'thread-1', userItemId: 'user-1' })
    enqueueChatGeneration({ accountScope: webId, threadId: 'thread-2', userItemId: 'user-2' })
    mocks.process.mockResolvedValue(streamingResult([{
      type: 'error',
      error: { message: 'provider remains unavailable' },
    }]))
    const localFetch = createLocalChatKitFetch({ db: {} as any, webId, authFetch: vi.fn() as any })

    const result = await localFetch.flushOutbox()

    expect(result).toEqual({ completed: 0, pending: 2 })
    expect(mocks.process).toHaveBeenCalledTimes(1)
    expect(listChatGenerationOutbox(webId)[0]).toEqual(expect.objectContaining({ attempts: 1 }))
  })

  it('coalesces concurrent reconnect flushes so one queued generation is replayed once', async () => {
    enqueueChatGeneration({ accountScope: webId, threadId: 'thread-1', userItemId: 'user-1' })
    mocks.process.mockResolvedValue(streamingResult([{ type: 'thread.item.done' }]))
    const localFetch = createLocalChatKitFetch({ db: {} as any, webId, authFetch: vi.fn() as any })

    const [first, second] = await Promise.all([
      localFetch.flushOutbox(),
      localFetch.flushOutbox(),
    ])

    expect(first).toEqual({ completed: 1, pending: 0 })
    expect(second).toEqual(first)
    expect(mocks.process).toHaveBeenCalledTimes(1)
  })

  it('writes edited Canvas content as a new Pod file and records a versioned chat artifact', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_723_344_000_000)
    const authFetch = vi.fn(async () => new Response('', { status: 201 }))
    const localFetch = createLocalChatKitFetch({ db: {} as any, webId, authFetch: authFetch as any })

    const result = await localFetch.saveArtifactVersion({
      threadId: 'thread-1',
      uri: 'https://pod.example/work/plan.md',
      name: 'plan.md',
      mimeType: 'text/markdown',
      content: '# Updated plan',
    })

    expect(result.uri).toBe('https://pod.example/work/plan.v-1723344000000.md')
    expect(authFetch).toHaveBeenCalledWith(result.uri, expect.objectContaining({
      method: 'PUT',
      body: '# Updated plan',
    }))
    expect(mocks.addThreadItem).toHaveBeenCalledWith('thread-1', expect.objectContaining({
      id: 'assistant-artifact',
      artifacts: [expect.objectContaining({ resourceUri: result.uri, type: 'artifact' })],
    }), {})
  })
})
