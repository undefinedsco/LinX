/**
 * Local (Browser) ChatKit Store
 *
 * Implements the ChatKit store interface using the browser's drizzle-solid db
 * instance (which already carries session.fetch for DPoP auth).
 *
 * This replaces PodChatKitStore on the server — no API server round-trip needed.
 */

import {
  Chat, Thread, Message,
  MessageRole, MessageStatus,
} from '@/lib/vendor/xpod-chatkit'
import type { ChatKitStore, StoreContext } from '@/lib/vendor/xpod-chatkit'
import {
  generateId, nowTimestamp,
  type ThreadMetadata, type ThreadItem, type Attachment,
  type Page, type StoreItemType,
} from '@/lib/vendor/xpod-chatkit'
import {
  chatResource,
  contactResource,
  extractChatIdFromChatRef,
  extractThreadIdFromThreadRef,
  messageResource,
  threadRepository,
  type SolidDatabase,
  UDFS,
} from '@undefineds.co/models'
import { and, asc, desc, eq, gt, like, lt } from '@undefineds.co/drizzle-solid'
import { requireRowResourceId } from '@/lib/data/resource-identity'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { deleteExactRecord, updateExactRecord } from '@/lib/data/exact-records'
import { appendChatReconcilerMetadata, reconcileChatAppend } from '@linx/agent-runtime/chat-reconciler'
import { normalizeClientToolCallItem } from './tool-call-protocol'
import { MAX_ATTACHMENT_BYTES } from './attachment-content'

const DEFAULT_CHAT_ID = 'default'
const POD_QUERY_TIMEOUT_MS = 15000
const CHATKIT_ITEM_ID_METADATA_KEY = 'chatkitItemId'
const THREAD_ITEM_CURSOR_PREFIX = 'linx-chat-cursor:'
const MAX_CACHED_THREAD_ITEMS = 500
const MAX_CACHED_MESSAGE_ROW_IDS = 1000
const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z\d+.-]*:/

interface ThreadItemCursor {
  createdAt: Date
  rowId: string
  order: 'asc' | 'desc'
}

function normalizeThreadItemOrder(order: string): 'asc' | 'desc' {
  return order === 'desc' ? 'desc' : 'asc'
}

function cursorFromMessageRow(row: Record<string, unknown>, order: string): ThreadItemCursor {
  const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(String(row.createdAt ?? ''))
  if (Number.isNaN(createdAt.getTime())) throw new Error('Message cursor is missing createdAt.')
  return {
    createdAt,
    rowId: requireRecordId(row, 'Message cursor row'),
    order: normalizeThreadItemOrder(order),
  }
}

function encodeThreadItemCursor(cursor: ThreadItemCursor): string {
  return `${THREAD_ITEM_CURSOR_PREFIX}${encodeURIComponent(JSON.stringify({
    createdAt: cursor.createdAt.toISOString(),
    rowId: cursor.rowId,
    order: cursor.order,
  }))}`
}

function decodeThreadItemCursor(value: string | undefined, order: string): ThreadItemCursor | null {
  if (!value?.startsWith(THREAD_ITEM_CURSOR_PREFIX)) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(value.slice(THREAD_ITEM_CURSOR_PREFIX.length))) as {
      createdAt?: unknown
      rowId?: unknown
      order?: unknown
    }
    const createdAt = new Date(String(parsed.createdAt ?? ''))
    const normalizedOrder = normalizeThreadItemOrder(order)
    if (
      Number.isNaN(createdAt.getTime())
      || typeof parsed.rowId !== 'string'
      || parsed.rowId.length === 0
      || parsed.order !== normalizedOrder
    ) return null
    return { createdAt, rowId: parsed.rowId, order: normalizedOrder }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusToString(status: { type: string }): string {
  return status.type
}

function stringToStatus(s: string): ThreadMetadata['status'] {
  switch (s) {
    case 'locked': return { type: 'locked' }
    case 'closed': return { type: 'closed' }
    default: return { type: 'active' }
  }
}

function extractChatId(chatIdOrUri: string | null | undefined): string {
  return extractChatIdFromChatRef(chatIdOrUri) ?? DEFAULT_CHAT_ID
}

function extractThreadId(threadIdOrUri: string | null | undefined): string | undefined {
  return extractThreadIdFromThreadRef(threadIdOrUri) ?? undefined
}

function getChatIdFromMetadata(metadata?: Record<string, unknown>): string {
  if (metadata && typeof metadata.chat_id === 'string') {
    const chatId = metadata.chat_id.trim()
    if (chatId && !chatId.includes('/') && !chatId.includes('#')) return chatId
    return extractChatId(chatId)
  }
  return DEFAULT_CHAT_ID
}

function parseThreadMetadata(metadata: unknown): Record<string, unknown> | undefined {
  if (!metadata) return undefined
  let parsed: Record<string, unknown> | undefined
  if (typeof metadata === 'string') {
    try {
      const value = JSON.parse(metadata) as unknown
      parsed = value && typeof value === 'object' && !Array.isArray(value)
        ? { ...(value as Record<string, unknown>) }
        : undefined
    } catch {
      return undefined
    }
  } else if (typeof metadata === 'object' && !Array.isArray(metadata)) {
    parsed = { ...(metadata as Record<string, unknown>) }
  }
  if (!parsed) return undefined
  const activeBranches = normalizeActiveBranches(parsed.active_branch_by_parent)
  if (activeBranches) parsed.active_branch_by_parent = activeBranches
  else delete parsed.active_branch_by_parent
  return parsed
}

function normalizeActiveBranches(value: unknown): Record<string, string> | undefined {
  if (typeof value === 'string') {
    try {
      return normalizeActiveBranches(JSON.parse(value) as unknown)
    } catch {
      return undefined
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  const entries = Object.entries(value as Record<string, unknown>)
  const merged: Record<string, string> = {}
  for (const [key, nested] of entries) {
    if (/^\d+$/.test(key)) {
      Object.assign(merged, normalizeActiveBranches(nested))
    } else if (typeof nested === 'string') {
      merged[key] = nested
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined
}

function resourceUrlFromIri(iri: string): string {
  const hashIndex = iri.indexOf('#')
  return hashIndex >= 0 ? iri.slice(0, hashIndex) : iri
}

function sparqlStringLiteral(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\u0008/g, '\\b')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\f/g, '\\f')
    .replace(/"/g, '\\"')
  return `"${escaped}"`
}

function requiresSafeInitialLiteral(value: string | null): boolean {
  return value !== null && /[\r\n]/u.test(value) && value.includes('\\')
}

function initialLiteralPlaceholder(value: string): string {
  return value.replace(/\\/gu, '∖')
}

async function bodyToLimitedBlob(body: BodyInit, mimeType: string, signal?: AbortSignal): Promise<Blob> {
  if (body instanceof Blob) {
    if (body.size > MAX_ATTACHMENT_BYTES) throw new Error('Attachment exceeds the 25 MB upload limit')
    return body
  }

  const stream = new Response(body).body
  if (!stream) return new Blob([], { type: mimeType })
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError')
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > MAX_ATTACHMENT_BYTES) {
        await reader.cancel('Attachment exceeds the 25 MB upload limit')
        throw new Error('Attachment exceeds the 25 MB upload limit')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return new Blob(chunks.map((chunk) => new Uint8Array(chunk).buffer), { type: mimeType })
}

async function readLimitedResponseBytes(response: Response): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('Content-Length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ATTACHMENT_BYTES) {
    throw new Error('Attachment exceeds the 25 MB download limit')
  }
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > MAX_ATTACHMENT_BYTES) {
        await reader.cancel('Attachment exceeds the 25 MB download limit')
        throw new Error('Attachment exceeds the 25 MB download limit')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function parseRecordMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata) return {}
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata) as Record<string, unknown> | null
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {}
}

