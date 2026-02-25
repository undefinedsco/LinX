/**
 * Local (Browser) ChatKit Service
 *
 * Ports the xpod ChatKitService logic to run entirely in the browser.
 * Uses LocalChatKitStore for Pod persistence and chatOps.getCredential()
 * to read AI API keys from the Pod.
 *
 * No API server round-trip — fetch goes directly to the AI provider.
 */

import { eq, and } from 'drizzle-solid'
import type { ChatKitStore, StoreContext } from '@undefineds.co/xpod/dist/api/chatkit/store'
import {
  isStreamingReq,
  generateId, nowTimestamp, extractUserMessageText,
  type ThreadMetadata, type ThreadItem,
  type ThreadStreamEvent,
  type StreamingReq, type NonStreamingReq,
  type ChatKitReq,
} from '@undefineds.co/xpod/dist/api/chatkit/types'
import { Credential } from '@undefineds.co/xpod/dist/credential/schema/tables'
import { ServiceType, CredentialStatus } from '@undefineds.co/xpod/dist/credential/schema/types'
import type { SolidDatabase } from '@linx/models'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class LocalChatKitService {
  private store: ChatKitStore<StoreContext>
  private db: SolidDatabase
  private webId: string
  private authFetch: typeof fetch
  private systemPrompt: string

  constructor(options: LocalServiceOptions) {
    this.store = options.store
    this.db = options.db
    this.webId = options.webId
    this.authFetch = options.authFetch
    this.systemPrompt = options.systemPrompt ?? 'You are a helpful assistant.'
  }

  async process(requestBody: string, context: StoreContext): Promise<ChatKitResult> {
    let request: ChatKitReq
    try {
      request = JSON.parse(requestBody)
    } catch {
      throw new Error('Invalid JSON request body')
    }

    console.log('[LocalChatKitService] Processing request:', request.type)

    if (isStreamingReq(request)) {
      return {
        type: 'streaming',
        stream: () => this.processStreamingAsBytes(request as StreamingReq, context),
      }
    }
    const result = await this.processNonStreaming(request as NonStreamingReq, context)
    return { type: 'non_streaming', json: JSON.stringify(result) }
  }

  // -----------------------------------------------------------------------
  // SSE byte encoding
  // -----------------------------------------------------------------------

  private async *processStreamingAsBytes(
    request: StreamingReq,
    context: StoreContext,
  ): AsyncIterable<Uint8Array> {
    const encoder = new TextEncoder()
    try {
      for await (const event of this.processStreaming(request, context)) {
        const eventJson = JSON.stringify(event)
        console.log('[LocalChatKitService] SSE event:', event.type)
        if (event.type === 'thread.item.added' || event.type === 'thread.item.done') {
          console.log('[LocalChatKitService] Item event detail:', eventJson.slice(0, 500))
        }
        yield encoder.encode(`data: ${eventJson}\n\n`)
      }
      console.log('[LocalChatKitService] Stream completed normally')
    } catch (error: any) {
      console.error('[LocalChatKitService] Stream error:', error)
      const errorEvent = {
        type: 'error',
        error: { code: 'internal_error', message: error.message || 'An error occurred' },
      }
      yield encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`)
    }
  }

  // -----------------------------------------------------------------------
  // Streaming dispatch
  // -----------------------------------------------------------------------

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
        // no-op
        break
    }
  }

  // -----------------------------------------------------------------------
  // Non-streaming dispatch
  // -----------------------------------------------------------------------

  private async processNonStreaming(
    request: NonStreamingReq,
    context: StoreContext,
  ): Promise<unknown> {
    console.log('[LocalChatKitService] Non-streaming request:', request.type)
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
    }
  }

  // -----------------------------------------------------------------------
  // Streaming handlers
  // -----------------------------------------------------------------------

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
    if (item.type === 'client_tool_call') {
      const updatedItem = { ...item, output: params.output, status: 'completed' as const }
      await this.store.saveItem(params.thread_id, updatedItem, context)
      yield { type: 'thread.item.done', item: updatedItem }
    }
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

  // -----------------------------------------------------------------------
  // Non-streaming handlers
  // -----------------------------------------------------------------------

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
    if (params.title !== undefined) thread.title = params.title
    thread.updated_at = nowTimestamp()
    await this.store.saveThread(thread, context)
    return thread
  }

  private async handleThreadsDelete(params: any, context: StoreContext) {
    await this.store.deleteThread(params.thread_id, context)
    return { success: true }
  }

  // -----------------------------------------------------------------------
  // Core AI response generation
  // -----------------------------------------------------------------------

  private async *respond(
    thread: ThreadMetadata,
    userMessage: ThreadItem,
    context: StoreContext,
    inferenceOptions?: any,
  ): AsyncIterable<ThreadStreamEvent> {
    // Build conversation history
    const messages = await this.buildConversationHistory(thread.id, context)

    // Create assistant message placeholder
    const assistantItemId = this.store.generateItemId('assistant_message', thread, context)
    const assistantItem: any = {
      id: assistantItemId,
      thread_id: thread.id,
      type: 'assistant_message',
      content: [{ type: 'output_text', text: '', annotations: [], inline_widgets: [] }],
      attachments: [],
      status: 'in_progress',
      created_at: nowTimestamp(),
    }
    await this.store.addThreadItem(thread.id, assistantItem, context)
    yield { type: 'thread.item.added', item: assistantItem }

    // Get AI credentials from Pod
    const aiConfig = await this.getAiConfig()
    if (!aiConfig) {
      assistantItem.content = [{ type: 'output_text', text: '请先在设置中配置 AI API Key。', annotations: [], inline_widgets: [] }]
      assistantItem.status = 'completed'
      await this.store.saveItem(thread.id, assistantItem, context)
      yield { type: 'thread.item.done', item: assistantItem }
      return
    }

    // Stream AI response
    let fullText = ''
    try {
      const model = inferenceOptions?.model ?? aiConfig.defaultModel ?? 'openai/gpt-4o-mini'
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

      assistantItem.content = [{ type: 'output_text', text: fullText, annotations: [], inline_widgets: [] }]
      assistantItem.status = 'completed'
      await this.store.saveItem(thread.id, assistantItem, context)
      yield { type: 'thread.item.done', item: assistantItem }
    } catch (error: any) {
      console.error('[LocalChatKitService] AI response failed:', error)
      assistantItem.content = [{ type: 'output_text', text: fullText || 'Sorry, an error occurred.', annotations: [], inline_widgets: [] }]
      assistantItem.status = 'incomplete'
      await this.store.saveItem(thread.id, assistantItem, context)
      yield { type: 'thread.item.done', item: assistantItem }
      yield {
        type: 'error',
        error: { code: 'generation_error', message: error.message || 'Failed to generate response' },
      } as ThreadStreamEvent
    }

    // Auto-generate title
    if (!thread.title && fullText) {
      try {
        const userText = extractUserMessageText((userMessage as any).content)
        let title = userText.slice(0, 50)
        if (userText.length > 50) title += '...'
        thread.title = title || 'New Chat'
        thread.updated_at = nowTimestamp()
        await this.store.saveThread(thread, context)
        yield { type: 'thread.updated', thread }
      } catch { /* ignore title errors */ }
    }
  }

  // -----------------------------------------------------------------------
  // AI provider integration
  // -----------------------------------------------------------------------

  private async getAiConfig(): Promise<{
    baseUrl: string
    apiKey: string
    defaultModel?: string
  } | null> {
    // Try drizzle-solid first, fall back to direct fetch + Turtle parsing
    try {
      const credentials = await this.db.select().from(Credential)
        .where(
          and(
            eq(Credential.service, ServiceType.AI),
            eq(Credential.status, CredentialStatus.ACTIVE),
          ),
        )
        .execute()

      if (credentials.length > 0) {
        const cred = credentials[0] as any
        return {
          baseUrl: cred.baseUrl || 'https://openrouter.ai/api/v1',
          apiKey: cred.apiKey as string,
        }
      }
    } catch (err) {
      console.warn('[LocalChatKitService] drizzle-solid credential query failed, trying direct fetch:', err)
    }

    // Fallback: read credentials.ttl directly via authFetch
    try {
      const podBase = this.webId.replace('/profile/card#me', '')
      const credUrl = `${podBase}/settings/credentials.ttl`
      const resp = await this.authFetch(credUrl, {
        headers: { 'Accept': 'text/turtle' },
      })
      if (!resp.ok) {
        console.log('[LocalChatKitService] credentials.ttl not found:', resp.status)
        return null
      }
      const turtle = await resp.text()
      return this.parseCredentialFromTurtle(turtle)
    } catch (err) {
      console.warn('[LocalChatKitService] Direct credential fetch failed:', err)
      return null
    }
  }

  private parseCredentialFromTurtle(turtle: string): {
    baseUrl: string
    apiKey: string
    defaultModel?: string
  } | null {
    // Simple Turtle parser for credential fields
    // Look for active AI credentials
    const lines = turtle.split('\n')
    let apiKey: string | null = null
    let baseUrl: string | null = null
    let service: string | null = null
    let status: string | null = null

    for (const line of lines) {
      const trimmed = line.trim()
      const matchStr = (pred: string) => {
        const regex = new RegExp(`<https://undefineds\\.co/ns#${pred}>\\s+"([^"]*)"`)
        const m = trimmed.match(regex)
        return m ? m[1] : null
      }
      apiKey = matchStr('apiKey') ?? apiKey
      baseUrl = matchStr('baseUrl') ?? baseUrl
      service = matchStr('service') ?? service
      status = matchStr('status') ?? status
    }

    if (service === 'ai' && status === 'active' && apiKey) {
      return {
        baseUrl: baseUrl || 'https://openrouter.ai/api/v1',
        apiKey,
      }
    }

    console.log('[LocalChatKitService] No active AI credential found in Turtle')
    return null
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
        'Authorization': `Bearer ${config.apiKey}`,
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
    if (!reader) throw new Error('No response body')

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
          if (delta) yield delta
        } catch {
          // skip malformed SSE lines
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private async buildConversationHistory(
    threadId: string,
    context: StoreContext,
  ): Promise<Array<{ role: string; content: string }>> {
    const messages: Array<{ role: string; content: string }> = []
    messages.push({ role: 'system', content: this.systemPrompt })

    const items = await this.store.loadThreadItems(threadId, undefined, 100, 'asc', context)
    for (const item of items.data) {
      if (item.type === 'user_message') {
        const text = extractUserMessageText((item as any).content)
        if (text) messages.push({ role: 'user', content: text })
      } else if (item.type === 'assistant_message') {
        const text = (item as any).content
          .filter((c: any) => c.type === 'output_text')
          .map((c: any) => c.text)
          .join('\n')
        if (text) messages.push({ role: 'assistant', content: text })
      }
    }
    return messages
  }

  private createUserMessage(
    threadId: string,
    content: any[],
    thread?: ThreadMetadata,
  ): ThreadItem {
    const dummyThread = thread || { id: threadId, status: { type: 'active' as const }, created_at: nowTimestamp(), updated_at: nowTimestamp() }
    const itemId = this.store.generateItemId('user_message', dummyThread, {})
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
