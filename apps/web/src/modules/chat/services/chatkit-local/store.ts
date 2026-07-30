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
import {
  getDatetime,
  getSolidDataset,
  getStringNoLocale,
  getThing,
  getUrl,
  getUrlAll,
} from '@inrupt/solid-client'
import { requireRowResourceId } from '@/lib/data/resource-identity'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { deleteExactRecord, updateExactRecord } from '@/lib/data/exact-records'
import { appendChatReconcilerMetadata, reconcileChatAppend } from '@linx/agent-runtime/chat-reconciler'
import { queryMessageRowsForChat } from '../../message-query'

const DEFAULT_CHAT_ID = 'default'
const POD_QUERY_TIMEOUT_MS = 15000
const CHATKIT_ITEM_ID_METADATA_KEY = 'chatkitItemId'
const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z\d+.-]*:/
const SIOC_HAS_MEMBER = 'http://rdfs.org/sioc/ns#has_member'
const SIOC_CONTENT = 'http://rdfs.org/sioc/ns#content'
const DCT_CREATED = 'http://purl.org/dc/terms/created'
const UDFS_MESSAGE_TYPE = 'https://undefineds.co/ns#messageType'
const UDFS_MESSAGE_STATUS = 'https://undefineds.co/ns#messageStatus'
const UDFS_METADATA = 'https://undefineds.co/ns#metadata'
const UDFS_CHATKIT_ITEM_ID = 'https://undefineds.co/ns#chatkitItemId'

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

function extractChatIdFromDurableThreadId(threadId: string): string | null {
  const match = /^chat\/(.+)\/index\.ttl#/.exec(threadId)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function getChatIdFromMetadata(metadata?: Record<string, unknown>): string {
  if (metadata && typeof metadata.chat_id === 'string') {
    return extractChatId(metadata.chat_id)
  }
  return DEFAULT_CHAT_ID
}

function parseThreadMetadata(metadata: unknown): Record<string, unknown> | undefined {
  if (!metadata) return undefined
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata) as Record<string, unknown> | null
      return parsed ?? undefined
    } catch {
      return undefined
    }
  }
  if (typeof metadata === 'object') {
    return metadata as Record<string, unknown>
  }
  return undefined
}

function resourceUrlFromIri(iri: string): string {
  const hashIndex = iri.indexOf('#')
  return hashIndex >= 0 ? iri.slice(0, hashIndex) : iri
}

function readBindingIri(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (
    value
    && typeof value === 'object'
    && 'value' in value
    && typeof (value as { value?: unknown }).value === 'string'
  ) {
    return (value as { value: string }).value
  }
  return null
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
  return readChatKitItemId(record) === itemId
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
  // ChatKit receives the durable base-relative resource id from the Web store.
  // Resolve it directly before considering collection queries; otherwise a
  // reload turns one exact lookup into a Pod-wide Thread scan.
  if (threadId.includes('/') && threadId.includes('#')) {
    const direct = await (db as any).findById(Thread as any, threadId)
    if (direct) return direct
    const durableChatId = extractChatIdFromDurableThreadId(threadId)
    const logicalThreadId = extractThreadId(threadId)
    if (durableChatId && logicalThreadId) {
      const legacy = await findLegacyThreadRecord(db, durableChatId, logicalThreadId)
      if (legacy) return legacy
    }
  }

  if (chatId) {
    const exactId = threadRepository.idForChat(chatId, threadId)
    const exact = await (db as any).findById(Thread as any, exactId)
    if (exact) return exact
    const legacy = await findLegacyThreadRecord(db, chatId, extractThreadId(threadId) ?? threadId)
    if (legacy) return legacy
  }

  // A logical Thread id such as "__default__" is only unique inside its Chat.
  // Never fall back to an unscoped collection scan: xpod query endpoints can
  // expose subjects from multiple Pods, and selecting the first matching short
  // id may dereference another account's protected resource.
  return null
}