function readChatKitItemId(record: Record<string, unknown> | null | undefined): string | null {
  const value = parseRecordMetadata(record?.metadata)[CHATKIT_ITEM_ID_METADATA_KEY]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function messageRecordMatchesItem(record: Record<string, unknown>, itemId: string): boolean {
  if (readChatKitItemId(record) === itemId || record.id === itemId) return true
  const storedItem = parseStoredThreadItem(record.richContent, '', 0)
    ?? parseStoredThreadItem(record.content, '', 0)
  return storedItem?.id === itemId
}

function isHiddenMatrixProtocolEvent(record: Record<string, unknown> | null | undefined): boolean {
  const metadata = parseRecordMetadata(record?.metadata)
  return metadata.protocol === 'matrix'
    && typeof metadata.eventType === 'string'
    && metadata.eventType !== 'm.room.message'
}

function requireRecordId(record: Record<string, unknown> | null | undefined, label: string): string {
  return requireRowResourceId(record as { id?: string | null }, label)
}

function requirePodBaseUrl(db: SolidDatabase<any>): string {
  const podBaseUrl = resolveCurrentPodBaseUrl(db)
  if (!podBaseUrl) {
    throw new Error('Unable to resolve current Pod URL for LocalChatKitStore.')
  }
  return podBaseUrl
}


function buildChatKitMessageReconcilerMetadata(input: {
  db: SolidDatabase<any>
  chat: string
  thread: string
  messageId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  maker: string
  createdAt: Date
  existingMetadata?: Record<string, unknown>
}): Record<string, unknown> {
  const resource = messageResource.buildIri(requirePodBaseUrl(input.db), {
    id: input.messageId,
    parent: input.chat,
    chat: input.chat,
    thread: input.thread,
    createdAt: input.createdAt,
  })
  const { summary } = reconcileChatAppend({
    chat: input.chat,
    thread: input.thread,
    resource,
    role: input.role,
    content: input.content,
    actor: {
      id: input.maker,
      role: input.role === 'user' ? 'user' : input.role === 'assistant' ? 'assistant' : 'runtime',
    },
    source: input.role === 'assistant' ? 'primary-agent' : input.role === 'user' ? 'web-chat' : 'runtime',
    createdAt: input.createdAt,
    randomId: resource,
  })
  return appendChatReconcilerMetadata(input.existingMetadata, summary)
}

function buildChatIri(db: SolidDatabase<any>, chatId: string): string {
  return chatResource.buildIri(requirePodBaseUrl(db), { id: chatId })
}

async function findThreadRecord(db: SolidDatabase<any>, threadId: string, chatId?: string | null): Promise<any | null> {
  const exactId = chatId
    ? threadRepository.idForChat(chatId, threadId)
    : threadId.includes('/') || threadId.includes('#')
      ? threadId
      : null
  if (exactId) {
    const exact = await withTimeout(
      (db as any).findById(Thread as any, exactId),
      POD_QUERY_TIMEOUT_MS,
      `Timed out loading thread ${threadId}`,
    )
    if (exact) return exact
  }

  const rows = await withTimeout(
    db.select().from(Thread).execute(),
    POD_QUERY_TIMEOUT_MS,
    `Timed out searching for thread ${threadId}`,
  )
  return rows.find((entry: any) => (
    entry.id === threadId
    || extractThreadId(entry.id) === threadId
  )) ?? null
}

// ---------------------------------------------------------------------------
// Record → ChatKit type converters
// ---------------------------------------------------------------------------

function threadRecordToMetadata(record: any): ThreadMetadata {
  const chatId = threadRepository.chatId(record) ?? DEFAULT_CHAT_ID
  const extra = parseThreadMetadata(record.metadata)
  return {
    id: record.id,
    title: record.title || undefined,
    status: stringToStatus(record.status || 'active'),
    created_at: record.createdAt
      ? Math.floor(new Date(record.createdAt).getTime() / 1000)
      : nowTimestamp(),
    updated_at: record.updatedAt
      ? Math.floor(new Date(record.updatedAt).getTime() / 1000)
      : nowTimestamp(),
    metadata: {
      chat_id: chatId,
      ...(typeof record.workspace === 'string' && record.workspace ? { workspace: record.workspace } : {}),
      ...(extra ?? {}),
    },
  }
}

function parseStoredThreadItem(value: unknown, fallbackThreadId: string, fallbackCreatedAt: number): ThreadItem | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  try {
    const parsedValue = JSON.parse(value) as unknown
    const parsed = (
      parsedValue
      && typeof parsedValue === 'object'
      && 'chatkitItem' in parsedValue
      ? (parsedValue as { chatkitItem?: unknown }).chatkitItem
      : parsedValue
    ) as Partial<ThreadItem> | null
    const isStoredMessage = parsed?.type === 'user_message' || parsed?.type === 'assistant_message'
    const isStoredToolCall = parsed?.type === 'client_tool_call' && typeof (parsed as any).call_id === 'string'
    if (!parsed || (!isStoredMessage && !isStoredToolCall)) {
      return null
    }

    return normalizeClientToolCallItem({
      ...parsed,
      thread_id: typeof parsed.thread_id === 'string' ? parsed.thread_id : fallbackThreadId,
      created_at: typeof parsed.created_at === 'number' ? parsed.created_at : fallbackCreatedAt,
    } as ThreadItem)
  } catch {
    return null
  }
}

function parseToolOutputForRichContent(output: unknown): unknown {
  if (typeof output !== 'string') return output
  const trimmed = output.trim()
  if (!trimmed) return output
  try {
    return JSON.parse(trimmed)
  } catch {
    return output
  }
}

function createClientToolCallRichContent(item: ThreadItem): string {
  const toolItem = item as any
  const toolBlock = {
    type: 'tool',
    toolCallId: toolItem.call_id,
    toolName: toolItem.name ?? 'tool',
    arguments: toolItem.arguments ?? {},
    status: toolItem.status === 'completed' ? 'done' : toolItem.status ?? 'running',
    result: parseToolOutputForRichContent(toolItem.output),
    error: toolItem.error,
  }

  return JSON.stringify({
    chatkitItem: item,
    items: [toolBlock],
  })
}

function threadItemToMessageRecord(item: ThreadItem): {
  content: string
  role: string
  status: string | null
  richContent: string | null
} {
  const storageItem = Array.isArray((item as any).attachments)
    ? {
        ...item,
        attachments: (item as any).attachments.map((attachment: Attachment) => {
          const { download_url: _downloadUrl, ...stored } = attachment
          if (stored.type === 'image' && stored.pod_url) stored.preview_url = stored.pod_url
          return stored
        }),
      }
    : item
  const hasConversationMetadata = ['parent_item_id', 'branch_id', 'supersedes']
    .some((key) => typeof (item as any)[key] === 'string')
  if (item.type === 'user_message') {
    const hasExtendedState = Array.isArray(item.attachments) && item.attachments.length > 0
      || Boolean(item.inference_options && Object.keys(item.inference_options).length > 0)
      || hasConversationMetadata
    return {
      content: (item as any).content
        .filter((contentPart: any) => contentPart.type === 'input_text')
        .map((contentPart: any) => contentPart.text)
        .join('\n'),
      role: MessageRole.USER,
      status: null,
      richContent: hasExtendedState ? JSON.stringify(storageItem) : null,
    }
  }

  if (item.type === 'assistant_message') {
    const hasAnnotations = Array.isArray((item as any).content)
      && (item as any).content.some((contentPart: any) => (
        contentPart.type === 'output_text'
        && Array.isArray(contentPart.annotations)
        && contentPart.annotations.length > 0
      ))
    const hasExtendedState = Array.isArray(item.attachments) && item.attachments.length > 0
      || typeof (item as ThreadItem & { feedback?: unknown }).feedback === 'string'
      || hasConversationMetadata
      || hasAnnotations
      || Array.isArray((item as ThreadItem & { artifacts?: unknown }).artifacts)
    return {
      content: (item as any).content
        .filter((contentPart: any) => contentPart.type === 'output_text')
        .map((contentPart: any) => contentPart.text)
        .join('\n'),
      role: MessageRole.ASSISTANT,
      status: (item as any).status || MessageStatus.COMPLETED,
      richContent: hasExtendedState ? JSON.stringify(storageItem) : null,
    }
  }

  return {
    content: item.type === 'client_tool_call' ? (item as any).name || item.type : JSON.stringify(item),
    role: MessageRole.SYSTEM,
    status: typeof (item as any).status === 'string' ? (item as any).status : null,
    richContent: item.type === 'client_tool_call'
      ? createClientToolCallRichContent(item)
      : JSON.stringify(item),
  }
}

