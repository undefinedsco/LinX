/**
 * Local ChatKit Fetch Handler
 *
 * Returns a `fetch`-compatible function that intercepts ChatKit requests
 * and routes them to the local (browser-side) ChatKitService + Store.
 *
 * The ChatKit SDK calls `api.fetch(url, init)` — this handler processes
 * the request body locally and returns a proper Response object,
 * completely bypassing the API server.
 */

import type { SolidDatabase } from '@undefineds.co/models'
import type { Attachment, ThreadItem, ThreadMetadata } from '@/lib/vendor/xpod-chatkit'
import { formatErrorForUser } from '@/lib/user-facing-errors'
import { LocalChatKitStore } from './store'
import { LocalChatKitService } from './service'

export interface LocalChatKitFetchOptions {
  db: SolidDatabase
  webId: string
  authFetch: typeof fetch
  initialThread?: ThreadMetadata
  isAvailable?: () => boolean
  onAttachmentsChange?: (attachments: Attachment[]) => void
  onStreamingChange?: (state: { active: boolean; abort?: () => void }) => void
  onThreadItemsChange?: (items: ThreadItem[]) => void
  onChatSummaryChange?: (summary: {
    chatId: string
    messageId: string
    content: string
    createdAt: Date
  }) => Promise<void> | void
}

export function createLocalChatKitFetch(options: LocalChatKitFetchOptions): LocalChatKitFetch {
  const {
    db,
    webId,
    authFetch,
    initialThread,
    isAvailable = () => true,
    onAttachmentsChange,
    onStreamingChange,
    onThreadItemsChange,
    onChatSummaryChange,
  } = options
  const store = new LocalChatKitStore(
    db,
    webId,
    authFetch,
    initialThread,
    onAttachmentsChange,
    onChatSummaryChange,
    onThreadItemsChange,
  )
  const service = new LocalChatKitService({ store, db, webId, authFetch })

  const localFetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!isAvailable()) {
      return unavailableResponse()
    }

    try {
      const inputUrl = typeof _input === 'string' ? _input : _input.toString()
      const attachmentMatch = inputUrl.match(/^local:\/\/chatkit\/attachments\/([^/?#]+)$/)
      if (attachmentMatch && init?.method?.toUpperCase() === 'PUT') {
        if (!init.body) throw new Error('Attachment upload body is missing')
        const attachment = await service.uploadAttachment(
          decodeURIComponent(attachmentMatch[1]),
          init.body,
          new Headers(init.headers).get('Content-Type') ?? undefined,
          init.signal ?? undefined,
        )
        return Response.json(attachment)
      }

      // Read request body
      let body: string
      if (init?.body instanceof ReadableStream) {
        const reader = init.body.getReader()
        const chunks: Uint8Array[] = []
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) chunks.push(value)
        }
        body = new TextDecoder().decode(
          chunks.reduce((acc, chunk) => {
            const merged = new Uint8Array(acc.length + chunk.length)
            merged.set(acc)
            merged.set(chunk, acc.length)
            return merged
          }, new Uint8Array(0)),
        )
      } else if (typeof init?.body === 'string') {
        body = init.body
      } else if (init?.body instanceof ArrayBuffer || init?.body instanceof Uint8Array) {
        body = new TextDecoder().decode(init.body)
      } else {
        body = '{}'
      }

      const requestController = onStreamingChange ? new AbortController() : null
      const abortFromCaller = () => requestController?.abort(init?.signal?.reason)
      if (requestController) {
        init?.signal?.addEventListener('abort', abortFromCaller, { once: true })
        if (init?.signal?.aborted) abortFromCaller()
      }

      const context = { signal: requestController?.signal ?? init?.signal }
      const result = await service.process(body, context)

      if (result.type === 'streaming') {
        onStreamingChange?.({ active: true, abort: () => requestController?.abort('user_cancelled') })
        // Build a ReadableStream from the async generator
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              for await (const chunk of result.stream()) {
                controller.enqueue(chunk)
              }
              controller.close()
            } catch (err) {
              controller.error(err)
            } finally {
              init?.signal?.removeEventListener('abort', abortFromCaller)
              onStreamingChange?.({ active: false })
            }
          },
        })

        return new Response(stream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        })
      }

      init?.signal?.removeEventListener('abort', abortFromCaller)

      // Non-streaming
      return new Response(result.json, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error: any) {
      console.error('[LocalChatKitFetch] Error:', error)
      const message = formatErrorForUser(error, '聊天服务暂时不可用。请稍后重试。')
      return new Response(
        JSON.stringify({ error: { code: 'local_error', message } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }
  }
  localFetch.refreshThreadItems = async (threadId: string) => {
    await store.refreshThreadItems(threadId, {})
  }
  return localFetch
}

export type LocalChatKitFetch = typeof fetch & {
  refreshThreadItems: (threadId: string) => Promise<void>
}

export function unavailableResponse(): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: 'space_unavailable',
        message: '当前空间连接尚未恢复，请稍后重试。',
      },
    }),
    { status: 503, headers: { 'Content-Type': 'application/json' } },
  )
}
