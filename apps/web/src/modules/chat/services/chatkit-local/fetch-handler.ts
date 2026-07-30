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
import { formatErrorForUser, isSolidAuthorizationExpired } from '@/lib/user-facing-errors'
import { LocalChatKitStore } from './store'
import { LocalChatKitService } from './service'

export interface LocalChatKitFetchOptions {
  db: SolidDatabase
  webId: string
  authFetch: typeof fetch
  selectedChatId?: string
  selectedThreadId?: string
  onAuthorizationExpired?: (error: unknown) => void
}

export function createLocalChatKitFetch(options: LocalChatKitFetchOptions): typeof fetch {
  const {
    db,
    webId,
    authFetch,
    selectedChatId,
    selectedThreadId,
    onAuthorizationExpired,
  } = options
  const store = new LocalChatKitStore(db, webId, authFetch)
  if (selectedChatId && selectedThreadId) {
    store.bindThreadToChat(selectedThreadId, selectedChatId)
  }
  const service = new LocalChatKitService({
    store,
    db,
    webId,
    authFetch,
    onAuthorizationExpired,
  })

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const attachmentId = readAttachmentUploadId(input)
      if (attachmentId && (init?.method ?? 'GET').toUpperCase() === 'PUT') {
        const existing = await store.loadAttachment(attachmentId, {})
        const mimeType = readUploadMimeType(init, existing)
        const bytes = await readUploadBytes(init?.body)
        const dataUrl = bytesToDataUrl(bytes, mimeType)
        const attachment = {
          ...existing,
          data_url: dataUrl,
          preview_url: mimeType.startsWith('image/') ? dataUrl : existing.preview_url,
          upload_descriptor: null,
        }
        await store.saveAttachment(attachment, {})
        return new Response(JSON.stringify(attachment), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
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

      const context = {}
      const result = await service.process(body, context)

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
      if (isSolidAuthorizationExpired(error)) {
        onAuthorizationExpired?.(error)
      }
      const message = formatErrorForUser(error, '聊天服务暂时不可用。请稍后重试。')
      return new Response(
        JSON.stringify({ error: { code: 'local_error', message } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }
  }
}

const ATTACHMENT_UPLOAD_PATH = '/__linx_chatkit_attachment__/'

function readAttachmentUploadId(input: RequestInfo | URL): string | null {
  const rawUrl = input instanceof Request ? input.url : String(input)
  try {
    const pathname = new URL(rawUrl, window.location.origin).pathname
    if (!pathname.startsWith(ATTACHMENT_UPLOAD_PATH)) return null
    return decodeURIComponent(pathname.slice(ATTACHMENT_UPLOAD_PATH.length))
  } catch {
    return null
  }
}

function readUploadMimeType(init: RequestInit | undefined, attachment: Record<string, unknown>): string {
  const headers = new Headers(init?.headers)
  return headers.get('Content-Type')
    || (typeof attachment.mime_type === 'string' ? attachment.mime_type : null)
    || 'application/octet-stream'
}

async function readUploadBytes(body: BodyInit | null | undefined): Promise<Uint8Array> {
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer())
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
  }
  if (typeof body === 'string') return new TextEncoder().encode(body)
  throw new Error('Attachment upload body is missing')
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}