function messageRecordToItem(record: any, threadId: string): ThreadItem {
  const createdAt = record.createdAt
    ? Math.floor(new Date(record.createdAt).getTime() / 1000)
    : nowTimestamp()
  const itemId = readChatKitItemId(record) ?? requireRecordId(record, 'Message row')

  const storedThreadItem = parseStoredThreadItem(record.richContent, threadId, createdAt)
    ?? parseStoredThreadItem(record.content, threadId, createdAt)
  if (storedThreadItem) {
    return storedThreadItem
  }

  if (record.role === MessageRole.USER) {
    return {
      id: itemId,
      thread_id: threadId,
      type: 'user_message',
      content: [{ type: 'input_text', text: record.content || '' }],
      attachments: [],
      created_at: createdAt,
    } as ThreadItem
  }
  return {
    id: itemId,
    thread_id: threadId,
    type: 'assistant_message',
    content: [{ type: 'output_text', text: record.content || '', annotations: [] } as any],
    attachments: [],
    status: record.status || 'completed',
    created_at: createdAt,
  } as ThreadItem
}

function shouldUpdateAssistantSummary(
  item: ThreadItem,
  previousItem: ThreadItem | undefined,
  nextRecord: ReturnType<typeof threadItemToMessageRecord>,
): boolean {
  if (item.type !== 'assistant_message' || nextRecord.status === 'in_progress') return false
  if (!previousItem || previousItem.type !== 'assistant_message') return true

  const previousRecord = threadItemToMessageRecord(previousItem)
  return previousRecord.content !== nextRecord.content
    || previousRecord.status !== nextRecord.status
}

// ---------------------------------------------------------------------------
// LocalChatKitStore
// ---------------------------------------------------------------------------

export class LocalChatKitStore implements ChatKitStore<StoreContext> {
  private db: SolidDatabase
  private webId: string
  private authFetch: typeof fetch
  private attachments = new Map<string, Attachment>()
  private attachmentObjectUrls = new Map<string, string>()
  private recentlyCreatedIds = new Set<string>()
  private initializedMessageDocuments = new Set<string>()
  // In-memory caches (per-instance, not per-context)
  private threadChatIdCache = new Map<string, string>()
  private threadMetadataCache = new Map<string, ThreadMetadata>()
  private provisionalThreadIds = new Set<string>()
  private threadItemsCache = new Map<string, ThreadItem[]>()
  private completeThreadItemCaches = new Set<string>()
  private completeThreadItemLoadPromises = new Map<string, Promise<void>>()
  private messageRowIdByItemId = new Map<string, string>()
  private onAttachmentsChange?: (attachments: Attachment[]) => void
  private onThreadItemsChange?: (items: ThreadItem[]) => void
  private onChatSummaryChange?: (summary: {
    chatId: string
    messageId: string
    content: string
    createdAt: Date
  }) => Promise<void> | void

  constructor(
    db: SolidDatabase,
    webId: string,
    authFetch: typeof fetch,
    initialThread?: ThreadMetadata,
    onAttachmentsChange?: (attachments: Attachment[]) => void,
    onChatSummaryChange?: (summary: {
      chatId: string
      messageId: string
      content: string
      createdAt: Date
    }) => Promise<void> | void,
    onThreadItemsChange?: (items: ThreadItem[]) => void,
  ) {
    this.db = db
    this.webId = webId
    this.authFetch = authFetch
    this.onAttachmentsChange = onAttachmentsChange
    this.onChatSummaryChange = onChatSummaryChange
    this.onThreadItemsChange = onThreadItemsChange
    if (initialThread) {
      this.threadMetadataCache.set(initialThread.id, initialThread)
      this.provisionalThreadIds.add(initialThread.id)
      const chatId = getChatIdFromMetadata(initialThread.metadata)
      this.threadChatIdCache.set(initialThread.id, chatId)
    }
  }

  // -----------------------------------------------------------------------
  // ID generation
  // -----------------------------------------------------------------------

  generateThreadId(_context: StoreContext): string {
    return generateId('thread')
  }

  generateItemId(itemType: StoreItemType, _thread: ThreadMetadata, _context: StoreContext): string {
    return generateId(itemType.replace('_', '-'))
  }

  // -----------------------------------------------------------------------
  // Chat container helpers
  // -----------------------------------------------------------------------

  private async ensureChat(chatId: string): Promise<void> {
    const chatIdForResource = chatResource.buildId({ id: chatId })
    const existingChat = await (this.db as any).findById(Chat as any, chatIdForResource)
    if (!existingChat) {
      const now = new Date()
      await (this.db as any).insert(Chat as any).values({
        id: chatIdForResource,
        title: chatId === DEFAULT_CHAT_ID ? 'Default Chat' : chatId,
        createdAt: now,
        updatedAt: now,
      }).execute()
    }
  }

  private async getThreadChatId(threadId: string): Promise<string> {
    const cached = this.threadChatIdCache.get(threadId)
    if (cached) return cached

    const thread = await findThreadRecord(this.db, threadId, cached)
    if (!thread) return DEFAULT_CHAT_ID

    const chatId = threadRepository.chatId(thread as any) ?? DEFAULT_CHAT_ID
    this.threadChatIdCache.set(threadId, chatId)
    return chatId
  }

  private buildThreadUri(chatId: string, threadId: string): string {
    return threadRepository.iriForChat(requirePodBaseUrl(this.db), chatId, threadId)
  }

  private buildChatUri(chatId: string): string {
    return buildChatIri(this.db, chatId)
  }

  private buildThreadId(chatId: string, threadId: string): string {
    return threadRepository.idForChat(chatId, threadId)
  }

  private buildMessageId(chatId: string, thread: string, itemId: string, createdAt: Date): string {
    const chat = this.buildChatUri(chatId)
    return messageResource.buildId({
      id: itemId,
      parent: chat,
      chat,
      thread,
      createdAt,
    })
  }

  private async resolveCounterpartMaker(chatId: string): Promise<string> {
    const chat = await (this.db as any).findById(Chat as any, chatResource.buildId({ id: chatId }))
    const participants = Array.isArray(chat?.participants)
      ? chat.participants.filter((participant: unknown): participant is string => typeof participant === 'string' && participant.length > 0)
      : []

    const participantRef = participants.find((participant: string) => participant !== this.webId) ?? participants[0]
    if (!participantRef) {
      return this.webId
    }

    const contact = await this.findContactByRef(participantRef) as { about?: string | null } | null

    return contact?.about || participantRef
  }

  private async findContactByRef(ref: string): Promise<Record<string, unknown> | null> {
    if (ABSOLUTE_IRI.test(ref)) {
      const findByIri = (this.db as any).findByIri
      return typeof findByIri === 'function'
        ? await findByIri.call(this.db, contactResource as any, ref) as Record<string, unknown> | null
        : null
    }
    const findById = (this.db as any).findById
    return typeof findById === 'function'
      ? await findById.call(this.db, contactResource as any, ref) as Record<string, unknown> | null
      : null
  }

  private async queryMessageRowsForThread(
    threadId: string,
    limit: number,
    order: string,
    cursor?: ThreadItemCursor | null,
  ): Promise<any[]> {
    const chatId = await this.getThreadChatId(threadId)
    const normalizedThreadId = extractThreadId(threadId) ?? threadId
    const thread = this.buildThreadUri(chatId, normalizedThreadId)
    const normalizedOrder = normalizeThreadItemOrder(order)
    const createOrderedQuery = () => {
      let query: any = this.db.select().from(Message).where({ thread })
      if (typeof query.orderBy === 'function') {
        query = query.orderBy(
          normalizedOrder === 'desc' ? desc((Message as any).createdAt) : asc((Message as any).createdAt),
          asc((Message as any).id),
        )
      }
      return query
    }
    const executeQuery = async (query: any, queryLimit: number): Promise<any[]> => {
      query = query.limit(queryLimit)
      return withTimeout<any[]>(
        query.execute(),
        POD_QUERY_TIMEOUT_MS,
        `Timed out loading messages for thread ${threadId}`,
      )
    }

    if (!cursor) {
      return executeQuery(createOrderedQuery(), limit)
    }

    // Current local Xpod rejects a single FILTER OR composite cursor. Split it
    // into two bounded queries: the remaining ID tie-break rows at the cursor
    // timestamp, followed by the strict timestamp range.
    let tieQuery = createOrderedQuery()
    if (typeof tieQuery.whereCursor === 'function') {
      tieQuery = tieQuery.whereCursor(and(
        eq((Message as any).createdAt, cursor.createdAt),
        gt((Message as any).id, cursor.rowId),
      ))
    }
    const tieRows = (await executeQuery(tieQuery, limit)).filter((row) => {
      const rowCursor = cursorFromMessageRow(row, order)
      return rowCursor.createdAt.getTime() === cursor.createdAt.getTime()
        && rowCursor.rowId > cursor.rowId
    })
    if (tieRows.length >= limit) return tieRows.slice(0, limit)

    let rangeQuery = createOrderedQuery()
    if (typeof rangeQuery.where === 'function') {
      rangeQuery = rangeQuery.where(normalizedOrder === 'desc'
        ? lt((Message as any).createdAt, cursor.createdAt)
        : gt((Message as any).createdAt, cursor.createdAt))
    }
    const rangeRows = (await executeQuery(rangeQuery, limit - tieRows.length)).filter((row) => {
      const rowTime = cursorFromMessageRow(row, order).createdAt.getTime()
      return normalizedOrder === 'desc'
        ? rowTime < cursor.createdAt.getTime()
        : rowTime > cursor.createdAt.getTime()
    })
    return [...tieRows, ...rangeRows]
  }

