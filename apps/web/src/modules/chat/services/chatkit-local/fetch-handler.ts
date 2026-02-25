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

import type { SolidDatabase } from '@linx/models'
import { LocalChatKitStore } from './store'
import { LocalChatKitService } from './service'

export interface LocalChatKitFetchOptions {
  db: SolidDatabase
  webId: string
  authFetch: typeof fetch
}

export function createLocalChatKitFetch(options: LocalChatKitFetchOptions): typeof fetch {
  const { db, webId, authFetch } = options
  const store = new LocalChatKitStore(db, webId, authFetch)
  const service = new LocalChatKitService({ store, db, webId, authFetch })

  return async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    console.log('[LocalChatKitFetch] Intercepted request:', String(_input))
    try {
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

      const context = {}
      console.log('[LocalChatKitFetch] Request body:', body.slice(0, 200))
      const result = await service.process(body, context)
      console.log('[LocalChatKitFetch] Result type:', result.type)

      if (result.type === 'streaming') {
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

      // Non-streaming
      return new Response(result.json, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error: any) {
      console.error('[LocalChatKitFetch] Error:', error)
      return new Response(
        JSON.stringify({ error: { code: 'local_error', message: error.message } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }
  }
}
