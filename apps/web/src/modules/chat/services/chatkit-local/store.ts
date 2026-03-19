/**
 * Local (Browser) ChatKit Store
 *
 * Implements the ChatKit store interface using the browser's drizzle-solid db
 * instance (which already carries session.fetch for DPoP auth).
 *
 * This replaces PodChatKitStore on the server — no API server round-trip needed.
 */

import { eq, and } from '@undefineds.co/drizzle-solid'
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
import { contactTable, resolveRowId, type SolidDatabase } from '@linx/models'

const DEFAULT_CHAT_ID = 'default'

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
  if (!chatIdOrUri) return DEFAULT_CHAT_ID
  if (chatIdOrUri.includes('#')) {
    const match = chatIdOrUri.match(/\.data\/chat\/([^/]+)\/index\.ttl#this/)
    if (match) return match[1]
  }
  return chatIdOrUri
}

function extractThreadId(threadIdOrUri: string | null | undefined): string | undefined {
  if (!threadIdOrUri) return undefined
  if (threadIdOrUri.includes('#')) {
    return threadIdOrUri.split('#').pop() || undefined
  }
  return threadIdOrUri
}

function getChatIdFromMetadata(metadata?: Record<string, unknown>): string {
  if (metadata && typeof metadata.chat_id === 'string') return metadata.chat_id
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

// ---------------------------------------------------------------------------
// Record → ChatKit type converters
// ---------------------------------------------------------------------------

function threadRecordToMetadata(record: any): ThreadMetadata {
  const chatId = extractChatId(record.chatId)
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

  const storedThreadItem = parseStoredThreadItem(record.richContent, threadId, createdAt)
    ?? parseStoredThreadItem(record.content, threadId, createdAt)
  if (storedThreadItem) {
    return storedThreadItem
  }

  if (record.role === MessageRole.USER) {
    return {
      id: record.id,
      thread_id: threadId,
      type: 'user_message',
      content: [{ type: 'input_text', text: record.content || '' }],
      attachments: [],
      created_at: createdAt,
    } as ThreadItem
  }
  return {
    id: record.id,
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

  constructor(db: SolidDatabase, webId: string, authFetch: typeof fetch) {
    this.db = db
    this.webId = webId
    this.authFetch = authFetch
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
    const existingChats = await this.db.select().from(Chat)
      .where(eq(Chat.id, chatId))
      .execute()
    if (existingChats.length === 0) {
      const now = new Date()
      await this.db.insert(Chat).values({
        id: chatId,
        title: chatId === DEFAULT_CHAT_ID ? 'Default Chat' : chatId,
        createdAt: now,
        updatedAt: now,
      }).execute()
    }
  }

  private async getThreadChatId(threadId: string): Promise<string> {
    const cached = this.threadChatIdCache.get(threadId)
    if (cached) return cached

    const threads = await this.db.select().from(Thread)
      .where(eq(Thread.id, threadId))
      .execute()
    if (threads.length === 0) return DEFAULT_CHAT_ID

    const chatId = extractChatId((threads[0] as any).chatId)
    this.threadChatIdCache.set(threadId, chatId)
    return chatId
  }

  private getPodBaseUrl(): string {
    return this.webId.replace('/profile/card#me', '').replace(/\/$/, '')
  }

  private buildThreadUri(chatId: string, threadId: string): string {
    return `${this.getPodBaseUrl()}/.data/chat/${chatId}/index.ttl#${threadId}`
  }

  private async resolveCounterpartMaker(chatId: string): Promise<string> {
    const chats = await this.db.select().from(Chat)
      .where(eq(Chat.id, chatId))
      .execute()
    const chat = chats[0] as any
    const participants = Array.isArray(chat?.participants)
      ? chat.participants.filter((participant: unknown): participant is string => typeof participant === 'string' && participant.length > 0)
      : []

    const participantRef = participants.find((participant: string) => participant !== this.webId) ?? participants[0]
    if (!participantRef) {
      return this.webId
    }

    const contacts = await this.db.select().from(contactTable).execute()
    const contact = contacts.find((entry: any) => (
      entry.entityUri === participantRef
      || resolveRowId(entry) === participantRef
      || entry.id === participantRef
    )) as { entityUri?: string | null } | undefined

    return contact?.entityUri || participantRef
  }

  private async selectMessagesForThread(threadId: string): Promise<any[]> {
    const chatId = await this.getThreadChatId(threadId)
    const messages = await this.db.select().from(Message).execute()

    return messages.filter((message: any) => (
      extractChatId(message.chat) === chatId
      && extractThreadId(message.thread) === threadId
    ))
  }

  private async deleteMessageRecord(message: any): Promise<void> {
    await this.db.delete(Message).where(
      and(
        eq(Message.id, message.id),
        eq((Message as any).chat, message.chat),
        eq(Message.createdAt, message.createdAt),
      ),
    ).execute()
  }

  // -----------------------------------------------------------------------
  // Thread operations
  // -----------------------------------------------------------------------

  async loadThread(threadId: string, _context: StoreContext): Promise<ThreadMetadata> {
    const cached = this.threadMetadataCache.get(threadId)
    if (cached) return cached

    const threads = await this.db.select().from(Thread)
      .where(eq(Thread.id, threadId))
      .execute()
    if (threads.length === 0) throw new Error(`Thread not found: ${threadId}`)

    const metadata = threadRecordToMetadata(threads[0])
    this.threadMetadataCache.set(threadId, metadata)
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

    const existingThreads = await this.db.select().from(Thread)
      .where(eq(Thread.id, thread.id))
      .execute()

    if (existingThreads.length > 0) {
      await this.db.update(Thread).set({
        title: thread.title || undefined,
        status: statusToString(thread.status),
        metadata: metadataValue,
        updatedAt: now,
      }).where(eq(Thread.id, thread.id)).execute()
    } else {
      await this.db.insert(Thread).values({
        id: thread.id,
        chatId,
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
      const slice = threads.slice(startIndex, startIndex + limit)
      return {
        data: slice.map((t: any) => threadRecordToMetadata(t)),
        has_more: startIndex + limit < threads.length,
        after: slice.length > 0 ? (slice[slice.length - 1] as any).id : undefined,
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
        const threads = await this.db.select().from(Thread)
          .where(eq(Thread.id, threadId))
          .execute()
        if (threads.length > 0) {
          chatId = extractChatId((threads[0] as any).chatId)
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
      if (chatId) {
        await this.db.delete(Thread)
          .where(and(eq(Thread.id, threadId), eq(Thread.chatId, chatId)))
          .execute()
      } else {
        await this.db.delete(Thread).where(eq(Thread.id, threadId)).execute()
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
      const messages = await this.selectMessagesForThread(threadId)

      messages.sort((a: any, b: any) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return order === 'desc' ? bTime - aTime : aTime - bTime
      })

      let startIndex = 0
      if (after) {
        const idx = messages.findIndex((m: any) => m.id === after)
        if (idx !== -1) startIndex = idx + 1
      }
      const slice = messages.slice(startIndex, startIndex + limit)
      return {
        data: slice.map((m: any) => messageRecordToItem(m, threadId)),
        has_more: startIndex + limit < messages.length,
        after: slice.length > 0 ? (slice[slice.length - 1] as any).id : undefined,
      }
    } catch (error) {
      console.error('[LocalStore] Failed to load thread items:', error)
      return { data: [], has_more: false }
    }
  }

  async addThreadItem(threadId: string, item: ThreadItem, _context: StoreContext): Promise<void> {
    const chatId = await this.getThreadChatId(threadId)
    const { content, role, status, richContent } = threadItemToMessageRecord(item)
    const podBaseUrl = this.getPodBaseUrl()
    const maker = role === MessageRole.USER
      ? this.webId
      : await this.resolveCounterpartMaker(chatId)

    await this.db.insert(Message).values({
      id: item.id,
      chat: `${podBaseUrl}/.data/chat/${chatId}/index.ttl#this`,
      thread: this.buildThreadUri(chatId, threadId),
      maker,
      role,
      content,
      richContent: richContent ?? undefined,
      status: status ?? undefined,
      createdAt: new Date(item.created_at * 1000),
    }).execute()

    this.recentlyCreatedIds.add(item.id)
  }

  async saveItem(threadId: string, item: ThreadItem, _context: StoreContext): Promise<void> {
    const chatId = await this.getThreadChatId(threadId)
    const { content, status, richContent } = threadItemToMessageRecord(item)

    const createdAt = item.created_at
      ? new Date(item.created_at * 1000).toISOString()
      : undefined

    // For recently created messages, use direct SPARQL PATCH to avoid drizzle-solid UPDATE bug
    if (this.recentlyCreatedIds.has(item.id)) {
      this.recentlyCreatedIds.delete(item.id)
      await this.directPatchMessage(chatId, item.id, content, richContent, status, createdAt)
      return
    }

    const existingItems = await this.db.select().from(Message)
      .where(eq(Message.id, item.id))
      .execute()
    const existing = existingItems.length > 0 ? existingItems[0] : null

    if (existing) {
      const existingCreatedAt = (existing as any).createdAt
        ? (typeof (existing as any).createdAt === 'string'
          ? (existing as any).createdAt
          : String((existing as any).createdAt))
        : undefined
      await this.directPatchMessage(chatId, item.id, content, richContent, status, existingCreatedAt)
    } else {
      await this.addThreadItem(threadId, item, _context)
    }
  }

  /**
   * Direct SPARQL UPDATE PATCH to update message content.
   * Avoids drizzle-solid UPDATE bug (same approach as PodChatKitStore).
   */
  private async directPatchMessage(
    chatId: string,
    messageId: string,
    content: string,
    richContent: string | null,
    status: string | null,
    createdAt?: string,
  ): Promise<void> {
    // The db instance already carries session.fetch with DPoP auth.
    // Build resource URL from webId.
    const dateForPath = createdAt ? new Date(createdAt) : new Date()
    const yyyy = dateForPath.getUTCFullYear()
    const mm = String(dateForPath.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(dateForPath.getUTCDate()).padStart(2, '0')
    const podBaseUrl = this.getPodBaseUrl()
    const resourceUrl = `${podBaseUrl}/.data/chat/${chatId}/${yyyy}/${mm}/${dd}/messages.ttl`
    const subjectUri = `${resourceUrl}#${messageId}`

    const escapeForSparql = (value: string): string => {
      const hasQuotes = value.includes('"')
      const hasNewlines = value.includes('\n') || value.includes('\r')
      if (hasQuotes || hasNewlines) {
        let escaped = value
        escaped = escaped.replace(/"""/g, '"\\"\\""')
        if (escaped.endsWith('"')) {
          const match = escaped.match(/"*$/)
          const trailingQuotes = match ? match[0].length : 0
          if (trailingQuotes > 0) {
            escaped = escaped.slice(0, -trailingQuotes) + '\\"'.repeat(trailingQuotes)
          }
        }
        return `"""${escaped}"""`
      }
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    }

    const deleteTriples = [
      `<${subjectUri}> <http://rdfs.org/sioc/ns#content> ?oldContent .`,
      `<${subjectUri}> <http://rdfs.org/sioc/ns#richContent> ?oldRichContent .`,
      `<${subjectUri}> <https://undefineds.co/ns#status> ?oldStatus .`,
    ]
    const insertTriples = [
      `<${subjectUri}> <http://rdfs.org/sioc/ns#content> ${escapeForSparql(content)} .`,
    ]
    const wherePatterns = [
      `OPTIONAL { <${subjectUri}> <http://rdfs.org/sioc/ns#content> ?oldContent . }`,
      `OPTIONAL { <${subjectUri}> <http://rdfs.org/sioc/ns#richContent> ?oldRichContent . }`,
      `OPTIONAL { <${subjectUri}> <https://undefineds.co/ns#status> ?oldStatus . }`,
    ]

    if (richContent !== null) {
      insertTriples.push(`<${subjectUri}> <http://rdfs.org/sioc/ns#richContent> ${escapeForSparql(richContent)} .`)
    }

    if (status) {
      insertTriples.push(`<${subjectUri}> <https://undefineds.co/ns#status> "${status}" .`)
    }

    const sparql = `
DELETE { ${deleteTriples.join(' ')} }
INSERT { ${insertTriples.join(' ')} }
WHERE { ${wherePatterns.join(' ')} }
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
    const messages = (await this.selectMessagesForThread(threadId))
      .filter((message: any) => message.id === itemId)
    if (messages.length === 0) throw new Error(`Item not found: ${itemId}`)
    return messageRecordToItem(messages[0], threadId)
  }

  async deleteThreadItem(threadId: string, itemId: string, _context: StoreContext): Promise<void> {
    const messages = await this.selectMessagesForThread(threadId)
    const message = messages.find((entry: any) => entry.id === itemId)
    if (!message) {
      return
    }

    await this.deleteMessageRecord(message)
  }

  // -----------------------------------------------------------------------
  // Attachment stubs
  // -----------------------------------------------------------------------

  async saveAttachment(_attachment: Attachment, _context: StoreContext): Promise<void> {
    // no-op for now
  }

  async loadAttachment(attachmentId: string, _context: StoreContext): Promise<Attachment> {
    throw new Error(`Attachment not found: ${attachmentId}`)
  }

  async deleteAttachment(_attachmentId: string, _context: StoreContext): Promise<void> {
    // no-op
  }
}
