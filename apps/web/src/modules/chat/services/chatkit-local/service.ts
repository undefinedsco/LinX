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
  asResourceIri,
  agentTable,
  aiProviderResource,
  chatTable,
  contactTable,
  credentialResource,
  extractChatIdFromChatRef,
  normalizeAIConfigProviderId,
  normalizeAIConfigResourceId,
  requireRowResourceId,
  selectAIConfigCredential,
  type AgentRow,
  type ContactRow,
  type ResourceIri,
  type SolidDatabase,
} from '@undefineds.co/models'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { formatErrorForUser } from '@/lib/user-facing-errors'
import { RuntimeSidecarSink } from './runtime-sidecar'

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
  return asResourceIri(db.resolveRowIri(contactTable as any, { id }), 'Contact IRI')
}

function contactMatchesRef(db: SolidDatabase, contact: ContactRow | null | undefined, ref: string): boolean {
  if (!contact || !ref) return false
  return contact.id === ref || resolveContactIri(db, contact) === ref
}

export interface LocalServiceOptions {
  store: ChatKitStore<StoreContext>
  db: SolidDatabase
  webId: string
  authFetch: typeof fetch
  systemPrompt?: string
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
  workspaceUri?: string
  title: string
  tool: string
  status: RuntimeThreadStatus
  tokenUsage: number
}

interface ThreadAgentConfig {
  provider: string
  model: string
  instructions?: string
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

export class LocalChatKitService {
  private store: ChatKitStore<StoreContext>
  private db: SolidDatabase
  private webId: string
  private authFetch: typeof fetch
  private systemPrompt: string
  private runtimeSidecar: RuntimeSidecarSink

  constructor(options: LocalServiceOptions) {
    this.store = options.store
    this.db = options.db
    this.webId = options.webId
    this.authFetch = options.authFetch
    this.systemPrompt = options.systemPrompt ?? 'You are a helpful assistant.'
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
        return { attachment_id: generateId('attach') }
      case 'attachments.delete':
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
      const userMessage = this.createUserMessage(threadId, params.input.content, thread)
      await this.store.addThreadItem(threadId, userMessage, context)
      yield { type: 'thread.item.added', item: userMessage }
      yield { type: 'thread.item.done', item: userMessage }
      yield* this.respond(thread, userMessage, context, params.input.inference_options)
    }
  }

  private async *handleThreadsAddUserMessage(
    params: any,
    context: StoreContext,
  ): AsyncIterable<ThreadStreamEvent> {
    const thread = await this.store.loadThread(params.thread_id, context)
    const userMessage = this.createUserMessage(params.thread_id, params.input.content)
    await this.store.addThreadItem(params.thread_id, userMessage, context)
    yield { type: 'thread.item.added', item: userMessage }
    yield { type: 'thread.item.done', item: userMessage }
    yield* this.respond(thread, userMessage, context, params.input.inference_options)
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
      yield* this.respond(thread, lastUserMessage, context)
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

  private async *respond(
    thread: ThreadMetadata,
    userMessage: ThreadItem,
    context: StoreContext,
    inferenceOptions?: any,
  ): AsyncIterable<ThreadStreamEvent> {
    const messages = await this.buildConversationHistory(thread.id, context)

    const assistantItem = this.createAssistantItem(thread, context) as any
    const assistantItemId = assistantItem.id
    await this.store.addThreadItem(thread.id, assistantItem, context)
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
        const platformModel = this.resolvePlatformModel(agentConfig)

        if (platformModel) {
          const stream = this.streamFromLinxRuntime(platformModel, messages, inferenceOptions)

          for await (const chunk of stream) {
            fullText += chunk
            yield {
              type: 'thread.item.updated',
              item_id: assistantItemId,
              update: {
                type: 'assistant_message.content_part.text_delta',
                part_index: 0,
                delta: chunk,
              },
            } as ThreadStreamEvent
          }

          assistantItem.content = [{ type: 'output_text', text: fullText, annotations: [] }]
          assistantItem.status = 'completed'
          await this.store.saveItem(thread.id, assistantItem, context)
          yield { type: 'thread.item.done', item: assistantItem }
          return
        }

        const aiConfig = await this.getAiConfig(agentConfig?.provider)
        if (!aiConfig) {
          assistantItem.content = [{ type: 'output_text', text: '请先在设置中配置 AI API Key。', annotations: [] }]
          assistantItem.status = 'completed'
          await this.store.saveItem(thread.id, assistantItem, context)
          yield { type: 'thread.item.done', item: assistantItem }
          return
        }

        const model = inferenceOptions?.model ?? agentConfig?.model ?? aiConfig.defaultModel ?? 'openai/gpt-4o-mini'
        const stream = this.streamFromProvider(aiConfig, messages, model, inferenceOptions)

        for await (const chunk of stream) {
          fullText += chunk
          yield {
            type: 'thread.item.updated',
            item_id: assistantItemId,
            update: {
              type: 'assistant_message.content_part.text_delta',
              part_index: 0,
              delta: chunk,
            },
          } as ThreadStreamEvent
        }

        assistantItem.content = [{ type: 'output_text', text: fullText, annotations: [] }]
        assistantItem.status = 'completed'
        await this.store.saveItem(thread.id, assistantItem, context)
        yield { type: 'thread.item.done', item: assistantItem }
      }
    } catch (error: any) {
      console.error('[LocalChatKitService] AI/runtime response failed:', error)
      const userMessage = formatErrorForUser(error, '消息生成失败。请稍后重试。')
      assistantItem.content = [{ type: 'output_text', text: fullText || userMessage, annotations: [] }]
      assistantItem.status = 'incomplete'
      await this.store.saveItem(thread.id, assistantItem, context)
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
              part_index: 0,
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
    baseUrl: string
    apiKey: string
    defaultModel?: string
  } | null> {
    const providerId = normalizeAIConfigProviderId(provider ?? 'openai')
    if (!providerId) {
      return null
    }

    const findProvider = typeof (this.db as any).findById === 'function'
      ? (this.db as any).findById(aiProviderResource as any, providerId)
      : Promise.resolve(null)
    const [credentialRows, providerRow] = await Promise.all([
      this.db.select().from(credentialResource).execute(),
      findProvider,
    ])

    const selected = selectAIConfigCredential(
      providerId,
      credentialRows as Array<Record<string, unknown>>,
      providerRow ? [providerRow as Record<string, unknown>] : [],
    )

    if (!selected) return null

    return {
      baseUrl: selected.baseUrl || 'https://openrouter.ai/api/v1',
      apiKey: selected.apiKey,
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

    const contacts = await this.db.select().from(contactTable).execute() as ContactRow[]

    for (const participantRef of participantRefs) {
      const contact = contacts.find((entry) => contactMatchesRef(this.db, entry, participantRef))
      const agentRef = contact?.entityUri ?? participantRef
      const agent = await this.findAgentByRef(agentRef)

      if (!agent) {
        continue
      }

      const provider = normalizeAIConfigProviderId(typeof agent.provider === 'string' ? agent.provider : '')
      const model = normalizeAIConfigResourceId(typeof agent.model === 'string' ? agent.model : '')

      if (!provider || !model) {
        continue
      }

      return {
        provider,
        model,
        instructions: typeof agent.instructions === 'string' ? agent.instructions : undefined,
      }
    }

    return null
  }

  private async findAgentByRef(ref: string): Promise<AgentRow | null> {
    if (!ref) return null
    if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(ref)) {
      const findByIri = (this.db as any).findByIri
      return typeof findByIri === 'function'
        ? await findByIri.call(this.db, agentTable as any, ref) as AgentRow | null
        : null
    }
    const findById = (this.db as any).findById
    return typeof findById === 'function'
      ? await findById.call(this.db, agentTable as any, ref) as AgentRow | null
      : null
  }

