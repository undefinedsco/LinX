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
  it('reads a thread beyond the model-history window through stable Pod-side cursor pages', { timeout: 120_000 }, async () => {
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

      const messageCount = 125
      for (let index = 0; index < messageCount; index += 1) {
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

      const text = (item: ThreadItem) => item.type === 'assistant_message'
        ? item.content[0]?.text
        : undefined
      const pages: ThreadItem[][] = []
      const cursors = new Set<string>()
      let after: string | undefined
      let hasMore = true
      while (hasMore) {
        const page = await reader.loadThreadItems(thread.id, after, 40, 'asc', {})
        pages.push(page.data)
        hasMore = page.has_more
        if (hasMore) {
          expect(page.last_id).toMatch(/^linx-chat-cursor:/u)
          expect(cursors.has(page.last_id!)).toBe(false)
          cursors.add(page.last_id!)
          after = page.last_id
        }
      }

      expect(pages.map((page) => page.length)).toEqual([40, 40, 40, 5])
      const allItems = pages.flat()
      expect(new Set(allItems.map((item) => item.id)).size).toBe(messageCount)
      expect(allItems.map(text)).toEqual(
        Array.from({ length: messageCount }, (_, index) => `answer ${index}`),
      )
    } finally {
      reader.dispose()
      writer.dispose()
      await reader.deleteThread(thread.id, {}).catch(() => undefined)
    }
  })
})