  private async filterVisibleMessagesForThread(threadId: string, messages: any[]): Promise<any[]> {
    const chatId = await this.getThreadChatId(threadId)
    const normalizedThreadId = extractThreadId(threadId) ?? threadId
    return messages.filter((message: any) => {
      const messageChatId = extractChatIdFromChatRef(message.chat)
        ?? threadRepository.chatIdFromRef(message.thread)
      return messageChatId === chatId
        && extractThreadId(message.thread) === normalizedThreadId
        && !isHiddenMatrixProtocolEvent(message)
    })
  }

  private async selectMessagePageForThread(
    threadId: string,
    after: string | undefined,
    limit: number,
    order: string,
  ): Promise<{ rows: any[]; hasMore: boolean }> {
    const normalizedLimit = Math.max(1, Math.min(limit, 250))
    let cursor = decodeThreadItemCursor(after, order)
    if (!cursor && after) {
      const cachedItem = this.threadItemsCache.get(threadId)?.find((item) => item.id === after)
      const rowId = this.messageRowIdByItemId.get(after)
      if (cachedItem && rowId) {
        cursor = {
          createdAt: new Date(cachedItem.created_at * 1000),
          rowId,
          order: normalizeThreadItemOrder(order),
        }
      } else {
        const row = await this.scanMessageByItemId(threadId, after)
        if (row) cursor = cursorFromMessageRow(row, order)
      }
    }

    const visibleRows: any[] = []
    const queryLimit = Math.min(250, Math.max(normalizedLimit + 1, 32))
    let hasMoreRawRows = true
    while (visibleRows.length < normalizedLimit && hasMoreRawRows) {
      const rawRows = await this.queryMessageRowsForThread(threadId, queryLimit, order, cursor)
      visibleRows.push(...await this.filterVisibleMessagesForThread(threadId, rawRows))
      hasMoreRawRows = rawRows.length === queryLimit
      const lastRow = rawRows[rawRows.length - 1]
      if (!lastRow || !hasMoreRawRows) break
      cursor = cursorFromMessageRow(lastRow, order)
    }

    return {
      rows: visibleRows.slice(0, normalizedLimit),
      hasMore: visibleRows.length > normalizedLimit || hasMoreRawRows,
    }
  }

  private async selectMessagesForThread(threadId: string): Promise<any[]> {
    const messages: any[] = []
    let cursor: ThreadItemCursor | null = null
    while (true) {
      const rows = await this.queryMessageRowsForThread(threadId, 250, 'asc', cursor)
      messages.push(...await this.filterVisibleMessagesForThread(threadId, rows))
      if (rows.length < 250) return messages
      const lastRow = rows[rows.length - 1]
      if (!lastRow) return messages
      cursor = cursorFromMessageRow(lastRow, 'asc')
    }
  }

  private async scanMessageByItemId(threadId: string, itemId: string): Promise<Record<string, unknown> | null> {
    let cursor: ThreadItemCursor | null = null
    while (true) {
      const rows = await this.queryMessageRowsForThread(threadId, 250, 'asc', cursor)
      const visibleRows = await this.filterVisibleMessagesForThread(threadId, rows)
      const match = visibleRows.find((message) => messageRecordMatchesItem(message, itemId)) ?? null
      if (match) return match
      if (rows.length < 250) return null
      const lastRow = rows[rows.length - 1]
      if (!lastRow) return null
      cursor = cursorFromMessageRow(lastRow, 'asc')
    }
  }

  private getCachedThreadItems(threadId: string): ThreadItem[] | null {
    const cached = this.threadItemsCache.get(threadId)
    return cached ? [...cached] : null
  }

  private loadCompleteCachedThreadItemPage(
    threadId: string,
    after: string | undefined,
    limit: number,
    order: string,
  ): Page<ThreadItem> | null {
    if (after || !this.completeThreadItemCaches.has(threadId)) return null
    const cached = this.getCachedThreadItems(threadId)
    if (!cached) return null

    const normalizedLimit = Math.max(1, Math.min(limit, 250))
    const normalizedOrder = normalizeThreadItemOrder(order)
    const ordered = cached.sort((left, right) => (
      normalizedOrder === 'desc'
        ? right.created_at - left.created_at
        : left.created_at - right.created_at
    ))
    const data = ordered.slice(0, normalizedLimit)
    const cursorFor = (item: ThreadItem | undefined): string | undefined => {
      if (!item) return undefined
      const rowId = this.messageRowIdByItemId.get(item.id)
      return rowId
        ? encodeThreadItemCursor({
            createdAt: new Date(item.created_at * 1000),
            rowId,
            order: normalizedOrder,
          })
        : item.id
    }
    return {
      data,
      has_more: data.length < ordered.length,
      first_id: cursorFor(data[0]),
      last_id: cursorFor(data[data.length - 1]),
    }
  }

  private upsertCachedThreadItem(threadId: string, item: ThreadItem): void {
    const cached = this.threadItemsCache.get(threadId) ?? []
    const index = cached.findIndex((entry) => entry.id === item.id)
    if (index === -1) {
      const next = [...cached, item]
        .sort((left, right) => left.created_at - right.created_at)
        .slice(-MAX_CACHED_THREAD_ITEMS)
      this.threadItemsCache.set(threadId, next)
      this.onThreadItemsChange?.([...next])
      return
    }

    const next = [...cached]
    next[index] = item
    const bounded = next
      .sort((left, right) => left.created_at - right.created_at)
      .slice(-MAX_CACHED_THREAD_ITEMS)
    this.threadItemsCache.set(threadId, bounded)
    this.onThreadItemsChange?.([...bounded])
  }

  private mergeCachedThreadItems(threadId: string, items: ThreadItem[]): void {
    const merged = new Map((this.threadItemsCache.get(threadId) ?? []).map((item) => [item.id, item]))
    for (const item of items) merged.set(item.id, item)
    const next = [...merged.values()]
      .sort((left, right) => left.created_at - right.created_at)
      .slice(-MAX_CACHED_THREAD_ITEMS)
    this.threadItemsCache.set(threadId, next)
    this.onThreadItemsChange?.([...next])
  }

  private removeCachedThreadItem(threadId: string, itemId: string): void {
    const cached = this.threadItemsCache.get(threadId)
    if (!cached) return
    const next = cached.filter((item) => item.id !== itemId)
    if (next.length === 0) {
      this.threadItemsCache.delete(threadId)
      this.onThreadItemsChange?.([])
      return
    }
    this.threadItemsCache.set(threadId, next)
    this.onThreadItemsChange?.([...next])
  }

  private resolveRowIri(resource: unknown, row: Record<string, unknown>): string {
    requireRecordId(row, 'Pod row')
    const iri = typeof (this.db as any).resolveRowIri === 'function'
      ? (this.db as any).resolveRowIri(resource as any, row)
      : null
    if (typeof iri !== 'string' || iri.length === 0) {
      throw new Error('Unable to resolve Pod row IRI from row.id.')
    }
    return iri
  }

  private cacheMessageRow(itemId: string, row: Record<string, unknown>): void {
    this.messageRowIdByItemId.delete(itemId)
    this.messageRowIdByItemId.set(itemId, requireRecordId(row, 'Message row'))
    while (this.messageRowIdByItemId.size > MAX_CACHED_MESSAGE_ROW_IDS) {
      const oldestItemId = this.messageRowIdByItemId.keys().next().value
      if (typeof oldestItemId !== 'string') break
      this.messageRowIdByItemId.delete(oldestItemId)
    }
  }

