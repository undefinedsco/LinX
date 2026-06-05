/**
 * Local (Browser) ChatKit Service
 *
 * Ports the xpod ChatKitService logic to run entirely in the browser.
 * Uses LocalChatKitStore for Pod persistence and shared models to read AI API
 * keys from the Pod.
 *
 * No API server round-trip — fetch goes directly to the AI provider.
 */

import { findExactRecord, resolvePodBaseUrl, resolveRowSubject } from '@undefineds.co/drizzle-solid'
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
  agentTable,
  aiConfigRepository,
  chatTable,
  contactTable,
  normalizeAIConfigProviderId,
  normalizeAIConfigResourceId,
  skillResource,
  type AgentRow,
  type ContactRow,
  type SkillRow,
  type SolidDatabase,
} from '@undefineds.co/models'
import { RuntimeSidecarSink } from './runtime-sidecar'

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

const DEFAULT_SECRETARY_CHAT_ID = 'ai-secretary'
const DEFAULT_SECRETARY_AGENT_ID = '__secretary__'
const DEFAULT_SECRETARY_PROVIDER = 'undefineds'
const DEFAULT_SECRETARY_MODEL = 'undefineds/linx-lite'
const DEFAULT_SECRETARY_SKILL = 'symphony'
const AGENT_HOME_PROMPT_FILES = ['AGENTS.md', 'rules.md', 'config.json', 'memory.md'] as const
const MAX_AGENT_HOME_FILE_CHARS = 12_000
const MAX_SKILL_FILE_CHARS = 24_000

interface AgentHomeFileProjection {
  path: string
  content: string
}

interface ThreadAgentSkillConfig {
  name: string
  displayName?: string
  root?: string
  source?: string
  loadPolicy?: string
  enabled?: boolean
}