async function findLegacyThreadRecord(
  db: SolidDatabase<any>,
  chatId: string,
  threadId: string,
): Promise<Record<string, unknown> | null> {
  const dialect = (db as any).getDialect?.()
  const executeOnResource = dialect?.executeOnResource
  if (typeof executeOnResource !== 'function') return null

  const threadIri = threadRepository.iriForChat(requirePodBaseUrl(db), chatId, threadId)
  const rows = await executeOnResource.call(
    dialect,
    resourceUrlFromIri(threadIri),
    {
      type: 'SELECT',
      query: `SELECT ?type WHERE { <${threadIri}> a ?type . } LIMIT 1`,
      prefixes: {},
    },
  ) as unknown[]
  if (rows.length === 0) return null

  const now = new Date()
  return {
    id: threadRepository.idForChat(chatId, threadId),
    parent: buildChatIri(db, chatId),
    title: '默认话题',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
}

// ---------------------------------------------------------------------------
// Record → ChatKit type converters
// ---------------------------------------------------------------------------

function threadRecordToMetadata(record: any): ThreadMetadata {
  const chatId = threadRepository.chatId(record) ?? DEFAULT_CHAT_ID
  const extra = parseThreadMetadata(record.metadata)
  const threadId = extractThreadId(record.id) ?? record.id
  return {
    id: threadId,
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
    const parsed = JSON.parse(value) as Partial<ThreadItem> | null
    if (!parsed || parsed.type !== 'client_tool_call' || typeof (parsed as any).call_id !== 'string') {
      return null
    }

    return {
      ...parsed,
      thread_id: typeof parsed.thread_id === 'string' ? parsed.thread_id : fallbackThreadId,
      created_at: typeof parsed.created_at === 'number' ? parsed.created_at : fallbackCreatedAt,
    } as ThreadItem
  } catch {
    return null
  }
}

function threadItemToMessageRecord(item: ThreadItem): {
  content: string
  role: string
  status: string | null
  richContent: string | null
} {
  if (item.type === 'user_message') {
    return {
      content: (item as any).content
        .filter((contentPart: any) => contentPart.type === 'input_text')
        .map((contentPart: any) => contentPart.text)
        .join('\n'),
      role: MessageRole.USER,
      status: null,
      richContent: null,
    }
  }

  if (item.type === 'assistant_message') {
    return {
      content: (item as any).content
        .filter((contentPart: any) => contentPart.type === 'output_text')
        .map((contentPart: any) => contentPart.text)
        .join('\n'),
      role: MessageRole.ASSISTANT,
      status: (item as any).status || MessageStatus.COMPLETED,
      richContent: null,
    }
  }

  return {
    content: item.type === 'client_tool_call' ? (item as any).name || item.type : JSON.stringify(item),
    role: MessageRole.SYSTEM,
    status: typeof (item as any).status === 'string' ? (item as any).status : null,
    richContent: JSON.stringify(item),
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

// ---------------------------------------------------------------------------
// LocalChatKitStore
// ---------------------------------------------------------------------------

export class LocalChatKitStore implements ChatKitStore<StoreContext> {
  private db: SolidDatabase
  private webId: string
  private authFetch: typeof fetch
  private recentlyCreatedIds = new Set<string>()
  // In-memory caches (per-instance, not per-context)
  private threadChatIdCache = new Map<string, string>()
  private threadMetadataCache = new Map<string, ThreadMetadata>()
  private threadItemsCache = new Map<string, ThreadItem[]>()
  private messageRowIdByItemId = new Map<string, string>()
  private messageIriByItemId = new Map<string, string>()
  private attachmentCache = new Map<string, Attachment>()

  constructor(db: SolidDatabase, webId: string, authFetch: typeof fetch) {
    this.db = db
    this.webId = webId
    this.authFetch = authFetch
  }

  bindThreadToChat(threadId: string, chatId: string): void {
    if (!threadId || !chatId) return
    this.threadChatIdCache.set(threadId, extractChatIdFromChatRef(chatId) ?? chatId)
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
    const chatRef = this.buildChatUri(chatId)
    const threadRef = this.buildThreadUri(chatId, threadId)
    const threadKey = extractThreadId(threadId) ?? threadId
    try {
      const exactMembers = await this.loadExactThreadMembers(chatRef, threadRef)
      if (exactMembers.length > 0) {
        return exactMembers.filter((message: any) => !isHiddenMatrixProtocolEvent(message))
      }
    } catch (error) {
      // Legacy Thread indexes can be incomplete or use a representation that
      // the Solid dataset parser rejects. Their date-sharded Message resources
      // remain queryable through the Chat collection endpoint.
      console.warn('[LocalStore] Exact Thread member lookup failed; using scoped query:', error)
    }
    const messages = await withTimeout(
      queryMessageRowsForChat(this.db, chatRef, threadRef),
      POD_QUERY_TIMEOUT_MS,
      `Timed out loading messages for thread ${threadId}`,
    )

    return messages.filter((message: any) => (
      extractChatId(message.chat) === chatId
      && extractThreadId(message.thread) === threadKey
      && !isHiddenMatrixProtocolEvent(message)
    ))
  }

  private async loadExactThreadMembers(chatRef: string, threadRef: string): Promise<any[]> {
    const noStoreFetch: typeof fetch = (input, init) => this.authFetch(input, {
      ...init,
      cache: 'no-store',
    })
    const dialect = (this.db as any).getDialect?.()
    const executeOnResource = dialect?.executeOnResource
    const podUrl = dialect?.getPodUrl?.()
    const sparqlEndpoint = typeof podUrl === 'string'
      ? new URL('.data/chat/-/sparql', podUrl).toString()
      : null

    let messageIris: string[] = []
    if (typeof executeOnResource === 'function' && sparqlEndpoint) {
      const rows = await executeOnResource.call(
        dialect,
        sparqlEndpoint,
        {
          type: 'SELECT',
          query: `SELECT DISTINCT ?message WHERE {
            GRAPH ?graph { <${threadRef}> <${SIOC_HAS_MEMBER}> ?message . }
          }`,
          prefixes: {},
        },
        { mode: 'sparql', endpoint: sparqlEndpoint },
      ) as Array<{ message?: unknown }>
      messageIris = rows
        .map((row) => readBindingIri(row.message))
        .filter((iri): iri is string => Boolean(iri))
    }

    if (messageIris.length === 0) {
      const dataset = await getSolidDataset(resourceUrlFromIri(threadRef), {
        fetch: noStoreFetch,
      })
      const threadThing = getThing(dataset, threadRef)
      messageIris = threadThing ? getUrlAll(threadThing, SIOC_HAS_MEMBER) : []
    }
    if (messageIris.length === 0) return []

    const datasets = new Map<string, Awaited<ReturnType<typeof getSolidDataset>>>()
    return (await Promise.all(messageIris.map(async (iri) => {
      const documentUrl = resourceUrlFromIri(iri)
      let dataset = datasets.get(documentUrl)
      if (!dataset) {
        dataset = await getSolidDataset(documentUrl, { fetch: noStoreFetch })
        datasets.set(documentUrl, dataset)
      }
      const messageThing = getThing(dataset, iri)
      if (!messageThing) return null
      const metadataIri = getUrl(messageThing, UDFS_METADATA)
      const metadataThing = metadataIri ? getThing(dataset, metadataIri) : null
      const itemId = metadataThing
        ? getStringNoLocale(metadataThing, UDFS_CHATKIT_ITEM_ID)
        : null
      const dataRoot = new URL('.data/', requirePodBaseUrl(this.db)).toString()
      const resourceId = iri.startsWith(dataRoot)
        ? iri.slice(dataRoot.length)
        : iri.slice(iri.lastIndexOf('/') + 1)
      const stableItemId = itemId || new URL(iri).hash.slice(1) || resourceId

      return {
        id: resourceId,
        parent: chatRef,
        chat: chatRef,
        thread: threadRef,
        role: getStringNoLocale(messageThing, UDFS_MESSAGE_TYPE) || MessageRole.ASSISTANT,
        content: getStringNoLocale(messageThing, SIOC_CONTENT) || '',
        status: getStringNoLocale(messageThing, UDFS_MESSAGE_STATUS) || MessageStatus.COMPLETED,
        createdAt: getDatetime(messageThing, DCT_CREATED) || new Date(),
        metadata: { [CHATKIT_ITEM_ID_METADATA_KEY]: stableItemId },
      }
    }))).filter((row): row is NonNullable<typeof row> => Boolean(row))
  }

  private getCachedThreadItems(threadId: string): ThreadItem[] | null {
    const cached = this.threadItemsCache.get(threadId)
    return cached ? [...cached] : null
  }

  private upsertCachedThreadItem(threadId: string, item: ThreadItem): void {
    const cached = this.threadItemsCache.get(threadId) ?? []
    const index = cached.findIndex((entry) => entry.id === item.id)
    if (index === -1) {
      this.threadItemsCache.set(threadId, [...cached, item])
      return
    }

    const next = [...cached]
    next[index] = item
    this.threadItemsCache.set(threadId, next)
  }

  private removeCachedThreadItem(threadId: string, itemId: string): void {
    const cached = this.threadItemsCache.get(threadId)
    if (!cached) return
    const next = cached.filter((item) => item.id !== itemId)
    if (next.length === 0) {
      this.threadItemsCache.delete(threadId)
      return
    }
    this.threadItemsCache.set(threadId, next)
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
    this.messageIriByItemId.set(itemId, this.resolveMessageIri(row))
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
    if (cached) return cached

    const thread = await findThreadRecord(this.db, threadId, this.threadChatIdCache.get(threadId))
    if (!thread) throw new Error(`Thread not found: ${threadId}`)

    const metadata = threadRecordToMetadata(thread)
    const chatId = extractChatIdFromDurableThreadId(threadId)
      ?? getChatIdFromMetadata(metadata.metadata)
    // ChatKit reloads a durable `chat/{chat}/index.ttl#{thread}` id, then uses
    // the logical `{thread}` id for later item requests. Preserve both aliases
    // so duplicate logical ids in different chats never fall back to `default`.
    this.threadChatIdCache.set(threadId, chatId)
    this.threadChatIdCache.set(metadata.id, chatId)
    this.threadMetadataCache.set(threadId, metadata)
    this.threadMetadataCache.set(metadata.id, metadata)
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
        return this.pageThreadItems(cachedItems, after, limit, order)
      }

      const messages = await this.selectMessagesForThread(threadId)

      messages.sort((a: any, b: any) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return order === 'desc' ? bTime - aTime : aTime - bTime
      })

      const threadItems = messages.map((message: any) => messageRecordToItem(message, threadId))
      this.threadItemsCache.set(threadId, threadItems)

      let startIndex = 0
      if (after) {
        const idx = threadItems.findIndex((item) => item.id === after)
        if (idx !== -1) startIndex = idx + 1
      }
      const slice = threadItems.slice(startIndex, startIndex + limit)
      return {
        data: slice,
        has_more: startIndex + limit < threadItems.length,
        first_id: slice.length > 0 ? (slice[0] as any).id : undefined,
        last_id: slice.length > 0 ? (slice[slice.length - 1] as any).id : undefined,
      }
    } catch (error) {
      console.error('[LocalStore] Failed to load thread items:', error)
      return { data: [], has_more: false }
    }
  }

  async addThreadItem(threadId: string, item: ThreadItem, _context: StoreContext): Promise<void> {
    const chatId = await this.getThreadChatId(threadId)
    const { content, role, status, richContent } = threadItemToMessageRecord(item)
    const createdAt = new Date(item.created_at * 1000)
    const thread = this.buildThreadUri(chatId, threadId)
    const messageId = this.buildMessageId(chatId, thread, item.id, createdAt)
    const messageIri = messageResource.buildIri(requirePodBaseUrl(this.db), {
      id: messageId,
      parent: this.buildChatUri(chatId),
      chat: this.buildChatUri(chatId),
      thread,
      createdAt,
    })
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

    await (this.db as any).insert(Message as any).values({
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
    }).execute()

    // The resource identity is deterministic from the inserted row. Keep it
    // instead of reading the row back: a stream normally calls saveItem right
    // after addThreadItem, and that read can degrade into a broad SPARQL scan.
    this.messageRowIdByItemId.set(item.id, messageId)
    this.messageIriByItemId.set(item.id, messageIri)
    this.recentlyCreatedIds.add(item.id)
    this.upsertCachedThreadItem(threadId, item)
  }

  async saveItem(threadId: string, item: ThreadItem, _context: StoreContext): Promise<void> {
    const { content, status, richContent } = threadItemToMessageRecord(item)

    const cachedItem = this.getCachedThreadItems(threadId)?.find((entry) => entry.id === item.id)

    // For recently created or in-memory messages, patch the known resource directly
    // instead of issuing a broad message SELECT during the active stream.
    if (this.recentlyCreatedIds.has(item.id) || cachedItem) {
      this.recentlyCreatedIds.delete(item.id)
      const cachedMessageIri = this.messageIriByItemId.get(item.id)
      if (cachedMessageIri) {
        await this.directPatchMessage(cachedMessageIri, content, richContent, status)
        this.upsertCachedThreadItem(threadId, item)
        return
      }
      const row = await this.findMessageByItemId(threadId, item.id)
      if (!row) throw new Error(`Cannot find Pod message row for ChatKit item ${item.id}`)
      const messageIri = this.resolveMessageIri(row)
      await this.directPatchMessage(messageIri, content, richContent, status)
      this.upsertCachedThreadItem(threadId, item)
      return
    }

    const existing = await this.findMessageByItemId(threadId, item.id)

    if (existing) {
      const messageIri = this.resolveMessageIri(existing)
      await this.directPatchMessage(messageIri, content, richContent, status)
      this.upsertCachedThreadItem(threadId, item)
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

    const escapeForSparql = (value: string): string => {
      // JSON string escaping is compatible with SPARQL short string literals
      // and keeps physical newlines out of xpod's statement splitter.
      return JSON.stringify(value)
    }

    const deleteTriples = [
      `<${messageIri}> <http://rdfs.org/sioc/ns#content> ?oldContent .`,
      `<${messageIri}> <http://rdfs.org/sioc/ns#richContent> ?oldRichContent .`,
      `<${messageIri}> <${UDFS.messageStatus}> ?oldStatus .`,
    ]
    const insertTriples = [
      `<${messageIri}> <http://rdfs.org/sioc/ns#content> ${escapeForSparql(content)} .`,
    ]
    const wherePatterns = [
      `<${messageIri}> ?existingPredicate ?existingObject .`,
      `OPTIONAL { <${messageIri}> <http://rdfs.org/sioc/ns#content> ?oldContent . }`,
      `OPTIONAL { <${messageIri}> <http://rdfs.org/sioc/ns#richContent> ?oldRichContent . }`,
      `OPTIONAL { <${messageIri}> <${UDFS.messageStatus}> ?oldStatus . }`,
    ]

    if (richContent !== null) {
      insertTriples.push(`<${messageIri}> <http://rdfs.org/sioc/ns#richContent> ${escapeForSparql(richContent)} .`)
    }

    if (status) {
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
    return messageRecordToItem(message, threadId)
  }

  async deleteThreadItem(threadId: string, itemId: string, _context: StoreContext): Promise<void> {
    const message = await this.findMessageByItemId(threadId, itemId)
    if (!message) {
      return
    }

    await this.deleteMessageRecord(message)
    this.messageRowIdByItemId.delete(itemId)
    this.messageIriByItemId.delete(itemId)
    this.removeCachedThreadItem(threadId, itemId)
  }

  // -----------------------------------------------------------------------
  // Attachments are cached until their user message is persisted. The complete
  // attachment metadata (including the uploaded data URL) is then archived in
  // that message's richContent in the current Pod.
  // -----------------------------------------------------------------------

  async saveAttachment(attachment: Attachment, _context: StoreContext): Promise<void> {
    const id = String(attachment.id ?? attachment.attachment_id ?? '')
    if (!id) throw new Error('Attachment is missing id')
    this.attachmentCache.set(id, { ...attachment, id, attachment_id: id })
  }

  async loadAttachment(attachmentId: string, _context: StoreContext): Promise<Attachment> {
    const attachment = this.attachmentCache.get(attachmentId)
    if (!attachment) throw new Error(`Attachment not found: ${attachmentId}`)
    return attachment
  }

  async deleteAttachment(attachmentId: string, _context: StoreContext): Promise<void> {
    this.attachmentCache.delete(attachmentId)
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
