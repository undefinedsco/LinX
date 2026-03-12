import type { SolidDatabase } from '@linx/models'
import type { ThreadItem } from '@/lib/vendor/xpod-chatkit'
import { LocalChatKitStore } from './store'
import { LocalChatKitService, type ChatKitResult } from './service'

interface ContinueRuntimeToolCallOptions {
  db: SolidDatabase
  webId: string
  authFetch: typeof fetch
  threadId: string
  toolCallId: string
  output: string
}

function isClientToolCallItem(item: ThreadItem, toolCallId: string): item is Extract<ThreadItem, { type: 'client_tool_call' }> {
  return item.type === 'client_tool_call' && item.call_id === toolCallId
}

async function drainStreamingResult(result: ChatKitResult): Promise<void> {
  if (result.type !== 'streaming') {
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''

  for await (const chunk of result.stream()) {
    buffer += decoder.decode(chunk, { stream: true })

    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      boundary = buffer.indexOf('\n\n')

      if (!rawEvent.trim()) continue

      const payload = rawEvent
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n')

      if (!payload) continue

      const event = JSON.parse(payload) as { type?: string; error?: { message?: string } }
      if (event.type === 'error') {
        throw new Error(event.error?.message || 'Runtime tool response failed')
      }
    }
  }
}

export async function continueRuntimeToolCallFromInbox(options: ContinueRuntimeToolCallOptions): Promise<void> {
  const context = {}
  const store = new LocalChatKitStore(options.db, options.webId, options.authFetch)
  const service = new LocalChatKitService({
    store,
    db: options.db,
    webId: options.webId,
    authFetch: options.authFetch,
  })

  const items = await store.loadThreadItems(options.threadId, undefined, 500, 'asc', context)
  const toolItem = [...items.data]
    .reverse()
    .find((item) => isClientToolCallItem(item, options.toolCallId))

  if (!toolItem) {
    throw new Error(`Client tool call item not found for ${options.toolCallId}`)
  }

  const result = await service.process(JSON.stringify({
    type: 'threads.add_client_tool_output',
    params: {
      thread_id: options.threadId,
      item_id: toolItem.id,
      output: options.output,
    },
  }), context)

  await drainStreamingResult(result)
}
