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
import { nowTimestamp, type Attachment, type ThreadItem, type ThreadMetadata } from '@/lib/vendor/xpod-chatkit'
import { formatErrorForUser } from '@/lib/user-facing-errors'
import { LocalChatKitStore } from './store'
import { LocalChatKitService } from './service'
import {
  enqueueChatGeneration,
  listChatGenerationOutbox,
  markChatGenerationAttempt,
  nextChatGenerationAttemptAt,
  removeChatGeneration,
} from './generation-outbox'

export interface LocalChatKitFetchOptions {
  db: SolidDatabase
  webId: string
  authFetch: typeof fetch
  initialThread?: ThreadMetadata
  isAvailable?: () => boolean
  onAttachmentsChange?: (attachments: Attachment[]) => void
  onStreamingChange?: (state: { active: boolean; abort?: () => void }) => void
  onThreadItemsChange?: (items: ThreadItem[]) => void
  onOutboxChange?: (count: number) => void
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
    onOutboxChange,
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
  const replayDeferredUserItemIds = new Set<string>()
  const notifyOutboxChange = () => {
    onOutboxChange?.(listChatGenerationOutbox(webId).length)
  }
  const service = new LocalChatKitService({
    store,
    db,
    webId,
    authFetch,
    onGenerationDeferred: (entry) => {
      replayDeferredUserItemIds.add(entry.userItemId)
      enqueueChatGeneration({
        accountScope: webId,
        threadId: entry.threadId,
        userItemId: entry.userItemId,
        inferenceOptions: entry.inferenceOptions,
      })
      notifyOutboxChange()
    },
  })
  let outboxFlushPromise: Promise<{ completed: number; pending: number }> | null = null

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
  localFetch.getOutboxSize = () => listChatGenerationOutbox(webId).length
  localFetch.getOutboxRetryAt = () => nextChatGenerationAttemptAt(webId)
  const flushOutbox = async (force: boolean) => {
    let completed = 0

    for (const entry of listChatGenerationOutbox(webId)) {
      if (!force && (entry.nextAttemptAt ?? entry.queuedAt) > Date.now()) break
      markChatGenerationAttempt(webId, entry.id)
      replayDeferredUserItemIds.delete(entry.userItemId)
      try {
        const result = await service.process(JSON.stringify({
          type: 'threads.custom_action',
          params: {
            action: {
              type: 'message.regenerate',
              payload: {
                action: 'message.regenerate',
                thread_id: entry.threadId,
                item_id: entry.userItemId,
              },
            },
          },
        }), {})

        if (result.type === 'streaming') {
          const decoder = new TextDecoder()
          let payload = ''
          for await (const chunk of result.stream()) {
            payload += decoder.decode(chunk, { stream: true })
          }
          payload += decoder.decode()
          for (const line of payload.split(/\r?\n/u)) {
            if (!line.startsWith('data:')) continue
            try {
              const event = JSON.parse(line.slice(5).trim()) as { type?: string; error?: { message?: string } }
              if (event.type === 'error') {
                throw new Error(event.error?.message ?? 'Queued generation failed')
              }
            } catch (error) {
              if (error instanceof SyntaxError) continue
              throw error
            }
          }
        }

        if (replayDeferredUserItemIds.has(entry.userItemId)) break
        removeChatGeneration(webId, entry.id)
        completed += 1
        notifyOutboxChange()
      } catch (error) {
        console.warn('[LocalChatKitFetch] Queued generation replay failed:', error)
        break
      }
    }

    const pending = listChatGenerationOutbox(webId).length
    notifyOutboxChange()
    return { completed, pending }
  }
  localFetch.flushOutbox = (options?: { force?: boolean }) => {
    if (outboxFlushPromise) return outboxFlushPromise
    outboxFlushPromise = flushOutbox(options?.force ?? false).finally(() => {
      outboxFlushPromise = null
    })
    return outboxFlushPromise
  }
  localFetch.loadAttachmentObjectUrl = (attachmentId: string) => store.loadAttachmentObjectUrl(attachmentId)
  localFetch.prepareAttachmentForReuse = async (attachment: Attachment) => {
    await store.saveAttachment({ ...attachment, upload_descriptor: null }, {})
    const objectUrl = await store.loadAttachmentObjectUrl(attachment.id)
    return {
      ...attachment,
      upload_descriptor: null,
      ...(attachment.type === 'image' ? { preview_url: objectUrl } : {}),
      download_url: objectUrl,
    }
  }
  localFetch.saveArtifactVersion = async (input: Parameters<LocalChatKitFetch['saveArtifactVersion']>[0]) => {
    const sourceUrl = new URL(input.uri)
    const sourceName = sourceUrl.pathname.split('/').pop() || input.name
    const extensionIndex = sourceName.lastIndexOf('.')
    const stem = extensionIndex > 0 ? sourceName.slice(0, extensionIndex) : sourceName
    const extension = extensionIndex > 0 ? sourceName.slice(extensionIndex) : ''
    const versionName = `${stem}.v-${Date.now()}${extension}`
    sourceUrl.pathname = `${sourceUrl.pathname.slice(0, sourceUrl.pathname.lastIndexOf('/') + 1)}${encodeURIComponent(versionName)}`
    const contentType = input.mimeType || 'text/plain; charset=utf-8'
    const response = await authFetch(sourceUrl.href, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: input.content,
    })
    if (!response.ok) throw new Error(`Artifact version write failed with HTTP ${response.status}`)
    const createdAt = nowTimestamp()
    const thread = await store.loadThread(input.threadId, {})
    const item = {
      id: store.generateItemId('assistant_message', thread, {}),
      thread_id: input.threadId,
      type: 'assistant_message',
      content: [{ type: 'output_text', text: `已将「${input.name}」保存为新版本 ${versionName}。` }],
      status: 'completed',
      created_at: createdAt,
      artifacts: [{
        type: 'artifact',
        name: input.name,
        fileName: input.name,
        resourceUri: sourceUrl.href,
        contentType,
        fileSize: new TextEncoder().encode(input.content).byteLength,
      }],
    } as ThreadItem & { artifacts: unknown[] }
    try {
      await store.addThreadItem(input.threadId, item, {})
    } catch (error) {
      await authFetch(sourceUrl.href, { method: 'DELETE' }).catch(() => undefined)
      throw error
    }
    return { uri: sourceUrl.href, name: versionName, createdAt }
  }
  localFetch.dispose = () => store.dispose()
  return localFetch
}

export type LocalChatKitFetch = typeof fetch & {
  refreshThreadItems: (threadId: string) => Promise<void>
  getOutboxSize: () => number
  getOutboxRetryAt: () => number | null
  flushOutbox: (options?: { force?: boolean }) => Promise<{ completed: number; pending: number }>
  loadAttachmentObjectUrl: (attachmentId: string) => Promise<string>
  prepareAttachmentForReuse: (attachment: Attachment) => Promise<Attachment>
  saveArtifactVersion: (input: {
    threadId: string
    uri: string
    name: string
    mimeType?: string | null
    content: string
  }) => Promise<{ uri: string; name: string; createdAt: number }>
  dispose: () => void
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
