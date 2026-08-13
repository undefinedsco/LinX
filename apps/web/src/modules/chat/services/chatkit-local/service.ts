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
  aiProviderResource,
  AIConfigRuntimeCapability,
  chatResource,
  contactResource,
  extractChatIdFromChatRef,
  getAIConfigProviderCapabilities,
  normalizeAIConfigProviderId,
  normalizeAIConfigResourceId,
  type AgentRow,
  type ContactRow,
  type SolidDatabase,
} from '@undefineds.co/models'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { formatErrorForUser } from '@/lib/user-facing-errors'
import { RuntimeSidecarSink } from './runtime-sidecar'
import { createAssistantTextDeltaEvent } from './thread-stream-events'
import { normalizeToolCallArguments } from './tool-call-protocol'
import {
  inferMarkdownLinkAnnotations,
  mergeChatKitAnnotations,
  normalizeModelAnnotations,
  type ChatKitAnnotation,
} from './model-annotations'
import { sendMatrixThreadMessage } from '../../matrix-service'
import { attachmentToModelParts, MAX_ATTACHMENT_BYTES, type ModelContentPart } from './attachment-content'
import {
  DEFAULT_AGENT_AI_RUNTIME_LOCATION,
  readAgentAiRuntimeLocation,
  type AgentAiRuntimeLocation,
} from '../../agent-runtime-location'
import { classifyRuntimeTool } from '../../domain/runtime-tool-category'
import { readProjectContext, renderProjectSystemContext } from '../project-context'

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

type LocalChatKitStorePort = ChatKitStore<StoreContext> & {
  createAttachment?: (input: { name: string; mime_type: string }) => Attachment
  uploadAttachment?: (attachmentId: string, body: BodyInit, mimeType?: string, signal?: AbortSignal) => Promise<Attachment>
  readAttachmentBytes?: (attachmentId: string) => Promise<Uint8Array>
}

type ModelMessage = { role: string; content: string | ModelContentPart[] }

class ProviderCapabilityError extends Error {
  constructor(provider: string, capability: string) {
    super(`当前 AI 供应商 ${provider} 未声明 ${capability} 能力，请在“模型服务”中确认上游支持后启用。`)
    this.name = 'ProviderCapabilityError'
  }
}

function isRetryableGenerationError(error: unknown): boolean {
  if (isAbortError(error) || error instanceof ProviderCapabilityError) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (error instanceof TypeError) return true
  const message = error instanceof Error ? error.message : String(error)
  return /network|fetch|connection|socket|timed?\s*out|econn|http\s+(?:408|429|5\d\d)|runtime error (?:408|429|5\d\d)|responses error (?:408|429|5\d\d)/iu.test(message)
}

function modelMessagesContainImages(messages: ModelMessage[]): boolean {
  return messages.some((message) => Array.isArray(message.content)
    && message.content.some((part) => part.type === 'image_url'))
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)))
  }
  return btoa(binary)
}