  private async findChatById(chatId: string): Promise<any | null> {
    const direct = await (this.db as any).findById?.(chatTable as any, chatId)
    if (direct) return direct

    const chats = await this.db.select().from(chatTable).execute()
    return chats.find((entry: any) => entry.id === chatId) ?? null
  }

  private resolvePlatformModel(agentConfig: ThreadAgentConfig | null): string | null {
    if (!agentConfig || agentConfig.provider !== 'undefineds') {
      return null
    }

    if (agentConfig.model === 'undefineds/linx-lite') {
      return 'linx-lite'
    }

    if (agentConfig.model === 'undefineds/linx') {
      return 'linx'
    }

    return agentConfig.model === 'linx-lite' || agentConfig.model === 'linx'
      ? agentConfig.model
      : null
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
    messages: Array<{ role: string; content: string }>,
    inferenceOptions?: any,
  ): AsyncIterable<string> {
    const endpoint = `${this.resolveRuntimeBaseUrl()}/chat/completions`
    const response = await this.authFetch(endpoint, {
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
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`LinX runtime error ${response.status}: ${text.slice(0, 200)}`)
    }

    yield* this.readTextOrSseStream(response)
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

  private async *streamFromProvider(
    config: { baseUrl: string; apiKey: string },
    messages: Array<{ role: string; content: string }>,
    model: string,
    inferenceOptions?: any,
  ): AsyncIterable<string> {
    const cleanBase = config.baseUrl.replace(/\/$/, '')
    const endpoint = `${cleanBase}/chat/completions`

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: inferenceOptions?.temperature ?? 0.7,
        max_tokens: inferenceOptions?.max_tokens ?? 2048,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`AI API Error ${response.status}: ${text.slice(0, 200)}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
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
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue

        const data = trimmed.slice(6)
        if (data === '[DONE]') return

        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) {
            yield delta
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }
  }

  private async buildConversationHistory(
    threadId: string,
    context: StoreContext,
  ): Promise<Array<{ role: string; content: string }>> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: this.systemPrompt },
    ]

    const items = await this.store.loadThreadItems(threadId, undefined, 100, 'asc', context)
    for (const item of items.data) {
      if (item.type === 'user_message') {
        const text = extractUserMessageText((item as any).content)
        if (text) {
          messages.push({ role: 'user', content: text })
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

    return messages
  }

  private createUserMessage(
    threadId: string,
    content: any[],
    thread?: ThreadMetadata,
  ): ThreadItem {
    const fallbackThread = thread || {
      id: threadId,
      status: { type: 'active' as const },
      created_at: nowTimestamp(),
      updated_at: nowTimestamp(),
    }

    const itemId = this.store.generateItemId('user_message', fallbackThread, {})
    return {
      id: itemId,
      thread_id: threadId,
      type: 'user_message',
      content,
      attachments: [],
      created_at: nowTimestamp(),
    } as ThreadItem
  }
}
