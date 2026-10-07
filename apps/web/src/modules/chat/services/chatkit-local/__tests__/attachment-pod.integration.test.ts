// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import { Chat, Message, Thread } from '@/lib/vendor/xpod-chatkit'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '@/test/xpod-integration'
import { createLocalChatKitFetch } from '../fetch-handler'

const schema = { Chat, Thread, Message }
let context: XpodIntegrationContext<typeof schema> | null = null

async function getContext() {
  context ??= await createXpodIntegrationContext({
    schema,
    resources: [Chat, Thread, Message],
  })
  return context
}

afterAll(async () => context?.stop(), 90_000)

describe('ChatKit attachment Pod integration', () => {
  it('creates, uploads, reads, and deletes an attachment through the real Pod', { timeout: 90_000 }, async () => {
    const { db, webId } = await getContext()
    const sessionFetch = db.getDialect().getAuthenticatedFetch()
    if (typeof sessionFetch !== 'function') throw new Error('Authenticated Pod fetch is unavailable')
    const authFetch: typeof fetch = (input, init) => sessionFetch(input as RequestInfo | URL, init)
    const localFetch = createLocalChatKitFetch({ db, webId, authFetch })

    const createdResponse = await localFetch('local://chatkit', {
      method: 'POST',
      body: JSON.stringify({
        type: 'attachments.create',
        params: { name: 'qa.txt', size: 11, mime_type: 'text/plain' },
      }),
    })
    expect(createdResponse.ok).toBe(true)
    const created = await createdResponse.json() as {
      id: string
      upload_descriptor: { url: string; method: 'PUT'; headers: Record<string, string> }
    }

    const uploadResponse = await localFetch(created.upload_descriptor.url, {
      method: created.upload_descriptor.method,
      headers: created.upload_descriptor.headers,
      body: new Blob(['hello pod!'], { type: 'text/plain' }),
    })
    expect(uploadResponse.ok).toBe(true)

    const podBase = db.getDialect().getPodUrl()!.replace(/\/?$/, '/')
    const resourceUrl = new URL(`.data/chat-attachments/${encodeURIComponent(created.id)}`, podBase)
    const stored = await authFetch(resourceUrl)
    expect(stored.ok).toBe(true)
    expect(await stored.text()).toBe('hello pod!')

    const deleteResponse = await localFetch('local://chatkit', {
      method: 'POST',
      body: JSON.stringify({ type: 'attachments.delete', params: { attachment_id: created.id } }),
    })
    expect(deleteResponse.ok).toBe(true)
    expect((await authFetch(resourceUrl)).status).toBe(404)
  })
})
