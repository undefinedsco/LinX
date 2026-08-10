// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import { Chat, Message, Thread, type ThreadItem, type ThreadMetadata } from '@/lib/vendor/xpod-chatkit'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '@/test/xpod-integration'
import { LocalChatKitStore } from '../store'

const chatkitSchema = { Chat, Thread, Message }
let context: XpodIntegrationContext<typeof chatkitSchema> | null = null

async function getContext(): Promise<XpodIntegrationContext<typeof chatkitSchema>> {
  if (context) return context
  context = await createXpodIntegrationContext({
    schema: chatkitSchema,
    resources: [Chat, Thread, Message],
  })
  return context
}

afterAll(async () => {
  await context?.stop()
}, 90_000)

describe('LocalChatKitStore Pod cursor pagination', () => {
  it('reads a long thread through stable Pod-side cursor pages', { timeout: 90_000 }, async () => {
    const { db, webId } = await getContext()
    const authFetch = db.getDialect().getAuthenticatedFetch()
    if (typeof authFetch !== 'function') throw new Error('Authenticated integration fetch is unavailable')

    const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
    const thread: ThreadMetadata = {
      id: `pagination-thread-${suffix}`,
      status: { type: 'active' },
      created_at: 1_800_000_000,
      updated_at: 1_800_000_000,
      metadata: { chat_id: `pagination-chat-${suffix}` },
    }
    const writer = new LocalChatKitStore(db, webId, authFetch, thread)
    const reader = new LocalChatKitStore(db, webId, authFetch, thread)
    try {
      await writer.saveThread(thread, {})

      for (let index = 0; index < 25; index += 1) {
        const item: ThreadItem = {
          id: `assistant-${String(index).padStart(2, '0')}`,
          thread_id: thread.id,
          type: 'assistant_message',
          content: [{ type: 'output_text', text: `answer ${index}`, annotations: [] }],
          attachments: [],
          status: 'in_progress',
          created_at: 1_800_000_000 + index,
        }
        await writer.addThreadItem(thread.id, item, {})
      }

      const first = await reader.loadThreadItems(thread.id, undefined, 10, 'asc', {})
      const second = await reader.loadThreadItems(thread.id, first.last_id, 10, 'asc', {})
      const third = await reader.loadThreadItems(thread.id, second.last_id, 10, 'asc', {})
      const text = (item: ThreadItem) => item.type === 'assistant_message'
        ? item.content[0]?.text
        : undefined

      expect(first.data.map(text)).toEqual(
        Array.from({ length: 10 }, (_, index) => `answer ${index}`),
      )
      expect(second.data.map(text)).toEqual(
        Array.from({ length: 10 }, (_, index) => `answer ${index + 10}`),
      )
      expect(third.data.map(text)).toEqual(
        Array.from({ length: 5 }, (_, index) => `answer ${index + 20}`),
      )
      expect(first.has_more).toBe(true)
      expect(second.has_more).toBe(true)
      expect(third.has_more).toBe(false)
      expect(first.last_id).toMatch(/^linx-chat-cursor:/u)
    } finally {
      reader.dispose()
      writer.dispose()
      await reader.deleteThread(thread.id, {}).catch(() => undefined)
    }
  })
})
