/**
 * Local (Browser) ChatKit Service
 *
 * Ports the xpod ChatKitService logic to run entirely in the browser.
 * Uses LocalChatKitStore for Pod persistence and shared models to read AI API
 * keys from the Pod.
 *
 * No API server round-trip — fetch goes directly to the AI provider.
 */

import { resolveLinxRuntimeApiBaseUrlForIssuerUrl } from '@undefineds.co/models/client'
import type { ChatKitStore, StoreContext } from '@/lib/vendor/xpod-chatkit'
import {
  extractUserMessageText,
  generateId,
  isStreamingReq,
  nowTimestamp,
  type ChatKitReq,
  type NonStreamingReq,
  type StreamingReq,
  type ThreadItem,
  type ThreadMetadata,
  type ThreadStreamEvent,
} from '@/lib/vendor/xpod-chatkit'
import {
  agentResource,
  aiProviderResource,
  chatResource,
  contactResource,
  credentialResource,
  extractChatIdFromChatRef,
  getDefaultAIConfigCredentialId,
  normalizeAIConfigProviderId,
  normalizeAIConfigResourceId,
  selectAIConfigCredential,
  type AgentRow,
  type ContactRow,
  type SolidDatabase,
} from '@undefineds.co/models'
import {
  asResourceIri,
  requireRowResourceId,
  type ResourceIri,
} from '@/lib/data/resource-identity'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { formatErrorForUser, isSolidAuthorizationExpired } from '@/lib/user-facing-errors'
import { RuntimeSidecarSink } from './runtime-sidecar'
import { sendMatrixThreadMessage } from '../../matrix-service'
import { withThreadComposerModel } from '../../composer-model-preference'
import {
  DEFAULT_AGENT_AI_RUNTIME_LOCATION,
  readAgentAiRuntimeLocation,
  type AgentAiRuntimeLocation,
} from '../../agent-runtime-location'
import { readAgentHomeModel } from '../../agent-home'

function readChatIdFromThread(thread: ThreadMetadata): string | null {
  if (typeof thread.metadata?.chat_id !== 'string') {
    return null
  }
  return extractChatIdFromChatRef(thread.metadata.chat_id) ?? thread.metadata.chat_id
}

function requireRowId(row: Record<string, unknown> | null | undefined, label: string): string {
  return requireRowResourceId(row as { id?: string | null }, label)
}

function resolveContactIri(db: SolidDatabase, contact: Pick<ContactRow, 'id'>): ResourceIri {
  const id = requireRowId(contact, 'Contact row')
  return asResourceIri(db.resolveRowIri(contactResource as any, { id }), 'Contact IRI')
}

function contactMatchesRef(db: SolidDatabase, contact: ContactRow | null | undefined, ref: string): boolean {
  if (!contact || !ref) return false
  return contact.id === ref || resolveContactIri(db, contact) === ref
}

function isMissingExactReadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  return /404|not found|missing/i.test(message)
}

function isUnsupportedCollectionReadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  return /collection queries over plain LDP are not supported|Configure a global query capability/i.test(message)
}

export interface LocalServiceOptions {
  store: ChatKitStore<StoreContext>
  db: SolidDatabase
  webId: string
  authFetch: typeof fetch
  systemPrompt?: string
  onAuthorizationExpired?: (error: unknown) => void
}

export interface StreamingResult {
  type: 'streaming'
  stream(): AsyncIterable<Uint8Array>
}

export interface NonStreamingResult {
  type: 'non_streaming'
  json: string
}

export type ChatKitResult = StreamingResult | NonStreamingResult

type RuntimeThreadStatus = 'idle' | 'active' | 'paused' | 'completed' | 'error'

interface RuntimeThreadRecord {
  id: string
  threadId: string
  container?: string
  workspaceKind?: 'local-folder' | 'local-worktree' | 'pod-container'
  title: string
  repoPath?: string
  folderPath?: string
  tool: string
  status: RuntimeThreadStatus
  tokenUsage: number
}

interface ThreadAgentConfig {
  provider: string
  model: string
  instructions?: string
  aiRuntimeLocation: AgentAiRuntimeLocation
}


function normalizePlatformRuntimeModel(value: unknown): 'linx-lite' | 'linx' | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized) return null

  if (normalized === 'linx-lite' || normalized === 'linx') {
    return normalized
  }

  if (normalized === 'undefineds/linx-lite') {
    return 'linx-lite'
  }

  if (normalized === 'undefineds/linx') {
    return 'linx'
  }

  return null
}

function parseRequestedProviderModel(value: unknown): { provider: string; model: string } | null {
  if (typeof value !== 'string') return null
  const separator = value.indexOf('::')
  if (separator <= 0 || separator >= value.length - 2) return null
  const provider = normalizeAIConfigProviderId(value.slice(0, separator))
  const model = normalizeAIConfigResourceId(value.slice(separator + 2))
  return provider && model ? { provider, model } : null
}

type RuntimeThreadEvent =
  | { type: 'meta'; ts: number; threadId: string }
  | { type: 'status'; ts: number; threadId: string; status: RuntimeThreadStatus }
  | { type: 'stdout'; ts: number; threadId: string; text: string }
  | { type: 'stderr'; ts: number; threadId: string; text: string }
  | { type: 'assistant_delta'; ts: number; threadId: string; text: string }
  | { type: 'assistant_done'; ts: number; threadId: string; text: string }
  | { type: 'auth_required'; ts: number; threadId: string; method: string; url?: string; message?: string; options?: Array<{ label?: string; url?: string; method?: string }> }
  | { type: 'tool_call'; ts: number; threadId: string; requestId: string; name: string; arguments: string }
  | { type: 'exit'; ts: number; threadId: string; code: number | null; signal?: string }
  | { type: 'error'; ts: number; threadId: string; message: string }

type ChatCompletionContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string; detail: 'auto' } }
    >

type ChatCompletionMessage = {
  role: string
  content: ChatCompletionContent
}

export class LocalChatKitService {
  private store: ChatKitStore<StoreContext>
  private db: SolidDatabase
  private webId: string
  private authFetch: typeof fetch
  private systemPrompt: string
  private runtimeSidecar: RuntimeSidecarSink
  private onAuthorizationExpired?: (error: unknown) => void

  constructor(options: LocalServiceOptions) {
    this.store = options.store
    this.db = options.db
    this.webId = options.webId
    this.authFetch = options.authFetch
    this.systemPrompt = options.systemPrompt ?? 'You are a helpful assistant.'
    this.onAuthorizationExpired = options.onAuthorizationExpired
    this.runtimeSidecar = new RuntimeSidecarSink(this.db, this.webId)
  }

  async process(requestBody: string, context: StoreContext): Promise<ChatKitResult> {
    let request: ChatKitReq
    try {
      request = JSON.parse(requestBody)
    } catch {
      throw new Error('Invalid JSON request body')
    }

    if (isStreamingReq(request)) {
      return {
        type: 'streaming',
        stream: () => this.processStreamingAsBytes(request, context),
      }
    }

    const result = await this.processNonStreaming(request, context)
    return {
      type: 'non_streaming',
      json: JSON.stringify(result),
    }
  }