export interface LocalServiceOptions {
  store: LocalChatKitStorePort
  db: SolidDatabase
  webId: string
  authFetch: typeof fetch
  systemPrompt?: string
  onGenerationDeferred?: (entry: {
    threadId: string
    userItemId: string
    inferenceOptions?: Record<string, unknown>
  }) => Promise<void> | void
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

function isImageGenerationRequested(inferenceOptions: unknown): boolean {
  if (!inferenceOptions || typeof inferenceOptions !== 'object') return false
  const toolChoice = (inferenceOptions as { tool_choice?: unknown }).tool_choice
  return Boolean(toolChoice && typeof toolChoice === 'object' && (toolChoice as { id?: unknown }).id === 'image_generation')
}

function describeRuntimeToolProgress(name: string): { icon: string; text: string } {
  switch (classifyRuntimeTool(name)) {
    case 'search':
      return { icon: 'search', text: '正在搜索相关资料…' }
    case 'read':
      return { icon: 'document', text: '正在读取工作区内容…' }
    case 'write':
      return { icon: 'write', text: '工作区变更等待确认…' }
    case 'execute':
      return { icon: 'square-code', text: '正在运行工作区命令…' }
    default:
      return { icon: 'settings-slider', text: '正在使用工作区工具…' }
  }
}

function readBranchParentId(item: ThreadItem): string | undefined {
  const value = (item as ThreadItem & { parent_item_id?: unknown }).parent_item_id
  return typeof value === 'string' ? value : undefined
}

function readBranchId(item: ThreadItem): string | undefined {
  const value = (item as ThreadItem & { branch_id?: unknown }).branch_id
  return typeof value === 'string' ? value : undefined
}

function canonicalBranchRef(value: string): string {
  const branchRootPrefix = 'branch-root:'
  if (value.startsWith(branchRootPrefix)) {
    return `${branchRootPrefix}${canonicalBranchRef(value.slice(branchRootPrefix.length))}`
  }
  const hashIndex = value.lastIndexOf('#')
  return hashIndex >= 0 ? value.slice(hashIndex + 1) : value
}

function projectActiveBranchItems<T extends { data: ThreadItem[] }>(
  page: T,
  rawActive: unknown,
): T {
  if (!rawActive || typeof rawActive !== 'object') return page
  const active = rawActive as Record<string, unknown>
  const hidden = new Set<string>()
  const canonicalActive = new Map<string, string>()
  for (const [parentId, selectedId] of Object.entries(active)) {
    if (typeof selectedId === 'string') {
      canonicalActive.set(canonicalBranchRef(parentId), canonicalBranchRef(selectedId))
    }
  }

  for (const item of page.data) {
    const parentId = readBranchParentId(item)
    if (!parentId) continue
    const selectedId = canonicalActive.get(canonicalBranchRef(parentId))
    const itemId = canonicalBranchRef(item.id)
    if (selectedId && itemId !== selectedId) {
      hidden.add(itemId)
    }
  }

  let changed = true
  while (changed) {
    changed = false
    for (const item of page.data) {
      const parentId = readBranchParentId(item)
      const itemId = canonicalBranchRef(item.id)
      if (!hidden.has(itemId) && parentId && hidden.has(canonicalBranchRef(parentId))) {
        hidden.add(itemId)
        changed = true
      }
    }
  }

  return { ...page, data: page.data.filter((item) => !hidden.has(canonicalBranchRef(item.id))) }
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
  contextRound?: number
  aiRuntimeLocation: AgentAiRuntimeLocation
}

function normalizeContextRound(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return Math.min(100, Math.max(1, Math.floor(parsed)))
}

function modelMessageContainsText(message: ModelMessage, expected: string): boolean {
  if (!expected) return false
  const text = typeof message.content === 'string'
    ? message.content
    : message.content
        .filter((part): part is Extract<ModelContentPart, { type: 'text' }> => part.type === 'text')
        .map((part) => part.text)
        .join('\n')
  return text.includes(expected)
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
  private onGenerationDeferred?: LocalServiceOptions['onGenerationDeferred']
  private readonly attachmentModelPartCache = new Map<string, Promise<ModelContentPart[]>>()

  constructor(options: LocalServiceOptions) {
    this.store = options.store
    this.db = options.db
    this.webId = options.webId
    this.authFetch = options.authFetch
    this.systemPrompt = options.systemPrompt ?? 'You are a helpful assistant.'
    this.onGenerationDeferred = options.onGenerationDeferred
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
      const items = await this.loadAllThreadItems(threadId, context)
      const deletedIds = collectItemSubtreeIds(items, itemId)
      for (const deletedId of deletedIds) {
        await this.store.deleteThreadItem(threadId, deletedId, context)
        yield { type: 'thread.item.deleted', thread_id: threadId, item_id: deletedId }
      }
      const active = pruneActiveBranchSelections(
        thread.metadata?.active_branch_by_parent,
        deletedIds,
        items,
      )
      thread.metadata = { ...(thread.metadata ?? {}), active_branch_by_parent: active }
      thread.updated_at = nowTimestamp()
      await this.store.saveThread(thread, context)
      return
    }

    if (action === 'message.regenerate') {
      const item = await this.store.loadItem(threadId, itemId, context)
      if (item.type !== 'user_message') throw new Error('只能从用户消息重新生成回答。')
      const thread = await this.store.loadThread(threadId, context)
      yield* this.respond(thread, item, context, (item as any).inference_options, { selectResponseBranch: true })
      return
    }

    if (action === 'message.edit') {
      const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
      if (!text) throw new Error('编辑后的消息不能为空。')
      const item = await this.store.loadItem(threadId, itemId, context)
      if (item.type !== 'user_message') throw new Error('只有用户消息可以编辑。')
      const thread = await this.store.loadThread(threadId, context)
      const items = await this.loadAllThreadItems(threadId, context)
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
        items,
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
        yield* this.respond(
          thread,
          edited,
          context,
          (edited as any).inference_options,
          { selectResponseBranch: true },
        )
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
    const items = await this.loadAllThreadItems(params.thread_id, context)
    let lastUserMessage: ThreadItem | undefined

    for (const item of items) {
      if (item.type === 'user_message') lastUserMessage = item
      if (item.id === params.item_id) break
    }

    if (lastUserMessage) {
      await this.linkFollowingResponseItems(
        params.thread_id,
        items,
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
    const items = await this.store.loadThreadItems(params.thread_id, undefined, 50, 'desc', context)
    const chronologicalItems = {
      ...items,
      data: [...items.data].sort((left, right) => (left.created_at ?? 0) - (right.created_at ?? 0)),
    }
    return { ...thread, items: projectActiveBranchItems(chronologicalItems, thread.metadata?.active_branch_by_parent) }
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
      const messages = await this.buildConversationHistory(
        thread.id,
        context,
        agentConfig?.contextRound,
        userMessage.id,
      )
      const originalUserText = userMessage.type === 'user_message'
        ? extractUserMessageText(userMessage.content)
        : ''
      if (!messages.some((message) => message.role === 'user' && modelMessageContainsText(message, originalUserText))) {
        messages.push({ role: 'user', content: userText })
      }
      const webSearchRequested = isWebSearchRequested(inferenceOptions)
      const imageGenerationRequested = isImageGenerationRequested(inferenceOptions)
      const sourceImageAttachment = imageGenerationRequested && userMessage.type === 'user_message'
        ? userMessage.attachments?.find((attachment) => attachment.type === 'image')
        : undefined
      const platformModel = this.resolvePlatformModel(agentConfig, inferenceOptions?.model)
        ?? (webSearchRequested && !agentConfig ? 'linx-lite' : null)
      // An explicitly selected composer tool is a per-message routing decision.
      // It must not be swallowed by a long-lived coding/runtime session.
      const runtimeThread = webSearchRequested || imageGenerationRequested ? null : await this.getRuntimeThread(thread.id)

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
        const provider = platformModel ? 'undefineds' : (agentConfig?.provider ?? 'openai')
        const providerCapabilities = await this.resolveProviderCapabilities(provider)
        const selectedModel = inferenceOptions?.model ?? agentConfig?.model ?? 'gpt-4o-mini'
        const providerModel = typeof selectedModel === 'string' && selectedModel.includes('/')
          ? selectedModel
          : `${provider}/${selectedModel}`

        if (imageGenerationRequested) {
          const requiredCapability = sourceImageAttachment
            ? AIConfigRuntimeCapability.imageEditing
            : AIConfigRuntimeCapability.imageGeneration
          if (!providerCapabilities.includes(requiredCapability)) {
            throw new ProviderCapabilityError(provider, sourceImageAttachment ? '图片编辑' : '图片生成')
          }
          const imageModel = await this.resolveImageModel(
            provider,
            providerModel,
            requiredCapability,
            context.signal as AbortSignal | undefined,
          )
          yield {
            type: 'progress_update',
            icon: 'square-image',
            text: sourceImageAttachment ? '正在编辑图片…' : '正在生成图片…',
          } as ThreadStreamEvent
          const attachment = await this.generateImageAttachment(
            provider,
            imageModel,
            originalUserText || userText,
            sourceImageAttachment,
            context.signal as AbortSignal | undefined,
          )
          fullText = `${sourceImageAttachment ? '已编辑' : '已生成'}图片：${attachment.name}`
          yield createAssistantTextDeltaEvent(assistantItemId, fullText)
          assistantItem.content = [{ type: 'output_text', text: fullText, annotations: [] }]
          assistantItem.attachments = [attachment]
          assistantItem.status = 'completed'
          await this.store.saveItem(thread.id, assistantItem, context)
          yield { type: 'thread.item.done', item: assistantItem }
          return
        }

        if (webSearchRequested) {
          if (!providerCapabilities.includes(AIConfigRuntimeCapability.responses)) {
            throw new ProviderCapabilityError(provider, 'Responses API')
          }
          if (!providerCapabilities.includes(AIConfigRuntimeCapability.responsesWebSearch)) {
            throw new ProviderCapabilityError(provider, 'Responses Web Search')
          }
          if (
            modelMessagesContainImages(messages)
            && !providerCapabilities.includes(AIConfigRuntimeCapability.imageInput)
          ) {
            throw new ProviderCapabilityError(provider, '图片输入')
          }
          yield {
            type: 'progress_update',
            icon: 'search',
            text: '正在搜索网络并整理来源…',
          } as ThreadStreamEvent
          const stream = this.streamFromLinxResponses(
            platformModel ?? providerModel,
            messages,
            inferenceOptions,
            agentConfig?.aiRuntimeLocation ?? DEFAULT_AGENT_AI_RUNTIME_LOCATION,
            context.signal as AbortSignal | undefined,
            true,
          )
          for await (const chunk of stream) {
            const normalizedChunk = coerceModelStreamChunk(chunk)
            fullText += normalizedChunk.text
            annotations = mergeChatKitAnnotations(annotations, normalizedChunk.annotations)
            if (normalizedChunk.text) {
              yield createAssistantTextDeltaEvent(assistantItemId, normalizedChunk.text)
            }
          }
          if (!fullText.trim() && annotations.length === 0) {
            throw new Error('AI provider returned an empty Responses result')
          }
          if (annotations.length === 0) annotations = inferMarkdownLinkAnnotations(fullText)
          assistantItem.content = [{ type: 'output_text', text: fullText, annotations }]
          assistantItem.status = 'completed'
          await this.store.saveItem(thread.id, assistantItem, context)
          yield { type: 'thread.item.done', item: assistantItem }
          return
        }

        if (platformModel) {

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
              yield createAssistantTextDeltaEvent(assistantItemId, normalizedChunk.text)
            }
          }

          assistantItem.content = [{ type: 'output_text', text: fullText, annotations }]
          assistantItem.status = 'completed'
          await this.store.saveItem(thread.id, assistantItem, context)
          yield { type: 'thread.item.done', item: assistantItem }
          return
        }

        if (
          modelMessagesContainImages(messages)
          && !providerCapabilities.includes(AIConfigRuntimeCapability.imageInput)
        ) {
          throw new ProviderCapabilityError(provider, '图片输入')
        }

        if (!providerCapabilities.includes(AIConfigRuntimeCapability.chatCompletions)) {
          if (!providerCapabilities.includes(AIConfigRuntimeCapability.responses)) {
            throw new ProviderCapabilityError(provider, 'Chat Completions 或 Responses API')
          }
          const stream = this.streamFromLinxResponses(
            providerModel,
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
              yield createAssistantTextDeltaEvent(assistantItemId, normalizedChunk.text)
            }
          }
          if (!fullText.trim() && annotations.length === 0) {
            throw new Error('AI provider returned an empty Responses result')
          }
          assistantItem.content = [{ type: 'output_text', text: fullText, annotations }]
          assistantItem.status = 'completed'
          await this.store.saveItem(thread.id, assistantItem, context)
          yield { type: 'thread.item.done', item: assistantItem }
          return
        }

        const stream = this.streamFromProviderRuntime(
          provider,
          providerModel,
          messages,
          inferenceOptions,
          context.signal as AbortSignal | undefined,
        )

        for await (const chunk of stream) {
          const normalizedChunk = coerceModelStreamChunk(chunk)
          fullText += normalizedChunk.text
          annotations = mergeChatKitAnnotations(annotations, normalizedChunk.annotations)
          if (normalizedChunk.text) {
            yield createAssistantTextDeltaEvent(assistantItemId, normalizedChunk.text)
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
      const generationDeferred = Boolean(this.onGenerationDeferred) && isRetryableGenerationError(error)
      if (generationDeferred) {
        await this.onGenerationDeferred?.({
          threadId: thread.id,
          userItemId: userMessage.id,
          inferenceOptions: inferenceOptions && typeof inferenceOptions === 'object'
            ? { ...inferenceOptions }
            : undefined,
        })
      }
      const userFacingMessage = generationDeferred
        ? '网络或 AI 上游暂不可用，已加入发送队列；连接恢复后会自动重试。'
        : error instanceof ProviderCapabilityError
        ? error.message
        : webSearchFailed
        ? searchErrorMessage.startsWith('当前自定义 AI 供应商不支持')
          ? searchErrorMessage
          : '联网搜索暂不可用。请检查本地 xpod 的 AI 上游配置后重试。'
        : formatErrorForUser(error, '消息生成失败。请稍后重试。')
      if (webSearchFailed) {
        // Search capability failures are already represented as an inline,
        // retryable assistant item. Emitting a ChatKit stream error as well
        // adds an unrelated generic error card and makes a known upstream
        // capability gap look like a broken conversation.
        console.warn('[LocalChatKitService] Web search unavailable:', userFacingMessage)
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
        text: fullText || (isAbortError(error) ? '已停止生成。' : userFacingMessage),
        annotations: [],
      }]
      assistantItem.status = 'incomplete'
      await this.store.saveItem(thread.id, assistantItem, context)
      yield { type: 'thread.item.done', item: assistantItem }
      if (isAbortError(error)) return
      if (generationDeferred) return
      if (webSearchFailed) return
      yield {
        type: 'error',
        error: {
          code: 'generation_error',
          message: userFacingMessage,
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
      arguments: normalizeToolCallArguments(event.arguments),
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

    const parseEvent = (rawEvent: string): RuntimeThreadEvent | null => {
      if (!rawEvent.trim()) return null
      const payload = rawEvent
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      return payload ? JSON.parse(payload) as RuntimeThreadEvent : null
    }
    const findBoundary = () => {
      const match = /\r?\n\r?\n/.exec(buffer)
      return match ? { index: match.index, length: match[0].length } : null
    }

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        let boundary = findBoundary()
        while (boundary) {
          const rawEvent = buffer.slice(0, boundary.index)
          buffer = buffer.slice(boundary.index + boundary.length)
          boundary = findBoundary()

          const event = parseEvent(rawEvent)
          if (event) yield event
        }
      }

      buffer += decoder.decode()
      const finalEvent = parseEvent(buffer)
      if (finalEvent) yield finalEvent
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
          yield createAssistantTextDeltaEvent(assistantItemId, event.text)
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

    for (const participantRef of participantRefs) {
      const contact = await this.findContactByRef(participantRef)
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
        contextRound: normalizeContextRound(agent.contextRound),
        aiRuntimeLocation: readAgentAiRuntimeLocation((agent as Record<string, unknown>).metadata),
      }
    }

    return null
  }

  private async findContactByRef(ref: string): Promise<ContactRow | null> {
    if (!ref) return null
    if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(ref)) {
      const findByIri = (this.db as any).findByIri
      return typeof findByIri === 'function'
        ? await findByIri.call(this.db, contactResource as any, ref) as ContactRow | null
        : null
    }
    const findById = (this.db as any).findById
    return typeof findById === 'function'
      ? await findById.call(this.db, contactResource as any, ref) as ContactRow | null
      : null
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
    const resourceId = chatResource.buildId({ id: chatId })
    const direct = await (this.db as any).findById?.(chatResource as any, resourceId)
    if (direct) return direct

    const chats = await this.db.select().from(chatResource).execute()
    return chats.find((entry: any) => entry.id === resourceId) ?? null
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

  private async *streamFromLinxResponses(
    model: string,
    messages: ModelMessage[],
    inferenceOptions?: any,
    runtimeLocation: AgentAiRuntimeLocation = DEFAULT_AGENT_AI_RUNTIME_LOCATION,
    signal?: AbortSignal,
    webSearch = false,
  ): AsyncIterable<ModelStreamChunk> {
    const requestInit: RequestInit = {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream, application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: messages,
        stream: true,
        ...(webSearch
          ? { tools: [{ type: 'web_search' }], tool_choice: 'auto' }
          : {}),
        ...(typeof inferenceOptions?.temperature === 'number'
          ? { temperature: inferenceOptions.temperature }
          : {}),
        max_output_tokens: inferenceOptions?.max_tokens ?? 2048,
      }),
      signal,
    }