interface ThreadAgentConfig {
  provider: string
  model: string
  instructions?: string
  agentId?: string
  agentRoot?: string
  isDefaultSecretary?: boolean
  skills?: ThreadAgentSkillConfig[]
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
      const errorEvent = {
        type: 'error',
        error: {
          code: 'internal_error',
          message: error?.message || 'An error occurred',
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
    const chatId = typeof thread.metadata?.chat_id === 'string' ? thread.metadata.chat_id : 'default'
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
    const assistantItem = this.createAssistantItem(thread, context) as any
    const assistantItemId = assistantItem.id
    await this.store.addThreadItem(thread.id, assistantItem, context)
    yield { type: 'thread.item.added', item: assistantItem }

    let fullText = ''

    try {
      const userText = extractUserMessageText((userMessage as any).content)
      const runtimeThread = await this.getRuntimeThread(thread.id)

      if (runtimeThread) {
        const chatId = typeof thread.metadata?.chat_id === 'string' ? thread.metadata.chat_id : 'default'
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
        const messages = await this.buildConversationHistory(thread.id, context, agentConfig)
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
      assistantItem.content = [{ type: 'output_text', text: fullText || 'Sorry, an error occurred.', annotations: [] }]
      assistantItem.status = 'incomplete'
      await this.store.saveItem(thread.id, assistantItem, context)
      yield { type: 'thread.item.done', item: assistantItem }
      yield {
        type: 'error',
        error: {
          code: 'generation_error',
          message: error?.message || 'Failed to generate response',
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

    try {
      const selected = await aiConfigRepository.loadCredentialForBackend(this.db, providerId)
      if (!selected) return null

      await aiConfigRepository.markCredentialUsed(this.db, selected)

      return {
        baseUrl: selected.baseUrl || 'https://openrouter.ai/api/v1',
        apiKey: selected.apiKey,
      }
    } catch (error) {
      console.warn('[LocalChatKitService] shared credential query failed:', error)
      return null
    }
  }

  private async resolveThreadAgentConfig(thread: ThreadMetadata): Promise<ThreadAgentConfig | null> {
    const chatId = typeof thread.metadata?.chat_id === 'string' ? thread.metadata.chat_id : null
    if (!chatId) return null

    try {
      const chat = await this.findChatById(chatId)
      const isDefaultSecretary = this.isDefaultSecretaryChat(chatId, chat)
      const participantRefs = Array.isArray(chat?.participants)
        ? chat.participants.filter((participant: unknown): participant is string => typeof participant === 'string' && participant.length > 0)
        : []

      const contacts = await this.db.select().from(contactTable).execute() as ContactRow[]
      const agents = await this.db.select().from(agentTable).execute() as AgentRow[]
      const selected = this.resolveAgentFromParticipants(participantRefs, contacts, agents)
        ?? (isDefaultSecretary ? this.resolveDefaultSecretaryAgent(agents) : null)

      if (!selected && !isDefaultSecretary) {
        return null
      }

      const provider = normalizeAIConfigProviderId(
        typeof selected?.agent.provider === 'string'
          ? selected.agent.provider
          : (isDefaultSecretary ? DEFAULT_SECRETARY_PROVIDER : ''),
      )
      const model = normalizeAIConfigResourceId(
        typeof selected?.agent.model === 'string'
          ? selected.agent.model
          : (isDefaultSecretary ? DEFAULT_SECRETARY_MODEL : ''),
      )

      if (!provider || !model) {
        return null
      }

      const agentId = this.resolveAgentId(selected?.agent, selected?.agentRef)
        ?? (isDefaultSecretary ? DEFAULT_SECRETARY_AGENT_ID : undefined)
      const agentRoot = this.resolveAgentRoot(selected?.agent, agentId)
      const skills = await this.resolveAgentSkills(agentId, agentRoot, isDefaultSecretary)

      return {
        provider,
        model,
        agentId,
        agentRoot,
        isDefaultSecretary,
        skills,
        instructions: typeof selected?.agent.instructions === 'string' ? selected.agent.instructions : undefined,
      }
    } catch (error) {
      console.warn('[LocalChatKitService] Failed to resolve thread agent config:', error)
      return null
    }
  }

  private resolveAgentFromParticipants(
    participantRefs: string[],
    contacts: ContactRow[],
    agents: AgentRow[],
  ): { agent: AgentRow; agentRef: string } | null {
    for (const participantRef of participantRefs) {
      const contact = contacts.find((entry: any) => this.isSameRecordRef(entry, participantRef))
      const agentRef = typeof contact?.entity === 'string' && contact.entity.length > 0
        ? contact.entity
        : participantRef
      const agent = agents.find((entry: any) => this.isSameAgentRef(entry, agentRef))

      if (agent) {
        return { agent, agentRef }
      }
    }

    return null
  }

  private resolveDefaultSecretaryAgent(agents: AgentRow[]): { agent: AgentRow; agentRef: string } | null {
    const agent = agents.find((entry: any) => {
      const agentId = this.resolveAgentId(entry)
      return agentId === DEFAULT_SECRETARY_AGENT_ID
    })

    return agent
      ? { agent, agentRef: DEFAULT_SECRETARY_AGENT_ID }
      : null
  }

  private isDefaultSecretaryChat(chatId: string, chat: any | null): boolean {
    const chatKey = this.extractChatKey(chatId)
    const chatRole = (chat?.metadata as any)?.linx?.role

    return (
      chatKey === DEFAULT_SECRETARY_CHAT_ID
      || chat?.id === DEFAULT_SECRETARY_CHAT_ID
      || chatRole === 'secretary'
    )
  }

  private extractChatKey(ref: string): string | null {
    const match = ref.match(/\/\.data\/chat\/([^/#]+)\/index\.ttl(?:#.*)?$/)
    if (match?.[1]) return decodeURIComponent(match[1])
    return /^[a-zA-Z0-9_-]+$/.test(ref) ? ref : null
  }

  private resolveAgentId(agent?: AgentRow | null, ref?: string | null): string | null {
    const candidates = [
      ref,
      typeof agent?.id === 'string' ? agent.id : null,
      typeof (agent as any)?.['@id'] === 'string' ? (agent as any)['@id'] : null,
      typeof (agent as any)?.uri === 'string' ? (agent as any).uri : null,
      typeof agent?.root === 'string' ? agent.root : null,
      agent ? resolveRowSubject(agent as Record<string, unknown>) : null,
    ]

    for (const candidate of candidates) {
      const agentId = this.extractAgentIdFromRef(candidate)
      if (agentId) return agentId
    }

    return null
  }

  private extractAgentIdFromRef(ref: string | null | undefined): string | null {
    if (!ref) return null

    const canonicalMatch = ref.match(/(?:^|\/)agents\/([^/#]+)(?:\/|$)/)
    if (canonicalMatch?.[1]) return decodeURIComponent(canonicalMatch[1])

    const localSkillMatch = ref.match(/^([^/#]+)\/skills\//)
    if (localSkillMatch?.[1]) return decodeURIComponent(localSkillMatch[1])

    const compact = ref.replace(/\/+$/, '')
    return /^[a-zA-Z0-9_-]+$/.test(compact) ? compact : null
  }

  private resolveAgentRoot(agent?: AgentRow | null, agentId?: string | null): string | undefined {
    if (typeof agent?.root === 'string' && agent.root.length > 0) {
      return this.resolvePodUrl(agent.root)
    }

    if (!agentId) {
      return undefined
    }

    return this.resolvePodUrl(agentResource.resolveUri(agentResource.buildId({ id: agentId })))
  }

  private async resolveAgentSkills(
    agentId: string | null | undefined,
    agentRoot: string | undefined,
    isDefaultSecretary: boolean,
  ): Promise<ThreadAgentSkillConfig[]> {
    const skills: ThreadAgentSkillConfig[] = []

    try {
      const rows = await this.db.select().from(skillResource).execute() as SkillRow[]

      for (const row of rows) {
        if (row.enabled === false || !this.isSkillForAgent(row, agentId, agentRoot)) {
          continue
        }

        const name = this.resolveSkillName(row)
        if (!name) {
          continue
        }

        skills.push({
          name,
          displayName: typeof row.displayName === 'string' ? row.displayName : undefined,
          root: typeof row.root === 'string' ? this.resolvePodUrl(row.root) : undefined,
          source: typeof row.source === 'string' ? row.source : undefined,
          loadPolicy: typeof row.loadPolicy === 'string' ? row.loadPolicy : undefined,
          enabled: row.enabled !== false,
        })
      }
    } catch (error) {
      console.warn('[LocalChatKitService] Failed to resolve agent skills:', error)
    }

    if (isDefaultSecretary && !skills.some((skill) => skill.name === DEFAULT_SECRETARY_SKILL)) {
      skills.push(this.createDefaultSecretarySkill(agentRoot))
    }

    return this.dedupeSkills(skills)
  }

  private isSkillForAgent(
    row: SkillRow,
    agentId: string | null | undefined,
    agentRoot: string | undefined,
  ): boolean {
    if (!agentId && !agentRoot) return false

    const rowAgentId = this.extractAgentIdFromRef(typeof row.agent === 'string' ? row.agent : undefined)
    if (rowAgentId && rowAgentId === agentId) {
      return true
    }

    const rowIdAgent = this.extractAgentIdFromRef(typeof row.id === 'string' ? row.id : undefined)
    if (rowIdAgent && rowIdAgent === agentId) {
      return true
    }

    const rowRootAgent = this.extractAgentIdFromRef(typeof row.root === 'string' ? row.root : undefined)
    if (rowRootAgent && rowRootAgent === agentId) {
      return true
    }

    return Boolean(agentRoot && typeof row.agent === 'string' && this.resolvePodUrl(row.agent) === agentRoot)
  }

  private resolveSkillName(row: SkillRow): string | null {
    if (typeof row.name === 'string' && row.name.length > 0) {
      return row.name
    }

    return this.extractSkillNameFromRef(typeof row.id === 'string' ? row.id : undefined)
      ?? this.extractSkillNameFromRef(typeof row.root === 'string' ? row.root : undefined)
  }

  private extractSkillNameFromRef(ref: string | null | undefined): string | null {
    if (!ref) return null
    const match = ref.match(/\/skills\/([^/#]+)(?:\/|$)/)
    return match?.[1] ? decodeURIComponent(match[1]) : null
  }

  private createDefaultSecretarySkill(agentRoot: string | undefined): ThreadAgentSkillConfig {
    return {
      name: DEFAULT_SECRETARY_SKILL,
      displayName: 'Symphony',
      root: agentRoot ? new URL(`skills/${DEFAULT_SECRETARY_SKILL}/`, this.ensureTrailingSlash(agentRoot)).toString() : undefined,
      source: 'linx:default-secretary',
      loadPolicy: 'file-backed',
      enabled: true,
    }
  }

  private dedupeSkills(skills: ThreadAgentSkillConfig[]): ThreadAgentSkillConfig[] {
    const seen = new Set<string>()
    const result: ThreadAgentSkillConfig[] = []

    for (const skill of skills) {
      const key = skill.name || skill.root
      if (!key || seen.has(key)) continue
      seen.add(key)
      result.push(skill)
    }

    return result
  }

  private async findChatById(chatId: string): Promise<any | null> {
    const direct = await findExactRecord(this.db as any, chatTable as any, { id: chatId })
    if (direct) return direct

    const chats = await this.db.select().from(chatTable).execute()
    return chats.find((entry: any) => entry.id === chatId || resolveRowSubject(entry) === chatId) ?? null
  }

  private isSameRecordRef(record: Record<string, unknown> | null | undefined, ref: string): boolean {
    if (!record || !ref) return false
    return (
      record.id === ref
      || record['@id'] === ref
      || record.uri === ref
      || resolveRowSubject(record as Record<string, unknown>) === ref
    )
  }

  private isSameAgentRef(record: Record<string, unknown> | null | undefined, ref: string): boolean {
    if (this.isSameRecordRef(record, ref)) {
      return true
    }

    const recordId = this.extractAgentIdFromRef(typeof record?.id === 'string' ? record.id : undefined)
      ?? this.extractAgentIdFromRef(typeof record?.['@id'] === 'string' ? record['@id'] : undefined)
      ?? this.extractAgentIdFromRef(typeof record?.uri === 'string' ? record.uri : undefined)
      ?? this.extractAgentIdFromRef(typeof record?.root === 'string' ? record.root : undefined)
      ?? this.extractAgentIdFromRef(record ? resolveRowSubject(record) : null)
    const refId = this.extractAgentIdFromRef(ref)

    return Boolean(recordId && refId && recordId === refId)
  }

  private resolvePodUrl(value: string): string {
    try {
      return new URL(value).toString()
    } catch {
      const base = resolvePodBaseUrl(this.webId) || this.resolveWebIdOrigin()
      const relative = value.replace(/^\/+/, '')
      try {
        return new URL(relative, this.ensureTrailingSlash(base)).toString()
      } catch {
        return `${base.replace(/\/+$/, '')}/${relative}`
      }
    }
  }

  private resolveWebIdOrigin(): string {
    try {
      return new URL(this.webId).origin
    } catch {
      return this.webId.replace(/\/profile\/card#me$/, '').replace(/\/+$/, '')
    }
  }

  private ensureTrailingSlash(value: string): string {
    return value.endsWith('/') ? value : `${value}/`
  }

  private async buildSystemPrompt(agentConfig: ThreadAgentConfig | null): Promise<string> {
    const sections = [this.systemPrompt]

    if (agentConfig?.instructions?.trim()) {
      sections.push(`Agent instructions:\n${agentConfig.instructions.trim()}`)
    }

    if (agentConfig?.isDefaultSecretary) {
      const homeFiles = await this.loadAgentHomeFiles(agentConfig.agentRoot)
      const skills = this.mergeAgentHomeConfiguredSkills(
        agentConfig.skills ?? [],
        homeFiles,
        agentConfig.agentRoot,
      )
      const loadedSkills = await this.loadSkillFiles(skills, agentConfig.agentRoot)

      sections.push(this.formatSecretaryAgentHomeContext(agentConfig, homeFiles, skills, loadedSkills))
    }

    return sections.filter((section) => section.trim().length > 0).join('\n\n')
  }

  private async loadAgentHomeFiles(agentRoot: string | undefined): Promise<AgentHomeFileProjection[]> {
    if (!agentRoot) return []

    const files: AgentHomeFileProjection[] = []

    for (const path of AGENT_HOME_PROMPT_FILES) {
      const content = await this.readPodTextFile(new URL(path, this.ensureTrailingSlash(agentRoot)).toString())
      if (content?.trim()) {
        files.push({
          path,
          content: this.truncateForPrompt(content.trim(), MAX_AGENT_HOME_FILE_CHARS),
        })
      }
    }

    return files
  }

  private mergeAgentHomeConfiguredSkills(
    skills: ThreadAgentSkillConfig[],
    homeFiles: AgentHomeFileProjection[],
    agentRoot: string | undefined,
  ): ThreadAgentSkillConfig[] {
    const merged = [...skills]
    const configFile = homeFiles.find((file) => file.path === 'config.json')
    const enabledSkillNames = this.extractEnabledSkillNames(configFile?.content)

    for (const name of enabledSkillNames) {
      if (merged.some((skill) => skill.name === name)) {
        continue
      }

      merged.push({
        name,
        root: agentRoot ? new URL(`skills/${encodeURIComponent(name)}/`, this.ensureTrailingSlash(agentRoot)).toString() : undefined,
        source: 'agent-home:config.json',
        loadPolicy: 'file-backed',
        enabled: true,
      })
    }

    if (!merged.some((skill) => skill.name === DEFAULT_SECRETARY_SKILL)) {
      merged.push(this.createDefaultSecretarySkill(agentRoot))
    }

    return this.dedupeSkills(merged)
  }

  private extractEnabledSkillNames(configContent: string | undefined): string[] {
    if (!configContent?.trim()) return []

    try {
      const parsed = JSON.parse(configContent) as { skills?: { enabled?: unknown } }
      return Array.isArray(parsed.skills?.enabled)
        ? parsed.skills.enabled.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : []
    } catch {
      return []
    }
  }

  private async loadSkillFiles(
    skills: ThreadAgentSkillConfig[],
    agentRoot: string | undefined,
  ): Promise<Array<{ skill: ThreadAgentSkillConfig; content: string }>> {
    const result: Array<{ skill: ThreadAgentSkillConfig; content: string }> = []

    for (const skill of skills) {
      const root = skill.root
        ?? (agentRoot ? new URL(`skills/${encodeURIComponent(skill.name)}/`, this.ensureTrailingSlash(agentRoot)).toString() : undefined)
      const content = root
        ? await this.readPodTextFile(new URL('SKILL.md', this.ensureTrailingSlash(root)).toString())
        : null
      const fallback = !content && skill.name === DEFAULT_SECRETARY_SKILL
        ? this.defaultSymphonySkillFallback()
        : null

      if (content?.trim() || fallback) {
        result.push({
          skill,
          content: this.truncateForPrompt((content ?? fallback ?? '').trim(), MAX_SKILL_FILE_CHARS),
        })
      }
    }

    return result
  }

  private async readPodTextFile(url: string): Promise<string | null> {
    try {
      const response = await this.authFetch(url, {
        method: 'GET',
        headers: { Accept: 'text/markdown, text/plain, application/json;q=0.9, */*;q=0.1' },
      })

      if (!response.ok) {
        return null
      }

      return await response.text()
    } catch {
      return null
    }
  }

  private formatSecretaryAgentHomeContext(
    agentConfig: ThreadAgentConfig,
    homeFiles: AgentHomeFileProjection[],
    skills: ThreadAgentSkillConfig[],
    loadedSkills: Array<{ skill: ThreadAgentSkillConfig; content: string }>,
  ): string {
    const lines = [
      'Default Secretary Agent Home is active.',
      `Agent key: ${agentConfig.agentId ?? DEFAULT_SECRETARY_AGENT_ID}`,
      `Agent root: ${agentConfig.agentRoot ?? '/agents/__secretary__/'}`,
      'Treat this Agent Home as the instruction root for this chat surface.',
    ]

    if (skills.length > 0) {
      lines.push('')
      lines.push('Enabled skills:')
      for (const skill of skills) {
        lines.push(`- ${skill.name}${skill.root ? ` (${skill.root})` : ''}`)
      }
    }

    for (const file of homeFiles) {
      lines.push('')
      lines.push(`Agent Home file: ${file.path}`)
      lines.push(file.content)
    }

    for (const entry of loadedSkills) {
      lines.push('')
      lines.push(`Skill file: ${entry.skill.name}/SKILL.md`)
      lines.push(entry.content)
    }

    return lines.join('\n')
  }

  private defaultSymphonySkillFallback(): string {
    return [
      '# Symphony',
      '',
      'Use the Symphony control-plane skill when coordinating system evolution.',
      'Maintain system situation, evolution judgment, execution control, and evidence feedback.',
      'Do not treat every message as an issue; distinguish ideas, existing work changes, tasks, runs, deliveries, and evidence.',
      'Default Secretary identity is `__secretary__`; `ai-secretary` is only the chat surface id.',
    ].join('\n')
  }

  private truncateForPrompt(content: string, maxChars: number): string {
    if (content.length <= maxChars) return content
    return `${content.slice(0, maxChars)}\n\n[truncated]`
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
    let issuerUrl = this.webId
    try {
      issuerUrl = new URL(this.webId).origin
    } catch {
      issuerUrl = resolvePodBaseUrl(this.webId) || issuerUrl
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
    agentConfig: ThreadAgentConfig | null,
  ): Promise<Array<{ role: string; content: string }>> {
    const systemPrompt = await this.buildSystemPrompt(agentConfig)
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
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