  private async *processStreamingAsBytes(
    request: StreamingReq,
    context: StoreContext,
  ): AsyncIterable<Uint8Array> {
    const encoder = new TextEncoder()

    try {
      for await (const event of this.processStreaming(request, context)) {
        yield encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
      }
    } catch (error: any) {
      console.error('[LocalChatKitService] Streaming request failed:', error)
      if (isSolidAuthorizationExpired(error)) {
        this.onAuthorizationExpired?.(error)
      }
      const userMessage = formatErrorForUser(error, '消息生成失败。请稍后重试。')
      const errorEvent = {
        type: 'error',
        error: {
          code: 'internal_error',
          message: userMessage,
        },
      }
      yield encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`)
    }
  }

  private async *processStreaming(
    request: StreamingReq,
    context: StoreContext,
  ): AsyncIterable<ThreadStreamEvent> {
    switch (request.type) {
      case 'threads.create':
        yield* this.handleThreadsCreate(request.params, context, request.metadata)
        break
      case 'threads.add_user_message':
        yield* this.handleThreadsAddUserMessage(request.params, context)
        break
      case 'threads.add_client_tool_output':
        yield* this.handleThreadsAddClientToolOutput(request.params, context)
        break
      case 'threads.retry_after_item':
        yield* this.handleThreadsRetryAfterItem(request.params, context)
        break
      case 'threads.custom_action':
        break
    }
  }

  private async processNonStreaming(
    request: NonStreamingReq,
    context: StoreContext,
  ): Promise<unknown> {
    switch (request.type) {
      case 'threads.get_by_id':
        return this.handleThreadsGetById(request.params, context)
      case 'threads.list':
        return this.handleThreadsList(request.params, context)
      case 'items.list':
        return this.handleItemsList(request.params, context)
      case 'items.feedback':
        return { success: true }
      case 'attachments.create':
        return this.handleAttachmentsCreate(request.params, context)
      case 'attachments.delete':
        await this.store.deleteAttachment(request.params.attachment_id, context)
        return { success: true }
      case 'threads.update':
        return this.handleThreadsUpdate(request.params, context)
      case 'threads.delete':
        return this.handleThreadsDelete(request.params, context)
      default:
        return null
    }
  }

  private async *handleThreadsCreate(
    params: any,
    context: StoreContext,
    metadata?: Record<string, unknown>,
  ): AsyncIterable<ThreadStreamEvent> {
    const threadId = this.store.generateThreadId(context)
    const now = nowTimestamp()
    const thread: ThreadMetadata = {
      id: threadId,
      status: { type: 'active' },
      created_at: now,
      updated_at: now,
      metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
    }

    await this.store.saveThread(thread, context)
    yield { type: 'thread.created', thread }

    if (params.input) {
      const userMessage = await this.createUserMessage(
        threadId,
        params.input.content,
        thread,
        params.input.attachments,
        context,
      )
      const matrixSent = await this.trySendMatrixUserMessage(thread, userMessage)
      if (matrixSent) {
        yield { type: 'thread.item.added', item: userMessage }
        yield { type: 'thread.item.done', item: userMessage }
        return
      }
      await this.store.addThreadItem(threadId, userMessage, context)
      yield { type: 'thread.item.added', item: userMessage }
      yield { type: 'thread.item.done', item: userMessage }
      const nextMetadata = withThreadComposerModel(thread.metadata, params.input.inference_options?.model)
      if (nextMetadata !== thread.metadata) {
        thread.metadata = nextMetadata
        thread.updated_at = nowTimestamp()
        await this.store.saveThread(thread, context)
      }
      yield* this.respond(thread, userMessage, context, params.input.inference_options, threadId)
    }
  }

  private async *handleThreadsAddUserMessage(
    params: any,
    context: StoreContext,
  ): AsyncIterable<ThreadStreamEvent> {
    const thread = await this.store.loadThread(params.thread_id, context)
    const userMessage = await this.createUserMessage(
      params.thread_id,
      params.input.content,
      undefined,
      params.input.attachments,
      context,
    )
    const matrixSent = await this.trySendMatrixUserMessage(thread, userMessage)
    if (matrixSent) {
      yield { type: 'thread.item.added', item: userMessage }
      yield { type: 'thread.item.done', item: userMessage }
      return
    }
    await this.store.addThreadItem(params.thread_id, userMessage, context)
    yield { type: 'thread.item.added', item: userMessage }
    yield { type: 'thread.item.done', item: userMessage }
    const nextMetadata = withThreadComposerModel(thread.metadata, params.input.inference_options?.model)
    if (nextMetadata !== thread.metadata) {
      thread.metadata = nextMetadata
      thread.updated_at = nowTimestamp()
      await this.store.saveThread(thread, context)
    }
    yield* this.respond(thread, userMessage, context, params.input.inference_options, params.thread_id)
  }

  private async *handleThreadsAddClientToolOutput(
    params: any,
    context: StoreContext,
  ): AsyncIterable<ThreadStreamEvent> {
    const item = await this.store.loadItem(params.thread_id, params.item_id, context)
    if (item.type !== 'client_tool_call') {
      return
    }

    const updatedItem = {
      ...item,
      output: params.output,
      status: 'completed' as const,
    }
    await this.store.saveItem(params.thread_id, updatedItem, context)
    yield { type: 'thread.item.done', item: updatedItem }

    const runtimeThread = await this.getRuntimeThread(params.thread_id)
    if (!runtimeThread) {
      return
    }

    const thread = await this.store.loadThread(params.thread_id, context)
    const chatId = readChatIdFromThread(thread) ?? 'default'
    const assistantItem = this.createAssistantItem(thread, context)
    await this.store.addThreadItem(thread.id, assistantItem, context)
    yield { type: 'thread.item.added', item: assistantItem }

    yield* this.streamRuntimeToolResponse(
      runtimeThread,
      thread,
      chatId,
      updatedItem.call_id,
      params.output,
      assistantItem,
      assistantItem.id,
      context,
    )
  }

  private async *handleThreadsRetryAfterItem(
    params: any,
    context: StoreContext,
  ): AsyncIterable<ThreadStreamEvent> {
    const thread = await this.store.loadThread(params.thread_id, context)
    const items = await this.store.loadThreadItems(params.thread_id, undefined, 1000, 'asc', context)
    let lastUserMessage: ThreadItem | undefined

    for (const item of items.data) {
      if (item.id === params.item_id) break
      if (item.type === 'user_message') lastUserMessage = item
    }

    if (lastUserMessage) {
      yield* this.respond(thread, lastUserMessage, context, undefined, params.thread_id)
    }
  }

  private async handleThreadsGetById(params: any, context: StoreContext) {
    const thread = await this.store.loadThread(params.thread_id, context)
    const items = await this.store.loadThreadItems(params.thread_id, undefined, 50, 'asc', context)
    return { ...thread, items }
  }

  private async handleThreadsList(params: any, context: StoreContext) {
    return this.store.loadThreads(params?.limit ?? 20, params?.after, params?.order ?? 'desc', context)
  }

  private async handleItemsList(params: any, context: StoreContext) {
    return this.store.loadThreadItems(params.thread_id, params.after, params.limit ?? 50, params.order ?? 'asc', context)
  }

  private async handleThreadsUpdate(params: any, context: StoreContext) {
    const thread = await this.store.loadThread(params.thread_id, context)
    if (params.title !== undefined) {
      thread.title = params.title
    }
    thread.updated_at = nowTimestamp()
    await this.store.saveThread(thread, context)
    return thread
  }

  private async handleThreadsDelete(params: any, context: StoreContext) {
    await this.store.deleteThread(params.thread_id, context)
    return { success: true }
  }

  private async handleAttachmentsCreate(params: any, context: StoreContext) {
    const id = generateId('attach')
    const mimeType = typeof params?.mime_type === 'string'
      ? params.mime_type
      : 'application/octet-stream'
    const name = typeof params?.name === 'string' && params.name.trim()
      ? params.name.trim()
      : '附件'
    const isImage = mimeType.startsWith('image/')
    const uploadUrl = new URL(
      `/__linx_chatkit_attachment__/${encodeURIComponent(id)}`,
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
    ).toString()
    const attachment = {
      id,
      attachment_id: id,
      type: isImage ? 'image' : 'file',
      name,
      mime_type: mimeType,
      size: typeof params?.size === 'number' ? params.size : undefined,
      ...(isImage
        ? { preview_url: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }
        : {}),
      upload_descriptor: {
        url: uploadUrl,
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
      },
    }
    await this.store.saveAttachment(attachment, context)
    return attachment
  }

  private async *respond(
    thread: ThreadMetadata,
    userMessage: ThreadItem,
    context: StoreContext,
    inferenceOptions?: any,
    storageThreadId: string = thread.id,
  ): AsyncIterable<ThreadStreamEvent> {
    const messages = await this.buildConversationHistory(storageThreadId, context, userMessage)

    const assistantItem = this.createAssistantItem(thread, context) as any
    const assistantItemId = assistantItem.id
    await this.store.addThreadItem(storageThreadId, assistantItem, context)
    yield { type: 'thread.item.added', item: assistantItem }

    let fullText = ''

    try {
      const userText = extractUserMessageText((userMessage as any).content)
      const runtimeThread = await this.getRuntimeThread(thread.id)

      if (runtimeThread) {
        const chatId = readChatIdFromThread(thread) ?? 'default'
        for await (const event of this.streamRuntimeResponse(
          runtimeThread,
          thread,
          userText,
          chatId,
          assistantItem,
          assistantItemId,
          context,
        )) {
          if (event.type === 'thread.item.updated') {
            const delta = (event as any).update?.delta
            if (typeof delta === 'string') {
              fullText += delta
            }
          }

          if (event.type === 'thread.item.done') {
            const text = (event as any).item?.content?.[0]?.text
            if (typeof text === 'string') {
              fullText = text
            }
          }

          yield event
        }
      } else {
        const agentConfig = await this.resolveThreadAgentConfig(thread)
        const requestedProviderModel = parseRequestedProviderModel(inferenceOptions?.model)
        const platformModel = requestedProviderModel
          ? null
          : this.resolvePlatformModel(agentConfig, inferenceOptions?.model)

        if (platformModel) {
          const stream = this.streamFromLinxRuntime(
            platformModel,
            messages,
            inferenceOptions,
            agentConfig?.aiRuntimeLocation ?? DEFAULT_AGENT_AI_RUNTIME_LOCATION,
          )

          for await (const chunk of stream) {
            fullText += chunk
            yield {
              type: 'thread.item.updated',
              item_id: assistantItemId,
              update: {
                type: 'assistant_message.content_part.text_delta',
                content_index: 0,
                delta: chunk,
              },
            } as ThreadStreamEvent
          }

          assistantItem.content = [{ type: 'output_text', text: fullText, annotations: [] }]
          assistantItem.status = 'completed'
          await this.store.saveItem(storageThreadId, assistantItem, context)
          yield { type: 'thread.item.done', item: assistantItem }
          return
        }

        const aiConfig = await this.getAiConfig(requestedProviderModel?.provider ?? agentConfig?.provider)
        if (!aiConfig) {
          assistantItem.content = [{ type: 'output_text', text: '请先在设置中配置 AI API Key。', annotations: [] }]
          assistantItem.status = 'completed'
          await this.store.saveItem(storageThreadId, assistantItem, context)
          yield { type: 'thread.item.done', item: assistantItem }
          return
        }

        const model = requestedProviderModel?.model
          ?? inferenceOptions?.model
          ?? agentConfig?.model
          ?? aiConfig.defaultModel
          ?? 'openai/gpt-4o-mini'
        const stream = this.streamFromProvider(aiConfig, messages, model, inferenceOptions)

        for await (const chunk of stream) {
          fullText += chunk
          yield {
            type: 'thread.item.updated',
            item_id: assistantItemId,
            update: {
              type: 'assistant_message.content_part.text_delta',
              content_index: 0,
              delta: chunk,
            },
          } as ThreadStreamEvent
        }

        assistantItem.content = [{ type: 'output_text', text: fullText, annotations: [] }]
        assistantItem.status = 'completed'
        await this.store.saveItem(storageThreadId, assistantItem, context)
        yield { type: 'thread.item.done', item: assistantItem }
      }
    } catch (error: any) {
      console.error('[LocalChatKitService] AI/runtime response failed:', error)
      const userMessage = formatErrorForUser(error, '消息生成失败。请稍后重试。')
      assistantItem.content = [{ type: 'output_text', text: fullText || userMessage, annotations: [] }]
      assistantItem.status = 'incomplete'
      await this.store.saveItem(storageThreadId, assistantItem, context)
      yield { type: 'thread.item.done', item: assistantItem }
      yield {
        type: 'error',
        error: {
          code: 'generation_error',
          message: userMessage,
        },
      } as ThreadStreamEvent
    }

    if (!thread.title && fullText) {
      try {
        const userText = extractUserMessageText((userMessage as any).content)
        let title = userText.slice(0, 50)
        if (userText.length > 50) title += '...'
        thread.title = title || 'New Chat'
        thread.updated_at = nowTimestamp()
        await this.store.saveThread(thread, context)
        yield { type: 'thread.updated', thread }
      } catch {
        // ignore title errors
      }
    }
  }

  private isServiceMode(): boolean {
    return typeof window !== 'undefined' && !!(window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__
  }

  private async trySendMatrixUserMessage(thread: ThreadMetadata, userMessage: ThreadItem): Promise<boolean> {
    const body = extractUserMessageText((userMessage as any).content)
    const result = await sendMatrixThreadMessage({
      db: this.db,
      authFetch: this.authFetch,
      webId: this.webId,
      thread: {
        id: thread.id,
        metadata: thread.metadata as Record<string, unknown> | undefined,
      },
      body,
      txnId: userMessage.id,
    })
    return result !== null
  }

  private async getRuntimeThread(threadId: string): Promise<RuntimeThreadRecord | null> {
    if (!this.isServiceMode()) return null

    const response = await fetch(`/api/runtime/threads?threadId=${encodeURIComponent(threadId)}`)
    if (!response.ok) return null

    const data = await response.json() as { items?: RuntimeThreadRecord[] }
    return data.items?.[0] ?? null
  }

  private async ensureRuntimeThreadActive(runtimeThread: RuntimeThreadRecord): Promise<void> {
    if (runtimeThread.status === 'active') return

    if (runtimeThread.status === 'paused') {
      const response = await fetch(`/api/runtime/threads/${runtimeThread.id}/resume`, { method: 'POST' })
      if (!response.ok) throw new Error('Failed to resume runtime thread')
      return
    }

    if (runtimeThread.status === 'idle' || runtimeThread.status === 'completed') {
      const response = await fetch(`/api/runtime/threads/${runtimeThread.id}/start`, { method: 'POST' })
      if (!response.ok) throw new Error('Failed to start runtime thread')
      return
    }

    throw new Error('Runtime thread is in error state')
  }

  private createAssistantItem(thread: ThreadMetadata, context: StoreContext): ThreadItem {
    return {
      id: this.store.generateItemId('assistant_message', thread, context),
      thread_id: thread.id,
      type: 'assistant_message',
      content: [{ type: 'output_text', text: '', annotations: [] }],
      attachments: [],
      status: 'in_progress',
      created_at: nowTimestamp(),
    } as ThreadItem
  }

  private createRuntimeToolCallItem(
    thread: ThreadMetadata,
    event: Extract<RuntimeThreadEvent, { type: 'tool_call' }>,
    context: StoreContext,
  ): ThreadItem {
    return {
      id: this.store.generateItemId('client_tool_call', thread, context),
      thread_id: thread.id,
      type: 'client_tool_call',
      name: event.name,
      arguments: event.arguments,
      call_id: event.requestId,
      status: 'pending',
      created_at: nowTimestamp(),
    } as ThreadItem
  }

  private async finalizePendingRuntimeItem(
    threadId: string,
    assistantItem: any,
    context: StoreContext,
    fullText: string,
    notice: string,
  ): Promise<ThreadItem> {
    const nextText = fullText
      ? `${fullText}\n\n${notice}`
      : notice

    assistantItem.content = [{ type: 'output_text', text: nextText, annotations: [] }]
    assistantItem.status = 'incomplete'
    await this.store.saveItem(threadId, assistantItem, context)
    return assistantItem as ThreadItem
  }

  private async *readRuntimeEvents(response: Response): AsyncIterable<RuntimeThreadEvent> {
    const body = response.body
    if (!body) {
      throw new Error('Failed to subscribe runtime events')
    }

    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

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

          yield JSON.parse(payload) as RuntimeThreadEvent
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  private async *streamRuntimeContinuation(
    runtimeThread: RuntimeThreadRecord,
    thread: ThreadMetadata,
    chatId: string,
    assistantItem: any,
    assistantItemId: string,
    context: StoreContext,
    sendRequest: () => Promise<Response>,
    notices: {
      toolCall: string
      authRequired: string
      requestFailed: string
    },
  ): AsyncIterable<ThreadStreamEvent> {
    await this.ensureRuntimeThreadActive(runtimeThread)

    const controller = new AbortController()
    const response = await fetch(`/api/runtime/threads/${runtimeThread.id}/events`, {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
    })

    if (!response.ok || !response.body) {
      throw new Error('Failed to subscribe runtime events')
    }

    const actionResponse = await sendRequest()
    if (!actionResponse.ok) {
      controller.abort()
      const data = await actionResponse.json().catch(() => null)
      throw new Error(data?.error || notices.requestFailed)
    }

    let fullText = ''

    try {
      for await (const event of this.readRuntimeEvents(response)) {
        await this.runtimeSidecar.persistRuntimeEvent(runtimeThread, event as any, { chatId, threadId: thread.id })

        if (event.type === 'assistant_delta' && event.text) {
          fullText += event.text
          yield {
            type: 'thread.item.updated',
            item_id: assistantItemId,
            update: {
              type: 'assistant_message.content_part.text_delta',
              content_index: 0,
              delta: event.text,
            },
          } as ThreadStreamEvent
          continue
        }

        if (event.type === 'assistant_done') {
          fullText = event.text || fullText
          assistantItem.content = [{ type: 'output_text', text: fullText, annotations: [] }]
          assistantItem.status = 'completed'
          await this.store.saveItem(thread.id, assistantItem, context)
          yield { type: 'thread.item.done', item: assistantItem }
          controller.abort()
          return
        }

        if (event.type === 'tool_call') {
          const toolItem = this.createRuntimeToolCallItem(thread, event, context)
          await this.store.addThreadItem(thread.id, toolItem, context)
          yield { type: 'thread.item.added', item: toolItem }

          const pendingItem = await this.finalizePendingRuntimeItem(
            thread.id,
            assistantItem,
            context,
            fullText,
            notices.toolCall,
          )
          yield { type: 'thread.item.done', item: pendingItem }
          controller.abort()
          return
        }

        if (event.type === 'auth_required') {
          const pendingItem = await this.finalizePendingRuntimeItem(
            thread.id,
            assistantItem,
            context,
            fullText,
            notices.authRequired,
          )
          yield { type: 'thread.item.done', item: pendingItem }
          controller.abort()
          return
        }

        if (event.type === 'error') {
          throw new Error(event.message || 'Runtime response failed')
        }
      }

      if (fullText) {
        assistantItem.content = [{ type: 'output_text', text: fullText, annotations: [] }]
        assistantItem.status = 'completed'
        await this.store.saveItem(thread.id, assistantItem, context)
        yield { type: 'thread.item.done', item: assistantItem }
        return
      }

      throw new Error('Runtime stream ended without assistant output')
    } finally {
      controller.abort()
    }
  }

  private async *streamRuntimeResponse(
    runtimeThread: RuntimeThreadRecord,
    thread: ThreadMetadata,
    userText: string,
    chatId: string,
    assistantItem: any,
    assistantItemId: string,
    context: StoreContext,
  ): AsyncIterable<ThreadStreamEvent> {
    yield* this.streamRuntimeContinuation(
      runtimeThread,
      thread,
      chatId,
      assistantItem,
      assistantItemId,
      context,
      () => fetch(`/api/runtime/threads/${runtimeThread.id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userText }),
      }),
      {
        toolCall: '运行时请求了一个工具调用，已转入收件箱等待处理。',
        authRequired: '运行时需要额外认证，已转入收件箱等待处理。',
        requestFailed: 'Failed to send runtime message',
      },
    )
  }

  private async *streamRuntimeToolResponse(
    runtimeThread: RuntimeThreadRecord,
    thread: ThreadMetadata,
    chatId: string,
    requestId: string,
    output: string,
    assistantItem: any,
    assistantItemId: string,
    context: StoreContext,
  ): AsyncIterable<ThreadStreamEvent> {
    yield* this.streamRuntimeContinuation(
      runtimeThread,
      thread,
      chatId,
      assistantItem,
      assistantItemId,
      context,
      () => fetch(`/api/runtime/threads/${runtimeThread.id}/tool-calls/${encodeURIComponent(requestId)}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output }),
      }),
      {
        toolCall: '运行时请求了新的工具调用，已转入收件箱等待处理。',
        authRequired: '运行时需要额外认证，已转入收件箱等待处理。',
        requestFailed: 'Failed to respond runtime tool call',
      },
    )
  }

  private async getAiConfig(provider: string | null | undefined): Promise<{
    providerId: string
    baseUrl: string
    apiKey: string
    defaultModel?: string
  } | null> {
    const providerId = normalizeAIConfigProviderId(provider ?? 'openai')
    if (!providerId) {
      return null
    }

    const findProvider = typeof (this.db as any).findById === 'function'
      ? (this.db as any).findById(aiProviderResource as any, aiProviderResource.buildId({ id: providerId }))
      : Promise.resolve(null)
    const [credentialRows, providerRow] = await Promise.all([
      this.findAiCredentialRows(providerId),
      findProvider,
    ])

    const selected = selectAIConfigCredential(
      providerId,
      credentialRows as Array<Record<string, unknown>>,
      providerRow ? [providerRow as Record<string, unknown>] : [],
    )

    if (!selected) {
      return await this.getLocalServiceAiConfig(providerId)
    }

    return {
      providerId,
      baseUrl: selected.baseUrl || 'https://openrouter.ai/api/v1',
      apiKey: selected.apiKey,
    }
  }

  private async getLocalServiceAiConfig(providerId: string): Promise<{
    providerId: string
    baseUrl: string
    apiKey: string
    defaultModel?: string
  } | null> {
    if (typeof window === 'undefined' || !(window as any).__LINX_SERVICE__) {
      return null
    }

    const podUrl = (this.db as any)?.getDialect?.()?.getPodUrl?.()
    if (typeof podUrl !== 'string' || !podUrl.trim()) {
      return null
    }

    const params = new URLSearchParams({ podUrl, providerId })
    const response = await fetch(`/api/model-services/local-config?${params.toString()}`)
    if (!response.ok) {
      return null
    }
    const body = await response.json()
    const provider = Array.isArray(body?.providers) ? body.providers[0] : null
    if (provider?.enabled === false) {
      throw new Error('当前模型服务已停用，请重新选择模型。')
    }
    const apiKey = typeof provider?.apiKey === 'string' ? provider.apiKey : ''
    const baseUrl = typeof provider?.baseUrl === 'string' ? provider.baseUrl : ''
    const defaultModel = typeof provider?.selectedModelId === 'string' ? provider.selectedModelId : undefined
    if (!apiKey || !baseUrl) {
      return null
    }
    return {
      providerId,
      baseUrl,
      apiKey,
      defaultModel,
    }
  }

  private async findAiCredentialRows(providerId: string): Promise<Array<Record<string, unknown>>> {
    const exactRows: Array<Record<string, unknown>> = []
    const findById = (this.db as any).findById
    if (typeof findById === 'function') {
      const defaultCredentialId = getDefaultAIConfigCredentialId(providerId)
      const exact = await findById.call(
        this.db,
        credentialResource as any,
        credentialResource.buildId({ id: defaultCredentialId }),
      )
        .catch((error: unknown) => {
          if (isMissingExactReadError(error)) return null
          throw error
        })
      if (exact) exactRows.push(exact as Record<string, unknown>)
    }

    if (exactRows.length > 0) {
      return exactRows
    }

    try {
      return await this.db.select().from(credentialResource).execute() as Array<Record<string, unknown>>
    } catch (error) {
      if (isUnsupportedCollectionReadError(error)) {
        return exactRows
      }
      throw error
    }
  }

  private async resolveThreadAgentConfig(thread: ThreadMetadata): Promise<ThreadAgentConfig | null> {
    const chatId = readChatIdFromThread(thread)
    if (!chatId) return null

    const chat = await this.findChatById(chatId)
    const participantRefs = Array.isArray(chat?.participants)
      ? chat.participants.filter((participant: unknown): participant is string => typeof participant === 'string' && participant.length > 0)
      : []

    if (participantRefs.length === 0) {
      return null
    }

    const contacts = await this.db.select().from(contactResource).execute() as ContactRow[]

    for (const participantRef of participantRefs) {
      const contact = contacts.find((entry) => contactMatchesRef(this.db, entry, participantRef))
      const agentRef = contact?.about ?? participantRef
      const agent = await this.findAgentByRef(agentRef)

      const agentHomeModel = await readAgentHomeModel(this.db, agentRef)

      if (!agent && !agentHomeModel) {
        continue
      }

      const provider = normalizeAIConfigProviderId(
        agentHomeModel?.provider ?? (typeof agent?.provider === 'string' ? agent.provider : ''),
      )
      const model = normalizeAIConfigResourceId(
        agentHomeModel?.model ?? (typeof agent?.model === 'string' ? agent.model : ''),
      )

      if (!provider || !model) {
        continue
      }

      return {
        provider,
        model,
        instructions: typeof agent?.instructions === 'string' ? agent.instructions : undefined,
        aiRuntimeLocation: readAgentAiRuntimeLocation((agent as Record<string, unknown> | null)?.metadata),
      }
    }

    return null
  }

  private async findAgentByRef(ref: string): Promise<AgentRow | null> {
    if (!ref) return null
    if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(ref)) {
      const findByIri = (this.db as any).findByIri
      return typeof findByIri === 'function'
        ? await findByIri.call(this.db, agentResource as any, ref) as AgentRow | null
        : null
    }
    const findById = (this.db as any).findById
    return typeof findById === 'function'
      ? await findById.call(this.db, agentResource as any, ref) as AgentRow | null
      : null
  }

  private async findChatById(chatId: string): Promise<any | null> {
    const findById = (this.db as any).findById
    if (typeof findById !== 'function') return null

    // Chat ids in Thread metadata are logical keys. Resolve the deterministic
    // base-relative resource id before reading it. A Pod-wide fallback scan can
    // dereference foreign Chat IRIs retained in historical data and turn one
    // inaccessible row into a failure for the active local chat.
    return await findById.call(
      this.db,
      chatResource as any,
      chatResource.buildId({ id: chatId }),
    )
  }

  private resolvePlatformModel(agentConfig: ThreadAgentConfig | null, requestedModel?: unknown): string | null {
    const requestedPlatformModel = normalizePlatformRuntimeModel(requestedModel)
    if (requestedPlatformModel) return requestedPlatformModel

    if (!agentConfig || agentConfig.provider !== 'undefineds') return null

    return normalizePlatformRuntimeModel(agentConfig.model)
  }

  private resolveRuntimeBaseUrl(): string {
    let issuerUrl = resolveCurrentPodBaseUrl(this.db) ?? this.webId
    try {
      issuerUrl = new URL(issuerUrl).origin
    } catch {
      if (issuerUrl.includes('/profile/card#me')) {
        issuerUrl = issuerUrl.replace('/profile/card#me', '')
      }
    }

    return resolveLinxRuntimeApiBaseUrlForIssuerUrl(issuerUrl).replace(/\/$/, '')
  }

  private async *streamFromLinxRuntime(
    model: string,
    messages: ChatCompletionMessage[],
    inferenceOptions?: any,
    runtimeLocation: AgentAiRuntimeLocation = DEFAULT_AGENT_AI_RUNTIME_LOCATION,
  ): AsyncIterable<string> {
    const requestInit: RequestInit = {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream, text/plain, application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: inferenceOptions?.temperature ?? 0.7,
        max_tokens: inferenceOptions?.max_tokens ?? 2048,
      }),
    }

    const response = runtimeLocation === 'server'
      ? await this.fetchServerOriginatedLinxRuntime(requestInit)
      : await this.authFetch(`${this.resolveRuntimeBaseUrl()}/chat/completions`, requestInit)

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`LinX runtime error ${response.status}: ${text.slice(0, 200)}`)
    }

    yield* this.readTextOrSseStream(response)
  }

  private async fetchServerOriginatedLinxRuntime(requestInit: RequestInit): Promise<Response> {
    if (!this.isServiceMode()) {
      throw new Error('服务端 AI 运行只支持 LinX 桌面或本地服务。请切回客户端运行，或先启动本地空间。')
    }

    return fetch('/api/ai/chat/completions', requestInit)
  }

  private async *readTextOrSseStream(response: Response): AsyncIterable<string> {
    const reader = response.body?.getReader()
    if (!reader) {
      const data = await response.json().catch(() => null)
      const text = data?.choices?.[0]?.message?.content
      if (typeof text === 'string' && text) {
        yield text
      }
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const chunk = this.parseRuntimeStreamLine(line)
        if (chunk) yield chunk
      }
    }

    const tail = decoder.decode()
    if (tail) buffer += tail
    const finalChunk = this.parseRuntimeStreamLine(buffer)
    if (finalChunk) yield finalChunk
  }

  private parseRuntimeStreamLine(line: string): string {
    const trimmed = line.trim()
    if (!trimmed || trimmed === 'data: [DONE]' || trimmed === '[DONE]') {
      return ''
    }

    const payload = trimmed.startsWith('data: ') ? trimmed.slice(6).trim() : trimmed
    if (!payload || payload === '[DONE]') {
      return ''
    }

    try {
      const parsed = JSON.parse(payload)
      const delta = parsed.choices?.[0]?.delta?.content
      if (typeof delta === 'string') {
        return delta
      }

      const text = parsed.choices?.[0]?.message?.content
      if (typeof text === 'string') {
        return text
      }

      if (typeof parsed.text === 'string') {
        return parsed.text
      }
    } catch {
      return payload
    }

    return ''
  }

  private fetchProviderChatCompletion(
    config: { providerId: string; apiKey: string },
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    if (this.isServiceMode()) {
      return fetch('/api/model-services/chat/completions', {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream, text/plain, application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          providerId: config.providerId,
          endpoint,
          apiKey: config.apiKey,
          body,
        }),
      })
    }

    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    })
  }

  private async *streamFromProvider(
    config: { providerId: string; baseUrl: string; apiKey: string },
    messages: ChatCompletionMessage[],
    model: string,
    inferenceOptions?: any,
  ): AsyncIterable<string> {
    const cleanBase = config.baseUrl.replace(/\/$/, '')
    const endpoint = `${cleanBase}/chat/completions`
    const body = {
      model,
      messages,
      stream: true,
      temperature: inferenceOptions?.temperature ?? 0.7,
      max_tokens: inferenceOptions?.max_tokens ?? 2048,
    }

    let response: Response
    try {
      response = await this.fetchProviderChatCompletion(config, endpoint, body)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Model service request failed: ${detail}`)
    }

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`AI API Error ${response.status}: ${text.slice(0, 200)}`)
    }

    yield* this.readTextOrSseStream(response)
  }

  private async buildConversationHistory(
    threadId: string,
    context: StoreContext,
    currentUserMessage?: ThreadItem,
  ): Promise<ChatCompletionMessage[]> {
    const messages: ChatCompletionMessage[] = [
      { role: 'system', content: this.systemPrompt },
    ]

    // Model requests must be reconstructed from the complete durable thread.
    // Keep this paginated: a fixed first-page limit silently drops older turns
    // once a conversation grows beyond that limit, and Pod-backed threads must
    // behave the same after signing in on another browser or device.
    const threadItems: ThreadItem[] = []
    let after: string | undefined
    do {
      const page = await this.store.loadThreadItems(threadId, after, 100, 'asc', context)
      threadItems.push(...page.data)
      if (!page.has_more || page.data.length === 0) break

      const nextAfter = page.last_id ?? page.data[page.data.length - 1]?.id
      if (!nextAfter || nextAfter === after) break
      after = nextAfter
    } while (true)

    let includesCurrentUserMessage = false
    for (const item of threadItems) {
      if (item.id === currentUserMessage?.id) {
        includesCurrentUserMessage = true
      }
      if (item.type === 'user_message') {
        const content = buildUserChatCompletionContent(item)
        if (content) {
          messages.push({ role: 'user', content })
        }
      } else if (item.type === 'assistant_message') {
        const text = (item as any).content
          .filter((contentPart: any) => contentPart.type === 'output_text')
          .map((contentPart: any) => contentPart.text)
          .join('\n')
        if (text) {
          messages.push({ role: 'assistant', content: text })
        }
      }
    }

    // Pod writes and indexed reads are not guaranteed to become visible in the
    // same turn. The current item is already the accepted request source, so it
    // must be included even when the just-persisted row is not indexed yet.
    if (currentUserMessage && !includesCurrentUserMessage) {
      const content = buildUserChatCompletionContent(currentUserMessage)
      if (content) messages.push({ role: 'user', content })
    }

    return messages
  }

  private async createUserMessage(
    threadId: string,
    content: any[],
    thread?: ThreadMetadata,
    attachmentIds: unknown = [],
    context: StoreContext = {},
  ): Promise<ThreadItem> {
    const fallbackThread = thread || {
      id: threadId,
      status: { type: 'active' as const },
      created_at: nowTimestamp(),
      updated_at: nowTimestamp(),
    }

    const itemId = this.store.generateItemId('user_message', fallbackThread, {})
    const attachments = await Promise.all(
      (Array.isArray(attachmentIds) ? attachmentIds : [])
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
        .map((id) => this.store.loadAttachment(id, context)),
    )

    return {
      id: itemId,
      thread_id: threadId,
      type: 'user_message',
      content,
      attachments,
      created_at: nowTimestamp(),
    } as ThreadItem
  }
}

