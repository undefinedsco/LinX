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
import { requireRowResourceId } from '@/lib/data/resource-identity'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { deleteExactRecord, updateExactRecord } from '@/lib/data/exact-records'
import { appendChatReconcilerMetadata, reconcileChatAppend } from '@linx/agent-runtime/chat-reconciler'
import { normalizeClientToolCallItem } from './tool-call-protocol'

const DEFAULT_CHAT_ID = 'default'
const POD_QUERY_TIMEOUT_MS = 15000
const CHATKIT_ITEM_ID_METADATA_KEY = 'chatkitItemId'
const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z\d+.-]*:/

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
    metadata: { chat_id: chatId, ...(extra ?? {}) },
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
  // In-memory caches (per-instance, not per-context)
  private threadChatIdCache = new Map<string, string>()
  private threadMetadataCache = new Map<string, ThreadMetadata>()
  private provisionalThreadIds = new Set<string>()
  private threadItemsCache = new Map<string, ThreadItem[]>()
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

  private async selectMessagesForThread(threadId: string): Promise<any[]> {
    const chatId = await this.getThreadChatId(threadId)
    const normalizedThreadId = extractThreadId(threadId) ?? threadId
    const thread = this.buildThreadUri(chatId, normalizedThreadId)
    const messages = await withTimeout(
      this.db.select().from(Message).where({ thread }).limit(1000).execute(),
      POD_QUERY_TIMEOUT_MS,
      `Timed out loading messages for thread ${threadId}`,
    )

    return messages.filter((message: any) => (
      extractChatId(message.chat) === chatId
      && extractThreadId(message.thread) === normalizedThreadId
      && !isHiddenMatrixProtocolEvent(message)
    ))
  }

  private getCachedThreadItems(threadId: string): ThreadItem[] | null {
    const cached = this.threadItemsCache.get(threadId)
    return cached ? [...cached] : null
  }

  private upsertCachedThreadItem(threadId: string, item: ThreadItem): void {
    const cached = this.threadItemsCache.get(threadId) ?? []
    const index = cached.findIndex((entry) => entry.id === item.id)
    if (index === -1) {
      const next = [...cached, item]
      this.threadItemsCache.set(threadId, next)
      this.onThreadItemsChange?.([...next])
      return
    }

    const next = [...cached]
    next[index] = item
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
    this.messageRowIdByItemId.set(itemId, requireRecordId(row, 'Message row'))
  }

  private async findMessageByItemId(threadId: string, itemId: string): Promise<Record<string, unknown> | null> {
    const cachedRowId = this.messageRowIdByItemId.get(itemId)
    if (cachedRowId) {
      const row = await (this.db as any).findById(Message as any, cachedRowId)
      if (row) return row
      this.messageRowIdByItemId.delete(itemId)
    }

    const messages = await this.selectMessagesForThread(threadId)
    const row = messages.find((message: any) => messageRecordMatchesItem(message, itemId)) ?? null
    if (row) {
      this.cacheMessageRow(itemId, row)
    }
    return row
  }

  private resolveMessageIri(row: Record<string, unknown>): string {
    return this.resolveRowIri(Message, row)
  }

  private pageThreadItems(
    items: ThreadItem[],
    after: string | undefined,
    limit: number,
    order: string,
  ): Page<ThreadItem> {
    const sorted = [...items].sort((a: any, b: any) => {
      const aTime = typeof a.created_at === 'number' ? a.created_at : 0
      const bTime = typeof b.created_at === 'number' ? b.created_at : 0
      return order === 'desc' ? bTime - aTime : aTime - bTime
    })

    let startIndex = 0
    if (after) {
      const idx = sorted.findIndex((item) => item.id === after)
      if (idx !== -1) startIndex = idx + 1
    }
    const slice = sorted.slice(startIndex, startIndex + limit)
    return {
      data: slice,
      has_more: startIndex + limit < sorted.length,
      first_id: slice.length > 0 ? slice[0]?.id : undefined,
      last_id: slice.length > 0 ? slice[slice.length - 1]?.id : undefined,
    }
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
      for (const message of messages) {
        await this.deleteMessageRecord(message)
      }
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
    try {
      const cachedItems = this.getCachedThreadItems(threadId)
      if (cachedItems) {
        this.onThreadItemsChange?.([...cachedItems])
        return this.pageThreadItems(cachedItems, after, limit, order)
      }

      const messages = await this.selectMessagesForThread(threadId)

      messages.sort((a: any, b: any) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return order === 'desc' ? bTime - aTime : aTime - bTime
      })

      const data = await Promise.all(messages.map(async (message: any) => (
        this.hydrateItemAttachments(messageRecordToItem(message, threadId))
      )))
      this.threadItemsCache.set(threadId, data)
      this.emitThreadAttachments(data)
      this.onThreadItemsChange?.(data)
      return this.pageThreadItems(data, after, limit, order)
    } catch (error) {
      console.error('[LocalStore] Failed to load thread items:', error)
      return { data: [], has_more: false }
    }
  }

  async refreshThreadItems(threadId: string, context: StoreContext): Promise<void> {
    this.threadItemsCache.delete(threadId)
    await this.loadThreadItems(threadId, undefined, 1000, 'asc', context)
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
    const metadata = buildChatKitMessageReconcilerMetadata({
      db: this.db,
      chat,
      thread,
      messageId,
      role: reconcilerRole,
      content,
      maker,
      createdAt,
      existingMetadata: {
        [CHATKIT_ITEM_ID_METADATA_KEY]: item.id,
      },
    })

    await withTimeout(
      (this.db as any).insert(Message as any).values({
        id: messageId,
        scope: chat,
        parent: chat,
        chat,
        thread,
        maker,
        role,
        content,
        richContent: richContent ?? undefined,
        metadata,
        status: status ?? undefined,
        createdAt,
      }).execute(),
      POD_QUERY_TIMEOUT_MS,
      `Timed out saving message ${item.id}`,
    )
    if (typeof this.db.resolveRowIri !== 'function' && typeof this.db.findById === 'function') {
      await this.db.findById(Message as any, messageId)
    }
    this.messageRowIdByItemId.set(item.id, messageId)
    this.recentlyCreatedIds.add(item.id)
    this.upsertCachedThreadItem(threadId, item)
    if (item.type === 'user_message' || (item.type === 'assistant_message' && status !== 'in_progress')) {
      await this.updateChatSummary(chatId, messageId, content, createdAt)
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
        await this.updateChatSummary(chatId, rowId, content, new Date(item.created_at * 1000))
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
          await this.updateChatSummary(chatId, rowId, content, new Date(item.created_at * 1000))
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
        await this.updateChatSummary(chatId, requireRecordId(existing, 'Message row'), content, new Date(item.created_at * 1000))
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
      insertTriples.push(`<${messageIri}> <${UDFS.messageStatus}> "${status}" .`)
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

    await this.deleteMessageRecord(message)
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
    const remembered = {
      ...attachment,
      pod_url: attachment.pod_url || this.attachmentUrl(attachment.id),
    }
    this.attachments.set(remembered.id, remembered)
    return remembered
  }

  private async hydrateItemAttachments(item: ThreadItem): Promise<ThreadItem> {
    if (!Array.isArray((item as any).attachments) || (item as any).attachments.length === 0) return item

    const attachments = await Promise.all((item as any).attachments.map(async (raw: Attachment) => {
      const attachment = this.rememberAttachment(raw)

      try {
        const objectUrl = await this.getAttachmentObjectUrl(attachment)
        return {
          ...attachment,
          ...(attachment.type === 'image' ? { preview_url: objectUrl } : {}),
          download_url: objectUrl,
        }
      } catch (error) {
        console.warn(`[LocalStore] Failed to hydrate attachment ${attachment.id}:`, error)
        return attachment
      }
    }))
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

  private attachmentContainerUrl(): string {
    const podBaseUrl = requirePodBaseUrl(this.db).replace(/\/?$/, '/')
    return new URL('.data/chat-attachments/', podBaseUrl).toString()
  }

  private async ensureAttachmentContainer(): Promise<void> {
    const containerUrl = this.attachmentContainerUrl()
    const existing = await this.authFetch(containerUrl, { method: 'HEAD' })
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
    await this.ensureAttachmentContainer()
    const blob = await new Response(body).blob()
    const response = await this.authFetch(this.attachmentUrl(attachmentId), {
      method: 'PUT',
      headers: { 'Content-Type': mimeType || attachment.mime_type },
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
    const attachment = this.attachments.get(attachmentId)
    const response = await this.authFetch(attachment?.pod_url || this.attachmentUrl(attachmentId))
    if (!response.ok) {
      throw new Error(`Attachment download failed: ${response.status} ${response.statusText}`)
    }
    return new Uint8Array(await response.arrayBuffer())
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