  private async findMessageByItemId(threadId: string, itemId: string): Promise<Record<string, unknown> | null> {
    const cachedRowId = this.messageRowIdByItemId.get(itemId)
    if (cachedRowId) {
      const row = await (this.db as any).findById(Message as any, cachedRowId)
      if (row) return row
      this.messageRowIdByItemId.delete(itemId)
    }

    const row = await this.scanMessageByItemId(threadId, itemId)
    if (row) {
      this.cacheMessageRow(itemId, row)
    }
    return row
  }

  private resolveMessageIri(row: Record<string, unknown>): string {
    return this.resolveRowIri(Message, row)
  }

  private async ensureMessageDocument(messageIri: string): Promise<void> {
    const resourceUrl = resourceUrlFromIri(messageIri)
    if (this.initializedMessageDocuments.has(resourceUrl)) return

    const podBaseUrl = requirePodBaseUrl(this.db).replace(/\/?$/, '/')
    const resource = new URL(resourceUrl)
    const pod = new URL(podBaseUrl)
    if (resource.origin !== pod.origin || !resource.pathname.startsWith(pod.pathname)) {
      throw new Error(`Message resource is outside the active Pod: ${resourceUrl}`)
    }

    const relativePath = resource.pathname.slice(pod.pathname.length)
    const segments = relativePath.split('/').filter(Boolean)
    let currentUrl = podBaseUrl
    for (const segment of segments.slice(0, -1)) {
      currentUrl = new URL(`${encodeURIComponent(segment)}/`, currentUrl).toString()
      const existing = await this.authFetch(currentUrl, { method: 'HEAD' })
      if (existing.ok) continue
      if (existing.status !== 404) {
        throw new Error(`Message container check failed: ${existing.status} ${existing.statusText}`)
      }
      const created = await this.authFetch(currentUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/turtle',
          Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
        },
        body: '',
      })
      if (!created.ok && created.status !== 409) {
        throw new Error(`Message container creation failed: ${created.status} ${created.statusText}`)
      }
    }

    const existing = await this.authFetch(resourceUrl, { method: 'HEAD' })
    if (!existing.ok) {
      if (existing.status !== 404) {
        throw new Error(`Message document check failed: ${existing.status} ${existing.statusText}`)
      }
      const created = await this.authFetch(resourceUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/turtle' },
        body: '',
      })
      if (!created.ok && created.status !== 409) {
        throw new Error(`Message document creation failed: ${created.status} ${created.statusText}`)
      }
    }
    this.initializedMessageDocuments.add(resourceUrl)
  }

  private async deleteMessageRecord(message: any): Promise<void> {
    await deleteExactRecord(this.db, Message as any, message as any)
  }

  // -----------------------------------------------------------------------
  // Thread operations
  // -----------------------------------------------------------------------

  async loadThread(threadId: string, _context: StoreContext): Promise<ThreadMetadata> {
    const cached = this.threadMetadataCache.get(threadId)
    if (cached && !this.provisionalThreadIds.has(threadId)) return cached

    let thread: Record<string, unknown> | null = null
    try {
      thread = await findThreadRecord(this.db, threadId, this.threadChatIdCache.get(threadId))
    } catch (error) {
      if (cached) return cached
      throw error
    }
    if (!thread) {
      if (cached) return cached
      throw new Error(`Thread not found: ${threadId}`)
    }

    const metadata = threadRecordToMetadata(thread)
    const resolvedChatId = this.threadChatIdCache.get(threadId)
    if (resolvedChatId) {
      metadata.metadata = { ...(metadata.metadata ?? {}), chat_id: resolvedChatId }
    }
    this.threadMetadataCache.set(threadId, metadata)
    this.provisionalThreadIds.delete(threadId)
    return metadata
  }

  async saveThread(thread: ThreadMetadata, _context: StoreContext): Promise<void> {
    const now = new Date()
    const chatId = getChatIdFromMetadata(thread.metadata)

    const metadataToPersist = { ...(thread.metadata ?? {}) }
    delete metadataToPersist.chat_id
    const metadataValue = Object.keys(metadataToPersist).length > 0
      ? metadataToPersist
      : undefined

    await this.ensureChat(chatId)
    this.threadChatIdCache.set(thread.id, chatId)

    const existingThread = await findThreadRecord(this.db, thread.id, chatId)

    if (existingThread) {
      const chat = this.buildChatUri(chatId)
      await updateExactRecord(this.db, Thread as any, existingThread as any, {
        scope: chat,
        parent: chat,
        chat,
        title: thread.title || undefined,
        status: statusToString(thread.status),
        metadata: metadataValue,
        updatedAt: now,
      } as any)
      await this.normalizeThreadSingletons(
        this.resolveRowIri(Thread, existingThread as Record<string, unknown>),
        thread.title,
        statusToString(thread.status),
        existingThread.createdAt instanceof Date
          ? existingThread.createdAt
          : new Date(existingThread.createdAt ?? thread.created_at * 1000),
        now,
        metadataValue?.active_branch_by_parent,
      )
    } else {
      const chat = this.buildChatUri(chatId)
      await (this.db as any).insert(Thread as any).values({
        id: this.buildThreadId(chatId, thread.id),
        scope: chat,
        parent: chat,
        chat,
        title: thread.title || undefined,
        status: statusToString(thread.status),
        metadata: metadataValue,
        createdAt: new Date(thread.created_at * 1000),
        updatedAt: now,
      }).execute()
    }

    this.threadMetadataCache.set(thread.id, {
      ...thread,
      metadata: { ...(thread.metadata ?? {}), chat_id: chatId },
    })
    this.provisionalThreadIds.delete(thread.id)
  }

  private async normalizeThreadSingletons(
    threadIri: string,
    title: string | undefined,
    status: string,
    createdAt: Date,
    updatedAt: Date,
    activeBranchByParent: unknown,
  ): Promise<void> {
    const resourceUrl = resourceUrlFromIri(threadIri)
    const titlePredicate = 'http://purl.org/dc/terms/title'
    const createdAtPredicate = 'http://purl.org/dc/terms/created'
    const updatedAtPredicate = 'http://purl.org/dc/terms/modified'
    const activeBranchPredicate = UDFS('active_branch_by_parent')
    const deletes = [
      `<${threadIri}> <${titlePredicate}> ?oldTitle .`,
      `<${threadIri}> <${UDFS.status}> ?oldStatus .`,
      `<${threadIri}> <${createdAtPredicate}> ?oldCreatedAt .`,
      `<${threadIri}> <${updatedAtPredicate}> ?oldUpdatedAt .`,
    ]
    const inserts = [
      `<${threadIri}> <${UDFS.status}> ${sparqlStringLiteral(status)} .`,
      `<${threadIri}> <${createdAtPredicate}> ${sparqlStringLiteral(createdAt.toISOString())}^^<http://www.w3.org/2001/XMLSchema#dateTime> .`,
      `<${threadIri}> <${updatedAtPredicate}> ${sparqlStringLiteral(updatedAt.toISOString())}^^<http://www.w3.org/2001/XMLSchema#dateTime> .`,
    ]
    const optional = [
      `OPTIONAL { <${threadIri}> <${titlePredicate}> ?oldTitle . }`,
      `OPTIONAL { <${threadIri}> <${UDFS.status}> ?oldStatus . }`,
      `OPTIONAL { <${threadIri}> <${createdAtPredicate}> ?oldCreatedAt . }`,
      `OPTIONAL { <${threadIri}> <${updatedAtPredicate}> ?oldUpdatedAt . }`,
    ]

    if (title) inserts.push(`<${threadIri}> <${titlePredicate}> ${sparqlStringLiteral(title)} .`)
    if (activeBranchByParent && typeof activeBranchByParent === 'object') {
      deletes.push(`?metadataNode <${activeBranchPredicate}> ?oldActiveBranch .`)
      inserts.push(`?metadataNode <${activeBranchPredicate}> ${sparqlStringLiteral(JSON.stringify(activeBranchByParent))}^^<http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON> .`)
      optional.push(
        `<${threadIri}> <${UDFS.metadata}> ?metadataNode .`,
        `OPTIONAL { ?metadataNode <${activeBranchPredicate}> ?oldActiveBranch . }`,
      )
    }

    const response = await this.authFetch(resourceUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/sparql-update' },
      body: `DELETE { GRAPH <${resourceUrl}> { ${deletes.join(' ')} } } INSERT { GRAPH <${resourceUrl}> { ${inserts.join(' ')} } } WHERE { GRAPH <${resourceUrl}> { <${threadIri}> ?existingPredicate ?existingObject . ${optional.join(' ')} } }`,
    })
    if (!response.ok) {
      throw new Error(`Failed to normalize thread metadata (${response.status})`)
    }
  }

  async loadThreads(
    limit: number,
    after: string | undefined,
    order: string,
    _context: StoreContext,
  ): Promise<Page<ThreadMetadata>> {
    try {
      const threads = await this.db.select().from(Thread).execute()
      threads.sort((a: any, b: any) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return order === 'desc' ? bTime - aTime : aTime - bTime
      })

      let startIndex = 0
      if (after) {
        const idx = threads.findIndex((t: any) => t.id === after)
        if (idx !== -1) startIndex = idx + 1
      }
      const slice = threads.slice(startIndex, startIndex + limit).map((t: any) => threadRecordToMetadata(t))
      return {
        data: slice,
        has_more: startIndex + limit < threads.length,
        first_id: slice.length > 0 ? slice[0]?.id : undefined,
        last_id: slice.length > 0 ? slice[slice.length - 1]?.id : undefined,
      }
    } catch (error) {
      console.error('[LocalStore] Failed to load threads:', error)
      return { data: [], has_more: false }
    }
  }

  async deleteThread(threadId: string, _context: StoreContext): Promise<void> {
    let chatId = this.threadChatIdCache.get(threadId)
    if (!chatId) {
      try {
        const thread = await findThreadRecord(this.db, threadId)
        if (thread) {
          chatId = threadRepository.chatId(thread as any) ?? DEFAULT_CHAT_ID
        }
      } catch (err: any) {
        console.debug('[LocalStore] Ignoring thread lookup error during delete:', err?.message || err)
      }
    }

    try {
      const messages = await this.selectMessagesForThread(threadId)
      const attachmentIds = new Set(messages.flatMap((message: any) => (
        this.attachmentIdsFromItem(messageRecordToItem(message, threadId))
      )))
      for (const message of messages) {
        await this.deleteMessageRecord(message)
      }
      await Promise.all([...attachmentIds].map(async (attachmentId) => {
        if (!await this.isAttachmentReferencedElsewhere(attachmentId)) {
          await this.deleteAttachment(attachmentId, _context)
        }
      }))
    } catch (err: any) {
      if (
        !err.message?.includes('404')
        && !err.message?.includes('Could not retrieve')
        && !err.message?.includes('Parse error')
      ) throw err
    }
    try {
      const thread = await findThreadRecord(this.db, threadId, chatId)
      if (thread) {
        await deleteExactRecord(this.db, Thread as any, thread as any)
      }
    } catch (err: any) {
      if (
        !err.message?.includes('404')
        && !err.message?.includes('Could not retrieve')
        && !err.message?.includes('Parse error')
      ) throw err
    }
    this.threadMetadataCache.delete(threadId)
    this.threadChatIdCache.delete(threadId)
    this.threadItemsCache.delete(threadId)
    this.completeThreadItemCaches.delete(threadId)
  }

  // -----------------------------------------------------------------------
  // Item (Message) operations
  // -----------------------------------------------------------------------

  async loadThreadItems(
    threadId: string,
    after: string | undefined,
    limit: number,
    order: string,
    _context: StoreContext,
  ): Promise<Page<ThreadItem>> {
    let resolveCompleteLoad: (() => void) | undefined
    let completeLoadPromise: Promise<void> | undefined
    try {
      const cachedPage = this.loadCompleteCachedThreadItemPage(threadId, after, limit, order)
      if (cachedPage) {
        this.emitThreadAttachments(cachedPage.data)
        return cachedPage
      }

      if (!after) {
        const pendingLoad = this.completeThreadItemLoadPromises.get(threadId)
        if (pendingLoad) {
          await pendingLoad
          const coalescedPage = this.loadCompleteCachedThreadItemPage(threadId, after, limit, order)
          if (coalescedPage) {
            this.emitThreadAttachments(coalescedPage.data)
            return coalescedPage
          }
        }
        completeLoadPromise = new Promise<void>((resolve) => {
          resolveCompleteLoad = resolve
        })
        this.completeThreadItemLoadPromises.set(threadId, completeLoadPromise)
      }

      const { rows, hasMore } = await this.selectMessagePageForThread(threadId, after, limit, order)
      const data = rows.map((message: any) => {
        const item = messageRecordToItem(message, threadId)
        this.cacheMessageRow(item.id, message)
        return item
      })
      const hydratedPage = await Promise.all(data.map((item) => this.hydrateItemAttachments(item)))
      this.mergeCachedThreadItems(threadId, hydratedPage)
      if (!after && !hasMore) {
        this.completeThreadItemCaches.add(threadId)
      }
      this.emitThreadAttachments(hydratedPage)
      return {
        data: hydratedPage,
        has_more: hasMore,
        first_id: rows.length > 0 ? encodeThreadItemCursor(cursorFromMessageRow(rows[0], order)) : undefined,
        last_id: rows.length > 0 ? encodeThreadItemCursor(cursorFromMessageRow(rows[rows.length - 1], order)) : undefined,
      }
    } catch (error) {
      console.error('[LocalStore] Failed to load thread items:', error)
      return { data: [], has_more: false }
    } finally {
      resolveCompleteLoad?.()
      if (
        completeLoadPromise
        && this.completeThreadItemLoadPromises.get(threadId) === completeLoadPromise
      ) {
        this.completeThreadItemLoadPromises.delete(threadId)
      }
    }
  }

  async refreshThreadItems(threadId: string, context: StoreContext): Promise<void> {
    await this.completeThreadItemLoadPromises.get(threadId)
    this.threadItemsCache.delete(threadId)
    this.completeThreadItemCaches.delete(threadId)
    await this.loadThreadItems(threadId, undefined, 100, 'desc', context)
  }

  async addThreadItem(threadId: string, item: ThreadItem, _context: StoreContext): Promise<void> {
    const chatId = await this.getThreadChatId(threadId)
    const { content, role, status, richContent } = threadItemToMessageRecord(item)
    const createdAt = new Date(item.created_at * 1000)
    const thread = this.buildThreadUri(chatId, threadId)
    const messageId = this.buildMessageId(chatId, thread, item.id, createdAt)
    const maker = role === MessageRole.USER
      ? this.webId
      : await this.resolveCounterpartMaker(chatId)
    const reconcilerRole = role === MessageRole.ASSISTANT
      ? 'assistant'
      : role === MessageRole.SYSTEM
        ? 'system'
        : 'user'

    const chat = this.buildChatUri(chatId)
    const requiresLiteralPatch = requiresSafeInitialLiteral(content)
      || requiresSafeInitialLiteral(richContent)
    const initialContent = requiresLiteralPatch ? initialLiteralPlaceholder(content) : content
    const metadata = buildChatKitMessageReconcilerMetadata({
      db: this.db,
      chat,
      thread,
      messageId,
      role: reconcilerRole,
      content: initialContent,
      maker,
      createdAt,
      existingMetadata: {
        [CHATKIT_ITEM_ID_METADATA_KEY]: item.id,
      },
    })

    const messageIri = messageResource.buildIri(requirePodBaseUrl(this.db), {
      id: messageId,
      parent: chat,
      chat,
      thread,
      createdAt,
    })
    await this.ensureMessageDocument(messageIri)

    await withTimeout(
      (this.db as any).insert(Message as any).values({
        id: messageId,
        scope: chat,
        parent: chat,
        chat,
        thread,
        maker,
        role,
        content: initialContent,
        richContent: requiresLiteralPatch ? undefined : richContent ?? undefined,
        metadata,
        status: status ?? undefined,
        createdAt,
      }).execute(),
      POD_QUERY_TIMEOUT_MS,
      `Timed out saving message ${item.id}`,
    )
    if (requiresLiteralPatch) {
      const messageIri = this.resolveMessageIri({ id: messageId })
      await this.directPatchMessage(messageIri, content, richContent, status)
    }
    if (typeof this.db.resolveRowIri !== 'function' && typeof this.db.findById === 'function') {
      await this.db.findById(Message as any, messageId)
    }
    this.messageRowIdByItemId.set(item.id, messageId)
    this.recentlyCreatedIds.add(item.id)
    this.upsertCachedThreadItem(threadId, item)
    if (item.type === 'user_message' || (item.type === 'assistant_message' && status !== 'in_progress')) {
      await this.updateChatSummaryBestEffort(chatId, messageId, content, createdAt)
    }
  }

  async saveItem(threadId: string, item: ThreadItem, _context: StoreContext): Promise<void> {
    const nextRecord = threadItemToMessageRecord(item)
    const { content, status, richContent } = nextRecord

    const cachedItem = this.getCachedThreadItems(threadId)?.find((entry) => entry.id === item.id)

    // For recently created or in-memory messages, patch the known resource directly
    // instead of issuing a broad message SELECT during the active stream.
    if (this.recentlyCreatedIds.has(item.id)) {
      this.recentlyCreatedIds.delete(item.id)
      const rowId = this.messageRowIdByItemId.get(item.id)
      if (!rowId) throw new Error(`Cannot resolve Pod message row for ChatKit item ${item.id}`)
      const messageIri = this.resolveMessageIri({ id: rowId })
      await this.directPatchMessage(messageIri, content, richContent, status)
      this.upsertCachedThreadItem(threadId, item)
      if (shouldUpdateAssistantSummary(item, cachedItem, nextRecord)) {
        const chatId = await this.getThreadChatId(threadId)
        await this.updateChatSummaryBestEffort(chatId, rowId, content, new Date(item.created_at * 1000))
      }
      return
    }

    if (cachedItem) {
      const rowId = this.messageRowIdByItemId.get(item.id)
      if (rowId) {
        const messageIri = this.resolveMessageIri({ id: rowId })
        await this.directPatchMessage(messageIri, content, richContent, status)
        this.upsertCachedThreadItem(threadId, item)
        if (shouldUpdateAssistantSummary(item, cachedItem, nextRecord)) {
          const chatId = await this.getThreadChatId(threadId)
          await this.updateChatSummaryBestEffort(chatId, rowId, content, new Date(item.created_at * 1000))
        }
        return
      }
    }

    const existing = await this.findMessageByItemId(threadId, item.id)

    if (existing) {
      const storedItem = cachedItem ?? messageRecordToItem(existing, threadId)
      const messageIri = this.resolveMessageIri(existing)
      await this.directPatchMessage(messageIri, content, richContent, status)
      this.upsertCachedThreadItem(threadId, item)
      if (shouldUpdateAssistantSummary(item, storedItem, nextRecord)) {
        const chatId = await this.getThreadChatId(threadId)
        await this.updateChatSummaryBestEffort(chatId, requireRecordId(existing, 'Message row'), content, new Date(item.created_at * 1000))
      }
    } else {
      await this.addThreadItem(threadId, item, _context)
    }
  }

  /**
   * Direct SPARQL UPDATE PATCH to update message content.
   * Avoids drizzle-solid UPDATE bug (same approach as PodChatKitStore).
   */
  private async directPatchMessage(
    messageIri: string,
    content: string,
    richContent: string | null,
    status: string | null,
  ): Promise<void> {
    const resourceUrl = resourceUrlFromIri(messageIri)
    const graphUri = resourceUrl

    const deleteTriples = [
      `<${messageIri}> <http://rdfs.org/sioc/ns#content> ?oldContent .`,
      `<${messageIri}> <http://rdfs.org/sioc/ns#richContent> ?oldRichContent .`,
    ]
    const insertTriples = [
      `<${messageIri}> <http://rdfs.org/sioc/ns#content> ${sparqlStringLiteral(content)} .`,
    ]
    const wherePatterns = [
      `<${messageIri}> ?existingPredicate ?existingObject .`,
      `OPTIONAL { <${messageIri}> <http://rdfs.org/sioc/ns#content> ?oldContent . }`,
      `OPTIONAL { <${messageIri}> <http://rdfs.org/sioc/ns#richContent> ?oldRichContent . }`,
    ]

    if (richContent !== null) {
      insertTriples.push(`<${messageIri}> <http://rdfs.org/sioc/ns#richContent> ${sparqlStringLiteral(richContent)} .`)
    }

    if (status) {
      deleteTriples.push(`<${messageIri}> <${UDFS.messageStatus}> ?oldStatus .`)
      wherePatterns.push(`OPTIONAL { <${messageIri}> <${UDFS.messageStatus}> ?oldStatus . }`)
      insertTriples.push(`<${messageIri}> <${UDFS.messageStatus}> ${sparqlStringLiteral(status)} .`)
    }

    const sparql = `
DELETE { GRAPH <${graphUri}> { ${deleteTriples.join(' ')} } }
INSERT { GRAPH <${graphUri}> { ${insertTriples.join(' ')} } }
WHERE { GRAPH <${graphUri}> { ${wherePatterns.join(' ')} } }
    `.trim()

    // Use the auth fetch passed in at construction time
    const response = await this.authFetch(resourceUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/sparql-update' },
      body: sparql,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Direct PATCH failed: ${response.status} ${response.statusText} - ${text}`)
    }
  }

  async loadItem(threadId: string, itemId: string, _context: StoreContext): Promise<ThreadItem> {
    const cachedItem = this.getCachedThreadItems(threadId)?.find((item) => item.id === itemId)
    if (cachedItem) {
      return cachedItem
    }

    const message = await this.findMessageByItemId(threadId, itemId)
    if (!message) throw new Error(`Item not found: ${itemId}`)
    return this.hydrateItemAttachments(messageRecordToItem(message, threadId))
  }

  async deleteThreadItem(threadId: string, itemId: string, _context: StoreContext): Promise<void> {
    const message = await this.findMessageByItemId(threadId, itemId)
    if (!message) {
      return
    }

    const attachmentIds = this.attachmentIdsFromItem(messageRecordToItem(message, threadId))
    await this.deleteMessageRecord(message)
    await Promise.all(attachmentIds.map(async (attachmentId) => {
      if (!await this.isAttachmentReferencedElsewhere(attachmentId)) {
        await this.deleteAttachment(attachmentId, _context)
      }
    }))
    this.messageRowIdByItemId.delete(itemId)
    this.removeCachedThreadItem(threadId, itemId)
  }

  // -----------------------------------------------------------------------
  // Attachments are binary Pod resources. Their ChatKit metadata travels with
  // the user message, so no parallel RDF attachment model is required here.
  // -----------------------------------------------------------------------

  private attachmentUrl(attachmentId: string): string {
    return new URL(encodeURIComponent(attachmentId), this.attachmentContainerUrl()).toString()
  }

  private rememberAttachment(attachment: Attachment): Attachment {
    const { preview_url: _previewUrl, download_url: _downloadUrl, ...metadata } = attachment
    const remembered = {
      ...metadata,
      pod_url: this.attachmentUrl(attachment.id),
    }
    this.attachments.set(remembered.id, remembered)
    return remembered
  }

  private attachmentIdsFromItem(item: ThreadItem): string[] {
    if (!('attachments' in item) || !Array.isArray(item.attachments)) return []
    return item.attachments
      .map((attachment) => attachment.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  }

  private async isAttachmentReferencedElsewhere(attachmentId: string): Promise<boolean> {
    // ChatKit attachment ids are URL-safe. Preserve unknown ids instead of
    // interpolating them into a Pod query or deleting without proof.
    if (!/^[A-Za-z0-9.-]+$/u.test(attachmentId)) return true
    try {
      let query: any = this.db.select().from(Message)
      if (typeof query.where === 'function') {
        query = query.where(like((Message as any).richContent, `%${attachmentId}%`))
      }
      const candidates = await withTimeout<any[]>(
        query.execute(),
        POD_QUERY_TIMEOUT_MS,
        `Timed out checking attachment references for ${attachmentId}`,
      )
      return candidates.some((message) => {
        const candidateThreadId = extractThreadId(message.thread) ?? ''
        return this.attachmentIdsFromItem(messageRecordToItem(message, candidateThreadId)).includes(attachmentId)
      })
    } catch (error) {
      console.warn('[LocalStore] Attachment reference check failed; preserving binary:', error)
      return true
    }
  }

  private async hydrateItemAttachments(item: ThreadItem): Promise<ThreadItem> {
    if (!Array.isArray((item as any).attachments) || (item as any).attachments.length === 0) return item
    // Keep historical attachment hydration metadata-only. Binary content is
    // fetched explicitly when the user previews or downloads one attachment.
    const attachments = (item as any).attachments.map((raw: Attachment) => this.rememberAttachment(raw))
    return { ...item, attachments } as ThreadItem
  }

  private emitThreadAttachments(items: ThreadItem[]): void {
    if (!this.onAttachmentsChange) return
    const attachments = new Map<string, Attachment>()
    for (const item of items) {
      const itemAttachments = 'attachments' in item ? item.attachments ?? [] : []
      for (const attachment of itemAttachments) {
        attachments.set(attachment.id, attachment)
      }
    }
    this.onAttachmentsChange([...attachments.values()])
  }

  private async updateChatSummary(
    chatId: string,
    messageId: string,
    content: string,
    createdAt: Date,
  ): Promise<void> {
    if (!content.trim()) return
    if (this.onChatSummaryChange) {
      await this.onChatSummaryChange({ chatId, messageId, content, createdAt })
      return
    }
    if (typeof this.db.resolveRowIri !== 'function') return
    const chatIri = this.buildChatUri(chatId)
    const messageIri = this.resolveMessageIri({ id: messageId })
    const resourceUrl = resourceUrlFromIri(chatIri)
    const timestamp = createdAt.toISOString()
    const update = `
DELETE {
  GRAPH <${resourceUrl}> {
    <${chatIri}> <${UDFS.lastMessage}> ?oldMessage .
    <${chatIri}> <http://schema.org/text> ?oldPreview .
    <${chatIri}> <${UDFS.lastActiveAt}> ?oldActiveAt .
    <${chatIri}> <http://purl.org/dc/terms/modified> ?oldUpdatedAt .
  }
}
INSERT {
  GRAPH <${resourceUrl}> {
    <${chatIri}> <${UDFS.lastMessage}> <${messageIri}> .
    <${chatIri}> <http://schema.org/text> ${sparqlStringLiteral(content.slice(0, 100))} .
    <${chatIri}> <${UDFS.lastActiveAt}> "${timestamp}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
    <${chatIri}> <http://purl.org/dc/terms/modified> "${timestamp}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
  }
}
WHERE {
  GRAPH <${resourceUrl}> {
    <${chatIri}> ?existingPredicate ?existingObject .
    OPTIONAL { <${chatIri}> <${UDFS.lastMessage}> ?oldMessage . }
    OPTIONAL { <${chatIri}> <http://schema.org/text> ?oldPreview . }
    OPTIONAL { <${chatIri}> <${UDFS.lastActiveAt}> ?oldActiveAt . }
    OPTIONAL { <${chatIri}> <http://purl.org/dc/terms/modified> ?oldUpdatedAt . }
  }
}`
    const response = await this.authFetch(resourceUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/sparql-update' },
      body: update,
    })
    if (!response.ok) {
      throw new Error(`Chat summary update failed: ${response.status} ${response.statusText}`)
    }
  }

  private async updateChatSummaryBestEffort(
    chatId: string,
    messageId: string,
    content: string,
    createdAt: Date,
  ): Promise<void> {
    try {
      await this.updateChatSummary(chatId, messageId, content, createdAt)
    } catch (error) {
      // The message is already durable. A denormalized navigation summary must
      // never make ChatKit retry the primary write and duplicate the message.
      console.warn('[LocalStore] Chat summary projection will recover on the next durable message:', error)
    }
  }

  private async getAttachmentObjectUrl(attachment: Attachment): Promise<string> {
    const cached = this.attachmentObjectUrls.get(attachment.id)
    if (cached) return cached
    const bytes = await this.readAttachmentBytes(attachment.id)
    const objectUrl = URL.createObjectURL(new Blob([
      new Uint8Array(bytes).buffer as ArrayBuffer,
    ], { type: attachment.mime_type }))
    this.attachmentObjectUrls.set(attachment.id, objectUrl)
    return objectUrl
  }

  async loadAttachmentObjectUrl(attachmentId: string): Promise<string> {
    const attachment = await this.loadAttachment(attachmentId, {})
    return this.getAttachmentObjectUrl(attachment)
  }

  dispose(): void {
    for (const objectUrl of this.attachmentObjectUrls.values()) URL.revokeObjectURL(objectUrl)
    this.attachmentObjectUrls.clear()
  }

  private attachmentContainerUrl(): string {
    const podBaseUrl = requirePodBaseUrl(this.db).replace(/\/?$/, '/')
    return new URL('.data/chat-attachments/', podBaseUrl).toString()
  }

  private async ensureAttachmentContainer(signal?: AbortSignal): Promise<void> {
    const containerUrl = this.attachmentContainerUrl()
    const existing = await this.authFetch(containerUrl, { method: 'HEAD', signal })
    if (existing.ok) return
    if (existing.status !== 404) {
      throw new Error(`Attachment container check failed: ${existing.status} ${existing.statusText}`)
    }

    const response = await this.authFetch(containerUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/turtle',
        Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
      },
      body: '',
      signal,
    })
    if (!response.ok && response.status !== 409) {
      throw new Error(`Attachment container creation failed: ${response.status} ${response.statusText}`)
    }
  }

  createAttachment(input: { name: string; mime_type: string }): Attachment {
    const id = generateId('attach')
    const url = this.attachmentUrl(id)
    const attachment: Attachment = {
      id,
      type: input.mime_type.startsWith('image/') ? 'image' : 'file',
      name: input.name,
      mime_type: input.mime_type || 'application/octet-stream',
      pod_url: url,
      ...(input.mime_type.startsWith('image/') ? { preview_url: url } : {}),
      upload_descriptor: {
        url: `local://chatkit/attachments/${encodeURIComponent(id)}`,
        method: 'PUT',
        headers: { 'Content-Type': input.mime_type || 'application/octet-stream' },
      },
    }
    this.attachments.set(id, attachment)
    return attachment
  }

  async uploadAttachment(
    attachmentId: string,
    body: BodyInit,
    mimeType?: string,
    signal?: AbortSignal,
  ): Promise<Attachment> {
    const attachment = await this.loadAttachment(attachmentId, {})
    await this.ensureAttachmentContainer(signal)
    const contentType = mimeType || attachment.mime_type
    const blob = await bodyToLimitedBlob(body, contentType, signal)
    const response = await this.authFetch(this.attachmentUrl(attachmentId), {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob,
      signal,
    })
    if (!response.ok) {
      throw new Error(`Attachment upload failed: ${response.status} ${response.statusText}`)
    }

    const objectUrl = URL.createObjectURL(blob)
    const previousObjectUrl = this.attachmentObjectUrls.get(attachmentId)
    if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl)
    this.attachmentObjectUrls.set(attachmentId, objectUrl)
    const uploaded = {
      ...attachment,
      ...(attachment.type === 'image' ? { preview_url: objectUrl } : {}),
      download_url: objectUrl,
      upload_descriptor: null,
    }
    this.attachments.set(attachmentId, uploaded)
    return uploaded
  }

  async saveAttachment(attachment: Attachment, _context: StoreContext): Promise<void> {
    this.rememberAttachment(attachment)
  }

  async loadAttachment(attachmentId: string, _context: StoreContext): Promise<Attachment> {
    const attachment = this.attachments.get(attachmentId)
    if (!attachment) throw new Error(`Attachment not found: ${attachmentId}`)
    return attachment
  }

  async readAttachmentBytes(attachmentId: string): Promise<Uint8Array> {
    const response = await this.authFetch(this.attachmentUrl(attachmentId))
    if (!response.ok) {
      throw new Error(`Attachment download failed: ${response.status} ${response.statusText}`)
    }
    return readLimitedResponseBytes(response)
  }

  async deleteAttachment(attachmentId: string, _context: StoreContext): Promise<void> {
    const response = await this.authFetch(this.attachmentUrl(attachmentId), { method: 'DELETE' })
    if (!response.ok && response.status !== 404) {
      throw new Error(`Attachment delete failed: ${response.status} ${response.statusText}`)
    }
    const objectUrl = this.attachmentObjectUrls.get(attachmentId)
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    this.attachmentObjectUrls.delete(attachmentId)
    this.attachments.delete(attachmentId)
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
