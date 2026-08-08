/**
 * Local (Browser) ChatKit Service
 *
 * Ports the xpod ChatKitService logic to run entirely in the browser.
 * Uses LocalChatKitStore for Pod persistence and the authenticated Xpod runtime
 * as the AI provider boundary.
 */

import { resolveLinxRuntimeApiBaseUrlForIssuerUrl } from '@undefineds.co/models/client'
import type { ChatKitStore, StoreContext } from '@/lib/vendor/xpod-chatkit'
import {
  extractUserMessageText,
  isStreamingReq,
  nowTimestamp,
  type ChatKitReq,
  type Attachment,
  type NonStreamingReq,
  type StreamingReq,
  type ThreadItem,
  type ThreadMetadata,
  type ThreadStreamEvent,
} from '@/lib/vendor/xpod-chatkit'
import {
  agentResource,
  chatResource,
  contactResource,
  extractChatIdFromChatRef,
  normalizeAIConfigProviderId,
  normalizeAIConfigResourceId,
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
import { formatErrorForUser } from '@/lib/user-facing-errors'
import { RuntimeSidecarSink } from './runtime-sidecar'
import {
  mergeChatKitAnnotations,
  normalizeModelAnnotations,
  type ChatKitAnnotation,
} from './model-annotations'
import { sendMatrixThreadMessage } from '../../matrix-service'
import { attachmentToModelParts, type ModelContentPart } from './attachment-content'
import {
  DEFAULT_AGENT_AI_RUNTIME_LOCATION,
  readAgentAiRuntimeLocation,
  type AgentAiRuntimeLocation,
} from '../../agent-runtime-location'

function readChatIdFromThread(thread: ThreadMetadata): string | null {
  if (typeof thread.metadata?.chat_id !== 'string') {
    return null
  }
  return extractChatIdFromChatRef(thread.metadata.chat_id) ?? thread.metadata.chat_id
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError'
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

type LocalChatKitStorePort = ChatKitStore<StoreContext> & {
  createAttachment?: (input: { name: string; mime_type: string }) => Attachment
  uploadAttachment?: (attachmentId: string, body: BodyInit, mimeType?: string, signal?: AbortSignal) => Promise<Attachment>
  readAttachmentBytes?: (attachmentId: string) => Promise<Uint8Array>
}

type ModelMessage = { role: string; content: string | ModelContentPart[] }

export interface LocalServiceOptions {
  store: LocalChatKitStorePort
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

interface ModelStreamChunk {
  text: string
  annotations: ChatKitAnnotation[]
}

interface ModelResponse {
  text: string
  annotations: ChatKitAnnotation[]
}

function isWebSearchRequested(inferenceOptions: unknown): boolean {
  if (!inferenceOptions || typeof inferenceOptions !== 'object') return false
  const toolChoice = (inferenceOptions as { tool_choice?: unknown }).tool_choice
  return Boolean(
    toolChoice
    && typeof toolChoice === 'object'
    && (toolChoice as { id?: unknown }).id === 'web_search',
  )
}

function describeRuntimeToolProgress(name: string): { icon: string; text: string } {
  const normalized = name.toLowerCase()
  if (/(search|grep|find|lookup|query)/.test(normalized)) {
    return { icon: 'search', text: '正在搜索相关资料…' }
  }
  if (/(read|open|list|inspect|view)/.test(normalized)) {
    return { icon: 'document', text: '正在读取工作区内容…' }
  }
  if (/(write|edit|patch|delete|remove|move)/.test(normalized)) {
    return { icon: 'write', text: '工作区变更等待确认…' }
  }
  if (/(exec|shell|bash|terminal|command)/.test(normalized)) {
    return { icon: 'square-code', text: '正在运行工作区命令…' }
  }
  return { icon: 'settings-slider', text: '正在使用工作区工具…' }
}

function readBranchParentId(item: ThreadItem): string | undefined {
  const value = (item as ThreadItem & { parent_item_id?: unknown }).parent_item_id
  return typeof value === 'string' ? value : undefined
}

function readBranchId(item: ThreadItem): string | undefined {
  const value = (item as ThreadItem & { branch_id?: unknown }).branch_id
  return typeof value === 'string' ? value : undefined
}

function projectActiveBranchItems<T extends { data: ThreadItem[] }>(
  page: T,
  rawActive: unknown,
): T {
  if (!rawActive || typeof rawActive !== 'object') return page
  const active = rawActive as Record<string, unknown>
  const hidden = new Set<string>()

  for (const item of page.data) {
    const parentId = readBranchParentId(item)
    if (!parentId) continue
    const selectedId = active[parentId]
    if (typeof selectedId === 'string' && item.id !== selectedId) {
      hidden.add(item.id)
    }
  }

  let changed = true
  while (changed) {
    changed = false
    for (const item of page.data) {
      const parentId = readBranchParentId(item)
      if (!hidden.has(item.id) && parentId && hidden.has(parentId)) {
        hidden.add(item.id)
        changed = true
      }
    }
  }

  return { ...page, data: page.data.filter((item) => !hidden.has(item.id)) }
}

function collectItemSubtreeIds(items: readonly ThreadItem[], rootId: string): Set<string> {
  const deleted = new Set<string>([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const item of items) {
      const parentId = readBranchParentId(item)
      if (!deleted.has(item.id) && parentId && deleted.has(parentId)) {
        deleted.add(item.id)
        changed = true
      }
    }
  }
  return deleted
}

function pruneActiveBranchSelections(
  rawActive: unknown,
  deletedIds: ReadonlySet<string>,
  items: readonly ThreadItem[],
): Record<string, string> {
  if (!rawActive || typeof rawActive !== 'object') return {}
  const next: Record<string, string> = {}
  for (const [parentId, selectedId] of Object.entries(rawActive as Record<string, unknown>)) {
    if (deletedIds.has(parentId) || typeof selectedId !== 'string') continue
    if (!deletedIds.has(selectedId)) {
      next[parentId] = selectedId
      continue
    }
    const replacement = [...items]
      .reverse()
      .find((item) => !deletedIds.has(item.id) && readBranchParentId(item) === parentId)
    if (replacement) next[parentId] = replacement.id
  }
  return next
}

function parseResponsesApiResult(value: unknown): ModelResponse {
  if (!value || typeof value !== 'object') {
    throw new Error('联网搜索没有返回可用的回答。请稍后重试。')
  }

  const response = value as { output_text?: unknown; output?: unknown }
  let text = ''
  let annotations: ChatKitAnnotation[] = []

  if (Array.isArray(response.output)) {
    for (const output of response.output) {
      if (!output || typeof output !== 'object') continue
      const content = (output as { content?: unknown }).content
      if (!Array.isArray(content)) continue

      for (const part of content) {
        if (!part || typeof part !== 'object') continue
        const outputPart = part as { type?: unknown; text?: unknown; annotations?: unknown }
        if (outputPart.type !== 'output_text' || typeof outputPart.text !== 'string') continue
        const offset = text.length
        text += outputPart.text
        const normalized = normalizeModelAnnotations(outputPart.annotations, outputPart.text.length)
          .map((annotation) => ({ ...annotation, index: offset + annotation.index }))
        annotations = mergeChatKitAnnotations(annotations, normalized)
      }
    }
  }

  if (!text && typeof response.output_text === 'string') {
    text = response.output_text
  }

  if (!text) {
    throw new Error('联网搜索没有返回可用的回答。请稍后重试。')
  }

  return { text, annotations }
}

function coerceModelStreamChunk(chunk: ModelStreamChunk | string): ModelStreamChunk {
  return typeof chunk === 'string'
    ? { text: chunk, annotations: [] }
    : {
        text: typeof chunk?.text === 'string' ? chunk.text : '',
        annotations: Array.isArray(chunk?.annotations) ? chunk.annotations : [],
      }
}

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

type RuntimeThreadEvent =
  | { type: 'meta'; ts: number; threadId: string }
  | { type: 'status'; ts: number; threadId: string; status: RuntimeThreadStatus }
  | { type: 'stdout'; ts: number; threadId: string; text: string }
  | { type: 'stderr'; ts: number; threadId: string; text: string }
  | { type: 'assistant_delta'; ts: number; threadId: string; text: string }
  | { type: 'assistant_done'; ts: number; threadId: string; text: string; annotations?: unknown[] }
  | { type: 'auth_required'; ts: number; threadId: string; method: string; url?: string; message?: string; options?: Array<{ label?: string; url?: string; method?: string }> }
  | { type: 'tool_call'; ts: number; threadId: string; requestId: string; name: string; arguments: string }
  | { type: 'exit'; ts: number; threadId: string; code: number | null; signal?: string }
  | { type: 'error'; ts: number; threadId: string; message: string }

export class LocalChatKitService {
  private store: LocalServiceOptions['store']
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
      if (isAbortError(error)) return
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
        yield* this.handleCustomAction(request.params, context)
        break
    }
  }

  private async *handleCustomAction(params: any, context: StoreContext): AsyncIterable<ThreadStreamEvent> {
    // ChatKit wraps actions as `{ action: { type, payload }, item_id? }`.
    // Keep accepting the former flattened shape for protocol compatibility.
    const actionEnvelope = params?.action
    const payload = actionEnvelope && typeof actionEnvelope === 'object'
      && actionEnvelope.payload && typeof actionEnvelope.payload === 'object'
      ? actionEnvelope.payload
      : params
    const action = typeof actionEnvelope === 'string'
      ? actionEnvelope
      : typeof actionEnvelope?.type === 'string'
        ? actionEnvelope.type
        : typeof payload?.action === 'string'
          ? payload.action
          : ''
    const threadId = typeof payload?.thread_id === 'string'
      ? payload.thread_id
      : typeof params?.thread_id === 'string'
        ? params.thread_id
        : ''
    const itemId = typeof payload?.item_id === 'string'
      ? payload.item_id
      : typeof params?.item_id === 'string'
        ? params.item_id
        : ''
    if (!threadId || !itemId) throw new Error('消息操作缺少 thread_id 或 item_id。')

    if (action === 'message.select_branch') {
      const thread = await this.store.loadThread(threadId, context)
      const active = { ...(thread.metadata?.active_branch_by_parent as Record<string, string> | undefined) }
      const parentId = typeof payload?.parent_item_id === 'string' ? payload.parent_item_id : 'root'
      active[parentId] = itemId
      thread.metadata = { ...(thread.metadata ?? {}), active_branch_by_parent: active }
      thread.updated_at = nowTimestamp()
      await this.store.saveThread(thread, context)
      yield { type: 'thread.updated', thread } as ThreadStreamEvent
      return
    }

    if (action === 'message.delete') {
      const thread = await this.store.loadThread(threadId, context)
      const page = await this.store.loadThreadItems(threadId, undefined, 1000, 'asc', context)
      const deletedIds = collectItemSubtreeIds(page.data, itemId)
      for (const deletedId of deletedIds) {
        await this.store.deleteThreadItem(threadId, deletedId, context)
        yield { type: 'thread.item.deleted', thread_id: threadId, item_id: deletedId }
      }
      const active = pruneActiveBranchSelections(
        thread.metadata?.active_branch_by_parent,
        deletedIds,
        page.data,
      )
      thread.metadata = { ...(thread.metadata ?? {}), active_branch_by_parent: active }
      thread.updated_at = nowTimestamp()
      await this.store.saveThread(thread, context)
      return
    }

    if (action === 'message.edit') {
      const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
      if (!text) throw new Error('编辑后的消息不能为空。')
      const item = await this.store.loadItem(threadId, itemId, context)
      if (item.type !== 'user_message') throw new Error('只有用户消息可以编辑。')
      const thread = await this.store.loadThread(threadId, context)
      const page = await this.store.loadThreadItems(threadId, undefined, 1000, 'asc', context)
      const branchParentId = readBranchParentId(item)
        ?? `branch-root:${item.id}`
      const originalBranchId = readBranchId(item)
        ?? `branch-original:${item.id}`
      const original = {
        ...item,
        parent_item_id: branchParentId,
        branch_id: originalBranchId,
      } as ThreadItem
      await this.store.saveItem(threadId, original, context)
      await this.linkFollowingResponseItems(
        threadId,
        page.data,
        item.id,
        originalBranchId,
        context,
      )
      const branchId = `branch-${crypto.randomUUID()}`
      const edited = {
        ...item,
        id: this.store.generateItemId('user_message', { id: threadId } as ThreadMetadata, context),
        content: [{ type: 'input_text', text }],
        updated_at: nowTimestamp(),
        parent_item_id: branchParentId,
        branch_id: branchId,
        supersedes: item.id,
      } as ThreadItem
      await this.store.saveItem(threadId, edited, context)
      const active = { ...(thread.metadata?.active_branch_by_parent as Record<string, string> | undefined) }
      active[branchParentId] = edited.id
      thread.metadata = { ...(thread.metadata ?? {}), active_branch_by_parent: active }
      thread.updated_at = nowTimestamp()
      await this.store.saveThread(thread, context)
      yield { type: 'thread.item.added', item: edited }
      if (payload?.regenerate === true) {
        yield* this.respond(thread, edited, context, (edited as any).inference_options)
      }
      return
    }

    throw new Error(`不支持的消息操作：${action || 'unknown'}`)
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
        return this.handleItemsFeedback(request.params, context)
      case 'attachments.create':
        if (!this.store.createAttachment) throw new Error('Attachment storage is unavailable')
        return this.store.createAttachment(request.params)
      case 'attachments.delete':
        await this.store.deleteAttachment(request.params.attachment_id, context)
        return {}
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
        params.input.attachments,
        params.input.inference_options,
        thread,
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
      yield* this.respond(thread, userMessage, context, params.input.inference_options)
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
      params.input.attachments,
      params.input.inference_options,
      thread,
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
      if (item.type === 'user_message') lastUserMessage = item
      if (item.id === params.item_id) break
    }

    if (lastUserMessage) {
      await this.linkFollowingResponseItems(
        params.thread_id,
        items.data,
        lastUserMessage.id,
        readBranchId(lastUserMessage) ?? `branch:${lastUserMessage.id}`,
        context,
      )
      const inferenceOptions = lastUserMessage.type === 'user_message'
        ? lastUserMessage.inference_options
        : undefined
      if (inferenceOptions) {
        yield* this.respond(thread, lastUserMessage, context, inferenceOptions, { selectResponseBranch: true })
      } else {
        yield* this.respond(thread, lastUserMessage, context, undefined, { selectResponseBranch: true })
      }
    }
  }

  private async handleThreadsGetById(params: any, context: StoreContext) {
    const thread = await this.store.loadThread(params.thread_id, context)
    const items = await this.store.loadThreadItems(params.thread_id, undefined, 50, 'asc', context)
    return { ...thread, items: projectActiveBranchItems(items, thread.metadata?.active_branch_by_parent) }
  }

  private async handleThreadsList(params: any, context: StoreContext) {
    return this.store.loadThreads(params?.limit ?? 20, params?.after, params?.order ?? 'desc', context)
  }

  private async handleItemsList(params: any, context: StoreContext) {
    const page = await this.store.loadThreadItems(params.thread_id, params.after, params.limit ?? 50, params.order ?? 'asc', context)
    const thread = await this.store.loadThread(params.thread_id, context)
    return projectActiveBranchItems(page, thread.metadata?.active_branch_by_parent)
  }

  private async handleItemsFeedback(params: any, context: StoreContext) {
    const itemIds = Array.isArray(params.item_ids) ? params.item_ids : []
    await Promise.all(itemIds.map(async (itemId: string) => {
      const item = await this.store.loadItem(params.thread_id, itemId, context) as ThreadItem & Record<string, unknown>
      item.feedback = params.kind
      await this.store.saveItem(params.thread_id, item, context)
    }))
    return {}
  }

  async uploadAttachment(attachmentId: string, body: BodyInit, mimeType?: string, signal?: AbortSignal) {
    if (!this.store.uploadAttachment) throw new Error('Attachment storage is unavailable')
    return this.store.uploadAttachment(attachmentId, body, mimeType, signal)
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
    responseOptions: { selectResponseBranch?: boolean } = {},
  ): AsyncIterable<ThreadStreamEvent> {
    const messages = await this.buildConversationHistory(thread.id, context)

    const assistantItem = this.createAssistantItem(thread, context, userMessage) as any
    const assistantItemId = assistantItem.id
    await this.store.addThreadItem(thread.id, assistantItem, context)
    if (responseOptions.selectResponseBranch) {
      const active = { ...(thread.metadata?.active_branch_by_parent as Record<string, string> | undefined) }
      active[userMessage.id] = assistantItem.id
      thread.metadata = { ...(thread.metadata ?? {}), active_branch_by_parent: active }
      thread.updated_at = nowTimestamp()
      await this.store.saveThread(thread, context)
    }
    yield { type: 'thread.item.added', item: assistantItem }

    let fullText = ''
    let annotations: ChatKitAnnotation[] = []

    try {
      const userText = await this.buildRuntimeUserText(userMessage)
      const agentConfig = await this.resolveThreadAgentConfig(thread)
      const webSearchRequested = isWebSearchRequested(inferenceOptions)
      const platformModel = this.resolvePlatformModel(agentConfig, inferenceOptions?.model)
        ?? (webSearchRequested && !agentConfig ? 'linx-lite' : null)
      // An explicitly selected composer tool is a per-message routing decision.
      // It must not be swallowed by a long-lived coding/runtime session.
      const runtimeThread = webSearchRequested ? null : await this.getRuntimeThread(thread.id)

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
        if (platformModel) {
          if (webSearchRequested) {
            yield {
              type: 'progress_update',
              icon: 'search',
              text: '正在搜索网络并整理来源…',
            } as ThreadStreamEvent
            const result = await this.respondWithLinxWebSearch(
              platformModel,
              messages,
              inferenceOptions,
              agentConfig?.aiRuntimeLocation ?? DEFAULT_AGENT_AI_RUNTIME_LOCATION,
              context.signal as AbortSignal | undefined,
            )
            fullText = result.text
            annotations = result.annotations
            yield {
              type: 'thread.item.updated',
              item_id: assistantItemId,
              update: {
                type: 'assistant_message.content_part.text_delta',
                part_index: 0,
                delta: fullText,
              },
            } as ThreadStreamEvent
            assistantItem.content = [{ type: 'output_text', text: fullText, annotations }]
            assistantItem.status = 'completed'
            await this.store.saveItem(thread.id, assistantItem, context)
            yield { type: 'thread.item.done', item: assistantItem }
            return
          }

          const stream = this.streamFromLinxRuntime(
            platformModel,
            messages,
            inferenceOptions,
            agentConfig?.aiRuntimeLocation ?? DEFAULT_AGENT_AI_RUNTIME_LOCATION,
            context.signal as AbortSignal | undefined,
          )

          for await (const chunk of stream) {
            const normalizedChunk = coerceModelStreamChunk(chunk)
            fullText += normalizedChunk.text
            annotations = mergeChatKitAnnotations(annotations, normalizedChunk.annotations)
            if (normalizedChunk.text) {
              yield {
                type: 'thread.item.updated',
                item_id: assistantItemId,
                update: {
                  type: 'assistant_message.content_part.text_delta',
                  part_index: 0,
                  delta: normalizedChunk.text,
                },
              } as ThreadStreamEvent
            }
          }

          assistantItem.content = [{ type: 'output_text', text: fullText, annotations }]
          assistantItem.status = 'completed'
          await this.store.saveItem(thread.id, assistantItem, context)
          yield { type: 'thread.item.done', item: assistantItem }
          return
        }

        const provider = agentConfig?.provider ?? 'openai'
        const model = inferenceOptions?.model ?? agentConfig?.model ?? 'openai/gpt-4o-mini'
        if (webSearchRequested) {
          throw new Error('当前自定义 AI 供应商不支持 LinX 联网搜索。请切换到 LinX 平台模型后重试。')
        }
        const stream = this.streamFromProviderRuntime(
          provider,
          model,
          messages,
          inferenceOptions,
          context.signal as AbortSignal | undefined,
        )

        for await (const chunk of stream) {
          const normalizedChunk = coerceModelStreamChunk(chunk)
          fullText += normalizedChunk.text
          annotations = mergeChatKitAnnotations(annotations, normalizedChunk.annotations)
          if (normalizedChunk.text) {
            yield {
              type: 'thread.item.updated',
              item_id: assistantItemId,
              update: {
                type: 'assistant_message.content_part.text_delta',
                part_index: 0,
                delta: normalizedChunk.text,
              },
            } as ThreadStreamEvent
          }
        }

        if (!fullText.trim() && annotations.length === 0) {
          throw new Error('AI provider returned an empty response')
        }

        assistantItem.content = [{ type: 'output_text', text: fullText, annotations }]
        assistantItem.status = 'completed'
        await this.store.saveItem(thread.id, assistantItem, context)
        yield { type: 'thread.item.done', item: assistantItem }
      }
    } catch (error: any) {
      const webSearchFailed = isWebSearchRequested(inferenceOptions) && !isAbortError(error)
      const searchErrorMessage = error instanceof Error ? error.message : ''
      const userMessage = webSearchFailed
        ? searchErrorMessage.startsWith('当前自定义 AI 供应商不支持')
          ? searchErrorMessage
          : '联网搜索暂不可用。请检查本地 xpod 的 AI 上游配置后重试。'
        : formatErrorForUser(error, '消息生成失败。请稍后重试。')
      if (webSearchFailed) {
        // Search capability failures are already represented as an inline,
        // retryable assistant item. Emitting a ChatKit stream error as well
        // adds an unrelated generic error card and makes a known upstream
        // capability gap look like a broken conversation.
        console.warn('[LocalChatKitService] Web search unavailable:', userMessage)
      } else if (!isAbortError(error)) {
        console.error('[LocalChatKitService] AI/runtime response failed:', error)
      }
      if (webSearchFailed) {
        yield {
          type: 'progress_update',
          icon: 'search',
          text: '联网搜索失败',
        } as ThreadStreamEvent
      }
      assistantItem.content = [{
        type: 'output_text',
        text: fullText || (isAbortError(error) ? '已停止生成。' : userMessage),
        annotations: [],
      }]
      assistantItem.status = 'incomplete'
      await this.store.saveItem(thread.id, assistantItem, context)
      yield { type: 'thread.item.done', item: assistantItem }
      if (isAbortError(error)) return
      if (webSearchFailed) return
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

    if (
      runtimeThread.status === 'idle'
      || runtimeThread.status === 'completed'
      || runtimeThread.status === 'error'
    ) {
      const response = await fetch(`/api/runtime/threads/${runtimeThread.id}/start`, { method: 'POST' })
      if (!response.ok) throw new Error('Failed to start runtime thread')
      return
    }
  }

  private createAssistantItem(
    thread: ThreadMetadata,
    context: StoreContext,
    parentItem?: ThreadItem,
  ): ThreadItem {
    return {
      id: this.store.generateItemId('assistant_message', thread, context),
      thread_id: thread.id,
      type: 'assistant_message',
      content: [{ type: 'output_text', text: '', annotations: [] }],
      attachments: [],
      status: 'in_progress',
      ...(parentItem ? {
        parent_item_id: parentItem.id,
        branch_id: readBranchId(parentItem) ?? `branch:${parentItem.id}`,
      } : {}),
      created_at: nowTimestamp(),
    } as ThreadItem
  }

  private async linkFollowingResponseItems(
    threadId: string,
    items: ThreadItem[],
    userItemId: string,
    branchId: string,
    context: StoreContext,
  ): Promise<void> {
    const userIndex = items.findIndex((item) => item.id === userItemId)
    if (userIndex < 0) return
    for (const following of items.slice(userIndex + 1)) {
      if (following.type === 'user_message') break
      if (readBranchParentId(following)) continue
      const linked = {
        ...following,
        parent_item_id: userItemId,
        branch_id: readBranchId(following) ?? branchId,
      } as unknown as ThreadItem
      await this.store.saveItem(threadId, linked, context)
    }
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
    sendRequest: (signal: AbortSignal) => Promise<Response>,
    notices: {
      toolCall: string
      authRequired: string
      requestFailed: string
    },
  ): AsyncIterable<ThreadStreamEvent> {
    await this.ensureRuntimeThreadActive(runtimeThread)

    const controller = new AbortController()
    const requestSignal = context.signal as AbortSignal | undefined
    const abortFromRequest = () => controller.abort(requestSignal?.reason)
    requestSignal?.addEventListener('abort', abortFromRequest, { once: true })
    if (requestSignal?.aborted) controller.abort(requestSignal.reason)
    const response = await fetch(`/api/runtime/threads/${runtimeThread.id}/events`, {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
    })

    if (!response.ok || !response.body) {
      throw new Error('Failed to subscribe runtime events')
    }

    const actionResponse = await sendRequest(controller.signal)
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
          assistantItem.content = [{
            type: 'output_text',
            text: fullText,
            annotations: normalizeModelAnnotations(event.annotations, fullText.length),
          }]
          assistantItem.status = 'completed'
          await this.store.saveItem(thread.id, assistantItem, context)
          yield { type: 'thread.item.done', item: assistantItem }
          controller.abort()
          return
        }

        if (event.type === 'tool_call') {
          const progress = describeRuntimeToolProgress(event.name)
          yield {
            type: 'progress_update',
            icon: progress.icon,
            text: progress.text,
          } as ThreadStreamEvent
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
      requestSignal?.removeEventListener('abort', abortFromRequest)
      controller.abort()
      if (requestSignal?.aborted) {
        // ChatKit aborts its fetch; explicitly stop the paired runtime so the
        // server-side session cannot continue working after the UI stopped.
        void fetch(`/api/runtime/threads/${runtimeThread.id}/stop`, { method: 'POST' }).catch(() => undefined)
      }
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
      (signal) => fetch(`/api/runtime/threads/${runtimeThread.id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userText }),
        signal,
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
      (signal) => fetch(`/api/runtime/threads/${runtimeThread.id}/tool-calls/${encodeURIComponent(requestId)}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output }),
        signal,
      }),
      {
        toolCall: '运行时请求了新的工具调用，已转入收件箱等待处理。',
        authRequired: '运行时需要额外认证，已转入收件箱等待处理。',
        requestFailed: 'Failed to respond runtime tool call',
      },
    )
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
        aiRuntimeLocation: readAgentAiRuntimeLocation((agent as Record<string, unknown>).metadata),
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
    const direct = await (this.db as any).findById?.(chatResource as any, chatId)
    if (direct) return direct

    const chats = await this.db.select().from(chatResource).execute()
    return chats.find((entry: any) => entry.id === chatId) ?? null
  }

  private resolvePlatformModel(agentConfig: ThreadAgentConfig | null, requestedModel?: unknown): string | null {
    if (!agentConfig || agentConfig.provider !== 'undefineds') {
      return null
    }

    return normalizePlatformRuntimeModel(requestedModel) ?? normalizePlatformRuntimeModel(agentConfig.model)
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
    messages: ModelMessage[],
    inferenceOptions?: any,
    runtimeLocation: AgentAiRuntimeLocation = DEFAULT_AGENT_AI_RUNTIME_LOCATION,
    signal?: AbortSignal,
  ): AsyncIterable<ModelStreamChunk> {
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
      signal,
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

  private async respondWithLinxWebSearch(
    model: string,
    messages: ModelMessage[],
    inferenceOptions?: any,
    runtimeLocation: AgentAiRuntimeLocation = DEFAULT_AGENT_AI_RUNTIME_LOCATION,
    signal?: AbortSignal,
  ): Promise<ModelResponse> {
    const requestInit: RequestInit = {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: messages,
        tools: [{ type: 'web_search' }],
        tool_choice: 'auto',
        temperature: inferenceOptions?.temperature ?? 0.7,
        max_output_tokens: inferenceOptions?.max_tokens ?? 2048,
      }),
      signal,
    }

    const response = runtimeLocation === 'server'
      ? await this.fetchServerOriginatedLinxResponses(requestInit)
      : await this.authFetch(`${this.resolveRuntimeBaseUrl()}/responses`, requestInit)

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`LinX web search error ${response.status}: ${text.slice(0, 200)}`)
    }

    return parseResponsesApiResult(await response.json())
  }

  private async fetchServerOriginatedLinxRuntime(requestInit: RequestInit): Promise<Response> {
    if (!this.isServiceMode()) {
      throw new Error('服务端 AI 运行只支持 LinX 桌面或本地服务。请切回客户端运行，或先启动本机空间。')
    }

    return fetch('/api/ai/chat/completions', requestInit)
  }

  private async fetchServerOriginatedLinxResponses(requestInit: RequestInit): Promise<Response> {
    if (!this.isServiceMode()) {
      throw new Error('服务端 AI 运行只支持 LinX 桌面或本地服务。请切回客户端运行，或先启动本机空间。')
    }

    return fetch('/api/ai/responses', requestInit)
  }

  private async *readTextOrSseStream(response: Response): AsyncIterable<ModelStreamChunk> {
    const reader = response.body?.getReader()
    if (!reader) {
      const data = await response.json().catch(() => null)
      const text = data?.choices?.[0]?.message?.content
      if (typeof text === 'string' && text) {
        yield {
          text,
          annotations: normalizeModelAnnotations(data?.choices?.[0]?.message?.annotations, text.length),
        }
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
        if (chunk.text || chunk.annotations.length) yield chunk
      }
    }

    const tail = decoder.decode()
    if (tail) buffer += tail
    const finalChunk = this.parseRuntimeStreamLine(buffer)
    if (finalChunk.text || finalChunk.annotations.length) yield finalChunk
  }

  private parseRuntimeStreamLine(line: string): ModelStreamChunk {
    const trimmed = line.trim()
    if (!trimmed || trimmed === 'data: [DONE]' || trimmed === '[DONE]') {
      return { text: '', annotations: [] }
    }

    const payload = trimmed.startsWith('data: ') ? trimmed.slice(6).trim() : trimmed
    if (!payload || payload === '[DONE]') {
      return { text: '', annotations: [] }
    }

    try {
      const parsed = JSON.parse(payload)
      const deltaObject = parsed.choices?.[0]?.delta
      const messageObject = parsed.choices?.[0]?.message
      const delta = deltaObject?.content
      if (typeof delta === 'string') {
        return {
          text: delta,
          annotations: normalizeModelAnnotations(deltaObject?.annotations, delta.length),
        }
      }

      const text = messageObject?.content
      if (typeof text === 'string') {
        return {
          text,
          annotations: normalizeModelAnnotations(messageObject?.annotations, text.length),
        }
      }

      if (typeof parsed.text === 'string') {
        return {
          text: parsed.text,
          annotations: normalizeModelAnnotations(parsed.annotations, parsed.text.length),
        }
      }

      return {
        text: '',
        annotations: normalizeModelAnnotations(deltaObject?.annotations ?? messageObject?.annotations ?? parsed.annotations, 0),
      }
    } catch {
      return { text: payload, annotations: [] }
    }
  }

  private async *streamFromProviderRuntime(
    provider: string,
    model: string,
    messages: ModelMessage[],
    inferenceOptions?: any,
    signal?: AbortSignal,
  ): AsyncIterable<ModelStreamChunk> {
    const response = await this.authFetch(`${this.resolveRuntimeBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream, text/plain, application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider,
        model,
        messages,
        stream: true,
        temperature: inferenceOptions?.temperature ?? 0.7,
        max_tokens: inferenceOptions?.max_tokens ?? 2048,
      }),
      signal,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Xpod AI runtime error ${response.status}: ${text.slice(0, 200)}`)
    }

    yield* this.readTextOrSseStream(response)
  }

  private async buildConversationHistory(
    threadId: string,
    context: StoreContext,
  ): Promise<ModelMessage[]> {
    const messages: ModelMessage[] = [
      { role: 'system', content: this.systemPrompt },
    ]

    const items = await this.store.loadThreadItems(threadId, undefined, 100, 'asc', context)
    for (const item of items.data) {
      if (item.type === 'user_message') {
        const text = extractUserMessageText((item as any).content)
        const attachmentParts = await this.buildAttachmentModelParts((item as any).attachments)
        if (text || attachmentParts.length > 0) {
          messages.push({
            role: 'user',
            content: attachmentParts.length > 0
              ? [{ type: 'text', text: text || '请分析附件。' }, ...attachmentParts]
              : text,
          })
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

  private async buildAttachmentModelParts(attachments: Attachment[] | undefined): Promise<ModelContentPart[]> {
    if (!attachments?.length || !this.store.readAttachmentBytes) return []

    const groups = await Promise.all(attachments.map(async (attachment) => {
      try {
        const bytes = await this.store.readAttachmentBytes!(attachment.id)
        return attachmentToModelParts(attachment, bytes)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        return [{ type: 'text', text: `[附件 ${attachment.name} 读取失败：${reason}]` } satisfies ModelContentPart]
      }
    }))
    return groups.flat()
  }

  private async buildRuntimeUserText(item: ThreadItem): Promise<string> {
    const text = extractUserMessageText((item as any).content)
    const parts = await this.buildAttachmentModelParts((item as any).attachments)
    const attachmentText = parts.map((part, index) => (
      part.type === 'text'
        ? part.text
        : `[图片附件 ${index + 1} 已保存到 Pod；当前终端 runtime 仅接收文本，请在支持视觉的模型会话中分析图片内容。]`
    )).join('\n\n')
    return [text, attachmentText].filter(Boolean).join('\n\n') || '请分析附件。'
  }

  private async createUserMessage(
    threadId: string,
    content: any[],
    attachmentIds: string[] = [],
    inferenceOptions?: Record<string, unknown>,
    thread?: ThreadMetadata,
    context: StoreContext = {},
  ): Promise<ThreadItem> {
    const fallbackThread = thread || {
      id: threadId,
      status: { type: 'active' as const },
      created_at: nowTimestamp(),
      updated_at: nowTimestamp(),
    }

    const itemId = this.store.generateItemId('user_message', fallbackThread, {})
    const attachments = await Promise.all(attachmentIds.map(async (attachmentId) => {
      const attachment = await this.store.loadAttachment(attachmentId, context)
      const { upload_descriptor: _uploadDescriptor, ...publicAttachment } = attachment
      return publicAttachment
    }))
    return {
      id: itemId,
      thread_id: threadId,
      type: 'user_message',
      content,
      attachments,
      ...(inferenceOptions && Object.keys(inferenceOptions).length > 0
        ? { inference_options: inferenceOptions }
        : {}),
      created_at: nowTimestamp(),
    } as ThreadItem
  }
}
