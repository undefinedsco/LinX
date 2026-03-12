import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  loadThreadItems: vi.fn(),
  process: vi.fn(),
}))

vi.mock('../store', () => ({
  LocalChatKitStore: class LocalChatKitStore {
    loadThreadItems = mocked.loadThreadItems
  },
}))

vi.mock('../service', () => ({
  LocalChatKitService: class LocalChatKitService {
    process = mocked.process
  },
}))

import { continueRuntimeToolCallFromInbox } from '../runtime-tool-response'

function createStreamingResult(events: unknown[]) {
  const encoder = new TextEncoder()
  return {
    type: 'streaming' as const,
    async *stream() {
      for (const event of events) {
        yield encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
      }
    },
  }
}

describe('continueRuntimeToolCallFromInbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('finds the latest matching client_tool_call and forwards it to local ChatKit', async () => {
    mocked.loadThreadItems.mockResolvedValue({
      data: [
        { id: 'tool-old', type: 'client_tool_call', call_id: 'call-1' },
        { id: 'other', type: 'assistant_message' },
        { id: 'tool-latest', type: 'client_tool_call', call_id: 'call-1' },
      ],
      has_more: false,
    })
    mocked.process.mockResolvedValue(createStreamingResult([
      { type: 'thread.item.done', item: { id: 'assistant-1' } },
    ]))

    await continueRuntimeToolCallFromInbox({
      db: {} as any,
      webId: 'https://alice.example/profile/card#me',
      authFetch: vi.fn() as any,
      threadId: 'thread-1',
      toolCallId: 'call-1',
      output: '{"decision":"approved"}',
    })

    expect(mocked.loadThreadItems).toHaveBeenCalledWith('thread-1', undefined, 500, 'asc', {})
    expect(mocked.process).toHaveBeenCalledWith(JSON.stringify({
      type: 'threads.add_client_tool_output',
      params: {
        thread_id: 'thread-1',
        item_id: 'tool-latest',
        output: '{"decision":"approved"}',
      },
    }), {})
  })

  it('throws when the continuation stream reports an error event', async () => {
    mocked.loadThreadItems.mockResolvedValue({
      data: [
        { id: 'tool-latest', type: 'client_tool_call', call_id: 'call-1' },
      ],
      has_more: false,
    })
    mocked.process.mockResolvedValue(createStreamingResult([
      { type: 'error', error: { message: 'runtime failed' } },
    ]))

    await expect(continueRuntimeToolCallFromInbox({
      db: {} as any,
      webId: 'https://alice.example/profile/card#me',
      authFetch: vi.fn() as any,
      threadId: 'thread-1',
      toolCallId: 'call-1',
      output: '{"decision":"rejected"}',
    })).rejects.toThrow('runtime failed')
  })
})