    const response = runtimeLocation === 'server'
      ? await this.fetchServerOriginatedLinxResponses(requestInit)
      : await this.authFetch(`${this.resolveRuntimeBaseUrl()}/responses`, requestInit)

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`LinX Responses error ${response.status}: ${text.slice(0, 200)}`)
    }

    yield* this.readResponsesTextOrSseStream(response)
  }

  private async *readResponsesTextOrSseStream(response: Response): AsyncIterable<ModelStreamChunk> {
    const contentType = response.headers.get('Content-Type')?.toLowerCase() ?? ''
    if (!contentType.includes('text/event-stream') || !response.body) {
      const result = parseResponsesApiResult(await response.json())
      if (result.text || result.annotations.length > 0) yield result
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let streamedTextLength = 0

    const parseEvent = (rawEvent: string): ModelStreamChunk | null => {
      const payload = rawEvent
        .split(/\r?\n/u)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (!payload || payload === '[DONE]') return null

      let event: Record<string, any>
      try {
        event = JSON.parse(payload) as Record<string, any>
      } catch {
        throw new Error('LinX Responses stream returned malformed JSON')
      }
      if (event.error) {
        const message = typeof event.error?.message === 'string'
          ? event.error.message
          : 'Responses provider stream failed'
        throw new Error(`LinX Responses stream error: ${message}`)
      }

      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
        streamedTextLength += event.delta.length
        return {
          text: event.delta,
          annotations: normalizeModelAnnotations(event.annotations, streamedTextLength),
        }
      }

      if (event.type === 'response.content_part.done' && event.part?.type === 'output_text') {
        const completedTextLength = typeof event.part.text === 'string'
          ? event.part.text.length
          : streamedTextLength
        return {
          text: '',
          annotations: normalizeModelAnnotations(event.part.annotations, completedTextLength),
        }
      }

      return null
    }

    const flushEvents = function* (): Generator<ModelStreamChunk> {
      const events = buffer.split(/\r?\n\r?\n/u)
      buffer = events.pop() ?? ''
      for (const rawEvent of events) {
        const chunk = parseEvent(rawEvent)
        if (chunk && (chunk.text || chunk.annotations.length > 0)) yield chunk
      }
    }

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        yield* flushEvents()
      }
      buffer += decoder.decode()
      if (buffer.trim()) {
        const chunk = parseEvent(buffer)
        if (chunk && (chunk.text || chunk.annotations.length > 0)) yield chunk
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined)
      throw error
    } finally {
      reader.releaseLock()
    }
  }

  private async generateImageAttachment(
    provider: string,
    model: string,
    prompt: string,
    sourceImage?: Attachment,
    signal?: AbortSignal,
  ): Promise<Attachment> {
    if (!this.store.createAttachment || !this.store.uploadAttachment) {
      throw new Error('Attachment storage is unavailable')
    }
    let sourceImagePayload: { data: string; mime_type: string; name: string } | undefined
    if (sourceImage) {
      if (!this.store.readAttachmentBytes) throw new Error('Attachment read is unavailable')
      const bytes = await this.store.readAttachmentBytes(sourceImage.id)
      sourceImagePayload = {
        data: bytesToBase64(bytes),
        mime_type: sourceImage.mime_type,
        name: sourceImage.name,
      }
    }
    const endpoint = sourceImage ? 'images/edits' : 'images/generations'
    const response = await this.authFetch(`${this.resolveRuntimeBaseUrl()}/${endpoint}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model, prompt, n: 1, response_format: 'b64_json', ...(sourceImagePayload ? { image: sourceImagePayload } : {}) }),
      signal,
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Image generation error ${response.status}: ${text.slice(0, 200)}`)
    }
    const payload = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> }
    const resultImage = payload.data?.[0]
    let bytes: Uint8Array
    const mimeType = 'image/png'
    if (resultImage?.b64_json) {
      const maxBase64Length = Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4 + 4
      if (resultImage.b64_json.length > maxBase64Length) {
        throw new Error('Generated image exceeds the 25 MB attachment limit')
      }
      const binary = atob(resultImage.b64_json)
      bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
      if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
        throw new Error('Generated image exceeds the 25 MB attachment limit')
      }
    } else if (resultImage?.url) {
      throw new Error('Image provider must return base64 image data')
    } else {
      throw new Error('Image provider returned no image data')
    }
    const attachment = this.store.createAttachment({
      name: `${sourceImage ? 'edited' : 'generated'}-${new Date().toISOString().replace(/[:.]/gu, '-')}.png`,
      mime_type: mimeType,
    })
    return this.store.uploadAttachment(
      attachment.id,
      new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: mimeType }),
      mimeType,
      signal,
    )
  }

  private async resolveImageModel(
    provider: string,
    preferredModel: string,
    capability: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = await this.authFetch(`${this.resolveRuntimeBaseUrl()}/models`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    })
    if (!response.ok) {
      throw new Error(`Image model discovery failed with HTTP ${response.status}`)
    }
    const payload = await response.json() as { data?: Array<{
      id?: unknown
      owned_by?: unknown
      capabilities?: unknown
      custom_capabilities?: unknown
    }> }
    const capabilityKey = capability === AIConfigRuntimeCapability.imageEditing
      ? 'imageEditing'
      : 'imageGeneration'
    const models = (Array.isArray(payload.data) ? payload.data : []).filter((model) => {
      if (typeof model.id !== 'string') return false
      if (typeof model.owned_by === 'string' && normalizeAIConfigProviderId(model.owned_by) !== normalizeAIConfigProviderId(provider)) return false
      const custom = Array.isArray(model.custom_capabilities)
        ? model.custom_capabilities.filter((value): value is string => typeof value === 'string')
        : []
      const capabilities = model.capabilities && typeof model.capabilities === 'object'
        ? model.capabilities as Record<string, unknown>
        : {}
      return custom.includes(capability) || capabilities[capabilityKey] === true
    })
    const preferredId = preferredModel.includes('/') ? preferredModel.slice(preferredModel.indexOf('/') + 1) : preferredModel
    const selected = models.find((model) => model.id === preferredId) ?? models[0]
    if (!selected || typeof selected.id !== 'string') {
      throw new ProviderCapabilityError(
        provider,
        capability === AIConfigRuntimeCapability.imageEditing ? '可用的图片编辑模型' : '可用的图片生成模型',
      )
    }
    return `${normalizeAIConfigProviderId(provider)}/${selected.id}`
  }

  private async resolveProviderCapabilities(providerId: string): Promise<string[]> {
    const provider = normalizeAIConfigProviderId(providerId)
    if (!provider) return [AIConfigRuntimeCapability.chatCompletions]

    let explicitCapabilities: unknown
    try {
      const findById = (this.db as any).findById
      if (typeof findById === 'function') {
        const providerRow = await findById.call(
          this.db,
          aiProviderResource,
          aiProviderResource.buildId({ id: provider }),
        ) as Record<string, unknown> | null
        explicitCapabilities = providerRow?.capabilities
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/404|not found|missing/iu.test(message)) throw error
    }
    return getAIConfigProviderCapabilities(provider, explicitCapabilities)
  }

  private async loadAllThreadItems(threadId: string, context: StoreContext): Promise<ThreadItem[]> {
    const items: ThreadItem[] = []
    const seen = new Set<string>()
    let after: string | undefined

    while (true) {
      const page = await this.store.loadThreadItems(threadId, after, 250, 'asc', context)
      for (const item of page.data) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        items.push(item)
      }
      if (!page.has_more) return items
      if (!page.last_id || page.last_id === after) {
        throw new Error(`Thread pagination did not advance for ${threadId}.`)
      }
      after = page.last_id
    }
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
    let streamedTextLength = 0

    const parseChunk = (line: string) => {
      const chunk = this.parseRuntimeStreamLine(line, streamedTextLength)
      streamedTextLength += chunk.text.length
      return chunk
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const chunk = parseChunk(line)
        if (chunk.text || chunk.annotations.length) yield chunk
      }
    }

    const tail = decoder.decode()
    if (tail) buffer += tail
    const finalChunk = parseChunk(buffer)
    if (finalChunk.text || finalChunk.annotations.length) yield finalChunk
  }

  private parseRuntimeStreamLine(line: string, streamedTextLength = 0): ModelStreamChunk {
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
          annotations: normalizeModelAnnotations(deltaObject?.annotations, streamedTextLength + delta.length),
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
          annotations: normalizeModelAnnotations(parsed.annotations, streamedTextLength + parsed.text.length),
        }
      }

      return {
        text: '',
        annotations: normalizeModelAnnotations(
          deltaObject?.annotations ?? messageObject?.annotations ?? parsed.annotations,
          streamedTextLength,
        ),
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
    contextRound?: number,
    anchoredUserItemId?: string,
  ): Promise<ModelMessage[]> {
    const conversation: ModelMessage[] = []

    const historyLimit = contextRound
      ? Math.min(250, Math.max(32, contextRound * 4 + 8))
      : 100
    const items = await this.store.loadThreadItems(threadId, undefined, historyLimit, 'desc', context)
    const thread = await this.store.loadThread(threadId, context)
    const chronologicalItems = { ...items, data: [...items.data].reverse() }
    const activeItems = projectActiveBranchItems(
      chronologicalItems,
      thread.metadata?.active_branch_by_parent,
    ).data
    const userItemIndexes = activeItems
      .map((item, index) => item.type === 'user_message' ? index : -1)
      .filter((index) => index >= 0)
    let firstItemIndex = 0
    if (contextRound) {
      const includesAnchoredUser = activeItems.some((item) => item.id === anchoredUserItemId)
      const retainedUserTurns = includesAnchoredUser
        ? contextRound
        : Math.max(0, contextRound - 1)
      firstItemIndex = retainedUserTurns === 0
        ? activeItems.length
        : userItemIndexes[Math.max(0, userItemIndexes.length - retainedUserTurns)] ?? 0
    }
    for (const item of activeItems.slice(firstItemIndex)) {
      if (item.type === 'user_message') {
        const text = extractUserMessageText((item as any).content)
        const attachmentParts = await this.buildAttachmentModelParts((item as any).attachments)
        if (text || attachmentParts.length > 0) {
          conversation.push({
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
          conversation.push({ role: 'assistant', content: text })
        }
      }
    }

    let systemPrompt = this.systemPrompt
    const workspaceUri = typeof thread.metadata?.workspace === 'string' ? thread.metadata.workspace : null
    if (workspaceUri) {
      try {
        const projectContext = renderProjectSystemContext(await readProjectContext({
          db: this.db,
          workspaceUri,
        }))
        if (projectContext) systemPrompt = `${systemPrompt}\n\n${projectContext}`
      } catch (error) {
        console.warn('[LocalChatKitService] Project context unavailable:', error)
      }
    }

    return [
      { role: 'system', content: systemPrompt },
      ...conversation,
    ]
  }

  private async buildAttachmentModelParts(attachments: Attachment[] | undefined): Promise<ModelContentPart[]> {
    if (!attachments?.length || !this.store.readAttachmentBytes) return []

    const groups = await Promise.all(attachments.map((attachment) => {
      const cached = this.attachmentModelPartCache.get(attachment.id)
      if (cached) return cached
      const pending = (async () => {
        try {
          const bytes = await this.store.readAttachmentBytes!(attachment.id)
          return attachmentToModelParts(attachment, bytes)
        } catch (error) {
          this.attachmentModelPartCache.delete(attachment.id)
          const reason = error instanceof Error ? error.message : String(error)
          return [{ type: 'text', text: `[附件 ${attachment.name} 读取失败：${reason}]` } satisfies ModelContentPart]
        }
      })()
      this.attachmentModelPartCache.set(attachment.id, pending)
      if (this.attachmentModelPartCache.size > 16) {
        const oldestKey = this.attachmentModelPartCache.keys().next().value
        if (oldestKey) this.attachmentModelPartCache.delete(oldestKey)
      }
      return pending
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