function buildUserChatCompletionContent(item: ThreadItem): ChatCompletionContent | null {
  const text = extractUserMessageText((item as any).content)
  const attachments = Array.isArray((item as any).attachments)
    ? (item as any).attachments as Array<Record<string, unknown>>
    : []
  if (attachments.length === 0) return text || null

  const parts: Exclude<ChatCompletionContent, string> = []
  if (text) parts.push({ type: 'text', text })

  for (const attachment of attachments) {
    const mimeType = typeof attachment.mime_type === 'string'
      ? attachment.mime_type
      : 'application/octet-stream'
    const name = typeof attachment.name === 'string' ? attachment.name : '附件'
    const dataUrl = typeof attachment.data_url === 'string' ? attachment.data_url : ''

    if (mimeType.startsWith('image/') && dataUrl) {
      parts.push({
        type: 'image_url',
        image_url: { url: dataUrl, detail: 'auto' },
      })
      continue
    }

    const extractedText = dataUrl ? decodeTextAttachment(dataUrl, mimeType) : null
    parts.push({
      type: 'text',
      text: extractedText
        ? `附件「${name}」内容：\n\n${extractedText}`
        : `已附加文件「${name}」（${mimeType}），但当前模型接口不能直接读取这种文件格式。`,
    })
  }

  return parts.length > 0 ? parts : null
}

function decodeTextAttachment(dataUrl: string, mimeType: string): string | null {
  if (
    !mimeType.startsWith('text/')
    && mimeType !== 'application/json'
    && !/[/+](?:json|xml|yaml|csv)$/i.test(mimeType)
  ) {
    return null
  }

  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) return null
  try {
    const bytes = Uint8Array.from(atob(dataUrl.slice(commaIndex + 1)), (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}
