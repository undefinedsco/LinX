/**
 * Chat Module Collections
 * 
 * TanStack DB collections for Chat, Thread, and Message entities.
 * These collections provide reactive data management with Solid Pod persistence.
 * 
 * Includes `chatOps` for business logic that spans multiple collections.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getLiteral, getSolidDataset, getThing, getUrl, getUrlAll } from '@inrupt/solid-client'
import { findExactRecord, like, or, resolvePodBaseUrlFromDatabase, resolveRowSubject, updateExactRecord } from '@undefineds.co/drizzle-solid'
import {
  createLinxPodSyncScope,
  type LinxSyncOperationKind,
  type LinxSyncRunResult,
} from '@linx/agent-runtime/sync'
import {
  chatTable,
  threadTable,
  messageTable,
  agentTable,
  contactTable,
  aiConfigRepository,
  buildChatTargetRef,
  eq,
  extractChatIdFromChatRef,
  threadRepository,
  normalizeAIConfigProviderId,
  normalizeAIConfigResourceId,
  MEETING,
  UDFS,
  WF,
  type ChatRow,
  type ChatInsert,
  type ThreadRow,
  type ThreadInsert,
  type MessageRow,
  type MessageInsert,
  type AgentInsert,
  type AgentRow,
  type ContactInsert,
  type ContactRow,
} from '@undefineds.co/models'
import type { SolidDatabase } from '@undefineds.co/models'
import {
  isLocalWorkspaceUri,
  normalizeLocalWorkspacePath,
  parseWorkspaceIdFromContainerUri,
  resolveWorkspaceContainerUri,
  workspaceTable,
  type WorkspaceInsert,
  type WorkspaceKind,
  type WorkspaceRow,
} from '@/lib/data/workspace-model'
import { queryClient } from '@/providers/query-provider'
import { createPodCollection } from '@/lib/data/pod-collection'
import { favoriteHooks } from '@/modules/favorites/collections'
import { createAgentContactRecords, writeCollectionRow } from '@/lib/data/direct-chat-records'
import { getAgentProviderInfo } from '@/lib/agent-providers'
import { toStringArray } from '@/lib/utils'
import { ensureAgentHome } from './agent-home'

// ============================================================================
// Database Getter
// ============================================================================

let dbGetter: (() => SolidDatabase | null) | null = null
const threadChatIdCache = new Map<string, string>()
let linxWelcomeInFlight: Promise<LinxWelcomeResult | null> | null = null
const chatOpsSync = createLinxPodSyncScope({ source: 'app-chat-ops' })

export const LINX_DEFAULT_SECRETARY = {
  title: 'AI Secretary',
  provider: 'undefineds',
  model: 'undefineds/linx-lite',
  threadTitle: '默认话题',
  welcomeMessage: '你好，我是 LinX 的 AI Secretary。以后我会帮你整理信息、跟进任务，也可以直接陪你聊天。先请你给我取个名字吧。',
} as const

export interface LinxWelcomeResult {
  chatId: string
  threadId?: string
  created: boolean
}

type SecretaryMetadata = {
  linx?: {
    role?: string
    version?: number
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getSecretaryMetadata(metadata: unknown): SecretaryMetadata | null {
  if (!isRecord(metadata)) {
    return null
  }

  const linx = metadata.linx
  if (!isRecord(linx)) {
    return null
  }

  return {
    linx: {
      role: typeof linx.role === 'string' ? linx.role : undefined,
      version: typeof linx.version === 'number' ? linx.version : undefined,
    },
  }
}

function createSecretaryMetadata(existing?: unknown): Record<string, unknown> {
  const metadata = isRecord(existing) ? { ...existing } : {}
  const current = getSecretaryMetadata(metadata)

  metadata.linx = {
    ...(current?.linx ?? {}),
    role: 'secretary',
    version: 1,
  }

  return metadata
}

export function isLinxDefaultSecretaryChat(chat: Pick<ChatRow, 'title' | 'metadata'> | null | undefined): boolean {
  return chat?.title === LINX_DEFAULT_SECRETARY.title
    || getSecretaryMetadata(chat?.metadata)?.linx?.role === 'secretary'
}

export function setDatabaseGetter(getter: () => SolidDatabase | null) {
  dbGetter = getter
}

function getDb(): SolidDatabase | null {
  return dbGetter?.() ?? null
}

export function getChatOpsSyncResults(): LinxSyncRunResult[] {
  return chatOpsSync.getResults()
}

export function clearChatOpsSyncResults(): void {
  chatOpsSync.clearResults()
}

async function runChatOpsProjection<T>(
  input: {
    action: string
    kind: LinxSyncOperationKind
    chatId?: string
    threadId?: string
    messageId?: string
    agentId?: string
    contactId?: string
    workspaceId?: string
    chatUri?: string
    threadUri?: string
    messageUri?: string
    agentUri?: string
    contactUri?: string
    workspaceUri?: string
    role?: string
    metadata?: Record<string, unknown> | ((value: T) => Record<string, unknown>)
  },
  project: () => T | Promise<T>,
): Promise<T> {
  return chatOpsSync.run({
    action: input.action,
    kind: input.kind,
    description: `chat-ops:${input.action}`,
    subject: input.messageId
      ?? input.threadId
      ?? input.chatId
      ?? input.agentId
      ?? input.contactId
      ?? input.workspaceId,
    resourceBindings: (value) => ({
      chat: {
        uri: input.chatUri ?? readResultString(value, 'chatUri'),
        local: input.chatId ?? readResultString(value, 'id') ?? readResultString(value, 'chatId') ?? readResultString(value, 'localChat'),
      },
      thread: {
        uri: input.threadUri ?? readResultString(value, 'threadUri'),
        local: input.threadId ?? readResultString(value, 'threadId') ?? readResultString(value, 'localThread'),
      },
      message: {
        uri: input.messageUri ?? readResultString(value, 'messageUri'),
        local: input.messageId ?? readResultString(value, 'messageId') ?? readResultString(value, 'localMessage'),
      },
      agent: {
        uri: input.agentUri ?? readResultString(value, 'agentUri'),
        local: input.agentId ?? readResultString(value, 'agentId') ?? readResultString(value, 'localAgent'),
      },
      contact: {
        uri: input.contactUri ?? readResultString(value, 'contactUri'),
        local: input.contactId ?? readResultString(value, 'contactId') ?? readResultString(value, 'localContact'),
      },
      workspace: {
        uri: input.workspaceUri ?? readResultString(value, 'workspaceUri'),
        local: input.workspaceId ?? readResultString(value, 'workspaceId') ?? readResultString(value, 'localWorkspace'),
      },
    }),
    metadata: (value) => {
      const extraMetadata = typeof input.metadata === 'function'
        ? input.metadata(value)
        : input.metadata
      return {
        role: input.role,
        ...extraMetadata,
      }
    },
    task: project,
  })
}

function readResultString(value: unknown, key: string): string | undefined {
  return isRecord(value) && typeof value[key] === 'string' ? value[key] : undefined
}

function getCurrentWebId(db: SolidDatabase): string | null {
  const webId = (
    (db as any).getDialect?.()?.getWebId?.()
    ?? (db as any).getSession?.()?.info?.webId
    ?? (db as any).session?.info?.webId
  )
  return typeof webId === 'string' && webId.length > 0 ? webId : null
}

function normalizeParticipants(participants: unknown, selfWebId?: string | null): string[] {
  return Array.from(new Set(toStringArray(participants))).sort((left, right) => {
    if (selfWebId) {
      if (left === selfWebId && right !== selfWebId) return -1
      if (right === selfWebId && left !== selfWebId) return 1
    }
    return left.localeCompare(right)
  })
}

function hasHydratedChatMetadata(metadata: unknown): boolean {
  return isRecord(metadata)
    && (
      'memberRoles' in metadata
      || getSecretaryMetadata(metadata)?.linx?.role === 'secretary'
    )
}

function getCachedThreadChatId(threadId: string): string | null {
  return threadChatIdCache.get(threadId) ?? threadRepository.chatId(threadCollection.get(threadId)) ?? null
}

async function loadChatIdForThread(
  db: SolidDatabase,
  threadId: string | undefined,
  chatId?: string | null,
): Promise<string | null> {
  if (!threadId) return null
  if (chatId) return chatId

  const cachedChatId = getCachedThreadChatId(threadId)
  if (cachedChatId) {
    return cachedChatId
  }

  const row = await findExactRecord<ThreadRow>(db as any, threadTable as any, chatId
    ? threadRepository.targetForChat(chatId, threadId)
    : threadId)
  const rowChatId = threadRepository.chatId(row)
  if (!rowChatId) {
    return null
  }

  threadChatIdCache.set(threadId, rowChatId)
  if (row) {
    ;(threadCollection.utils as { writeUpsert?: (data: ThreadRow) => void }).writeUpsert?.(row)
  }
  return rowChatId
}

function extractLinkedEntityId(uri: string | null | undefined): string | null {
  if (!uri) return null
  if (uri.includes('#')) {
    const fragment = uri.split('#').pop() ?? null
    if (fragment && fragment !== 'this') return fragment
  }
  const match = uri.match(/\/\.data\/chat\/([^/]+)\/index\.ttl#this$/)
  if (match) return match[1] ?? null
  return uri
}

async function hydrateChatRows(db: SolidDatabase, rows: ChatRow[]): Promise<ChatRow[]> {
  const selfWebId = getCurrentWebId(db)
  const normalizedRows = rows.map((row) => {
    if (!Array.isArray(row.participants)) {
      return row
    }

    return {
      ...row,
      participants: normalizeParticipants(row.participants, selfWebId),
    }
  })

  const needsHydration = normalizedRows.filter(
    (row) => !Array.isArray(row.participants) || !hasHydratedChatMetadata(row.metadata),
  )
  if (needsHydration.length === 0) {
    return normalizedRows
  }

  const hydratedRowsById = new Map<string, Partial<ChatRow>>()

  await Promise.all(needsHydration.map(async (row) => {
    if (!row.id) return
    const subjectIri = chatTable.resolveIriForDatabase(db,  {
      id: extractChatIdFromChatRef(row.id) ?? row.id,
    })
    if (!subjectIri) return

    try {
      const sessionFetch = (
        (db as any).getDialect?.()?.getAuthenticatedFetch?.()
        ?? (db as any).getSession?.()?.fetch
      ) as typeof fetch | undefined
      if (!sessionFetch) return

      const resourceUrl = subjectIri.split('#')[0]
      const dataset = await getSolidDataset(resourceUrl, {
        fetch: sessionFetch,
      })
      const thing = getThing(dataset, subjectIri)
      if (!thing) return
      const nextRow: Partial<ChatRow> = {}
      const participants = normalizeParticipants(getUrlAll(thing, WF.participant), selfWebId)
      if (participants.length > 0) {
        nextRow.participants = participants
      }

      const metadataUrl = getUrl(thing, UDFS.metadata)
      if (metadataUrl) {
        const metadataThing = getThing(dataset, metadataUrl)
        const memberRolesLiteral = metadataThing
          ? getLiteral(metadataThing, UDFS.term('memberRoles'))
          : null
        if (memberRolesLiteral?.value) {
          try {
            nextRow.metadata = {
              ...(isRecord(row.metadata) ? row.metadata : {}),
              memberRoles: JSON.parse(memberRolesLiteral.value) as Record<string, 'owner' | 'admin' | 'member'>,
            }
          } catch (error) {
            console.warn('[chatOps] Failed to parse chat metadata:', row.id, error)
          }
        }
      }

      if (row.id && Object.keys(nextRow).length > 0) {
        hydratedRowsById.set(row.id, nextRow)
      }
    } catch (error) {
      console.warn('[chatOps] Failed to hydrate chat participants:', row.id, error)
    }
  }))

  return normalizedRows.map((row) => {
    const hydratedRow = row.id ? hydratedRowsById.get(row.id) : undefined
    if (!hydratedRow) return row
    return {
      ...row,
      ...hydratedRow,
    }
  })
}

async function ensureChatStateRow(db: SolidDatabase, chatId: string): Promise<ChatRow> {
  const cached = chatCollection.get(chatId)
  if (cached) {
    return cached
  }

  const located = await findExactRecord<ChatRow>(db as any, chatTable as any, {
    id: extractChatIdFromChatRef(chatId) ?? chatId,
  })
  if (located) {
    if (!chatCollection.isReady()) {
      await chatCollection.preload()
    }
    const [hydrated] = await hydrateChatRows(db, [located])
    const row = hydrated ?? located
    ;(chatCollection.utils as { writeUpsert?: (data: ChatRow) => void }).writeUpsert?.(row)
    return row
  }

  const rows = await chatCollection.fetch()
  const [row] = await hydrateChatRows(db, rows.filter((candidate) => (
    candidate.id === chatId || extractChatIdFromChatRef(candidate.id) === chatId
  )))

  if (!row) {
    throw new Error(`Chat ${chatId} was not found in the Pod`)
  }

  ;(chatCollection.utils as { writeUpsert?: (data: ChatRow) => void }).writeUpsert?.(row)
  return row
}

async function ensureThreadStateRow(db: SolidDatabase, threadId: string): Promise<ThreadRow> {
  const cached = threadCollection.get(threadId)
  if (cached) {
    return cached
  }

  const cachedChatId = getCachedThreadChatId(threadId)
  const row = await findExactRecord<ThreadRow>(db as any, threadTable as any, cachedChatId
    ? threadRepository.targetForChat(cachedChatId, threadId)
    : threadId)

  if (!row) {
    throw new Error(`Thread ${threadId} was not found in the Pod`)
  }

  const rowChatId = threadRepository.chatId(row)
  if (rowChatId) {
    threadChatIdCache.set(threadId, rowChatId)
  }
  ;(threadCollection.utils as { writeUpsert?: (data: ThreadRow) => void }).writeUpsert?.(row)
  return row
}

async function findChatRow(db: SolidDatabase, chatId: string | undefined): Promise<ChatRow | null> {
  if (!chatId) return null

  const cached = chatCollection.get(chatId)
  if (cached) return cached

  try {
    return await ensureChatStateRow(db, chatId)
  } catch {
    return null
  }
}

async function isProtectedLinxSecretaryChat(db: SolidDatabase, chatId: string): Promise<boolean> {
  const chat = await findChatRow(db, chatId)
  return isLinxDefaultSecretaryChat(chat)
}

async function ensureDefaultThread(chatId: string): Promise<ThreadRow> {
  const db = getDb()
  if (!db) {
    throw new Error('Solid database is not ready')
  }

  const threads = await chatOps.fetchThreads(chatId)
  const existing = threads.find((thread) => thread.title === LINX_DEFAULT_SECRETARY.threadTitle) ?? threads[0]
  if (existing) {
    const threadId = resolveRowSubject(existing as Record<string, unknown>) ?? existing.id
    if (threadId) {
      threadChatIdCache.set(threadId, chatId)
      writeCollectionRow(threadCollection, existing, threadId)
    }
    return existing
  }

  return chatOps.createThread(chatId, LINX_DEFAULT_SECRETARY.threadTitle)
}

async function ensureLinxWelcomeInternal(): Promise<LinxWelcomeResult | null> {
  const db = getDb()
  if (!db) {
    throw new Error('Solid database is not ready')
  }

  let chats: ChatRow[]
  try {
    chats = await chatOps.fetchChats()
  } catch (error) {
    console.warn('[chatOps] Failed to list chats before LinX welcome, creating default assistant:', error)
    chats = chatOps.getAll()
  }
  const existingSecretary = chats.find((chat) => isLinxDefaultSecretaryChat(chat))
  if (existingSecretary) {
    const chatId = resolveRowSubject(existingSecretary as Record<string, unknown>) ?? existingSecretary.id
    if (!chatId) return null

    if (!getSecretaryMetadata(existingSecretary.metadata)?.linx?.role) {
      await chatOps.updateChat(chatId, {
        metadata: createSecretaryMetadata(existingSecretary.metadata),
      })
    }

    const thread = await ensureDefaultThread(chatId)
    const threadId = resolveRowSubject(thread as Record<string, unknown>) ?? thread.id
    const maker = await resolveAssistantMakerFromChat(db, existingSecretary)
    await ensureAgentHomeForChat(db, existingSecretary)
    await ensureDefaultWelcomeMessage(chatId, threadId, maker ?? getCurrentWebId(db) ?? 'linx')
    return { chatId, threadId, created: false }
  }

  const chat = await chatOps.createAIChat({
    title: LINX_DEFAULT_SECRETARY.title,
    provider: LINX_DEFAULT_SECRETARY.provider,
    model: LINX_DEFAULT_SECRETARY.model,
  })
  const chatId = resolveRowSubject(chat as Record<string, unknown>) ?? chat.id
  const thread = await ensureDefaultThread(chatId)
  const threadId = resolveRowSubject(thread as Record<string, unknown>) ?? thread.id
  await ensureDefaultWelcomeMessage(
    chatId,
    threadId,
    await resolveAgentMaker(db, chat.agentId),
  )

  return { chatId, threadId, created: true }
}

async function resolveAssistantMakerFromChat(db: SolidDatabase, chat: Pick<ChatRow, 'participants'>): Promise<string | null> {
  const [participant] = toStringArray(chat.participants)
  if (!participant) return null

  try {
    const contactId = extractLinkedEntityId(participant)
    const contact = contactId
      ? await db.findById(contactTable, contactId) as ContactRow | null
      : null
    if (contact?.entity) {
      return contact.entity
    }
  } catch (error) {
    console.warn('[chatOps] Failed to resolve AI Secretary contact:', error)
  }

  return participant
}

function extractAgentIdFromRef(ref: string | null | undefined): string | null {
  if (!ref) return null
  const canonicalMatch = ref.match(/\/agents\/([^/#]+)(?:\/(?:\.meta(?:#.*)?|$)|$)/)
  if (canonicalMatch?.[1]) return decodeURIComponent(canonicalMatch[1])
  const match = ref.match(/\/\.data\/agents\/([^/#]+)\.ttl(?:#.*)?$/)
  if (match?.[1]) return decodeURIComponent(match[1])
  return /^[a-zA-Z0-9_-]+$/.test(ref) ? ref : null
}

async function ensureAgentHomeForChat(db: SolidDatabase, chat: Pick<ChatRow, 'title' | 'participants'>): Promise<void> {
  const [participant] = toStringArray(chat.participants)
  if (!participant) return

  try {
    const contactId = extractLinkedEntityId(participant)
    const contact = contactId
      ? await db.findByResource(contactTable, { id: contactId }) as ContactRow | null
      : null
    const agentRef = contact?.entity ?? participant
    const agentId = extractAgentIdFromRef(agentRef)
    if (!agentId) return

    const agent = await db.findByResource(agentTable, { id: agentId }) as AgentRow | null
    await ensureAgentHome(db, {
      agentId,
      name: agent?.name || chat.title || agentId,
      provider: normalizeAIConfigProviderId(typeof agent?.provider === 'string' ? agent.provider : LINX_DEFAULT_SECRETARY.provider),
      model: normalizeAIConfigResourceId(typeof agent?.model === 'string' ? agent.model : LINX_DEFAULT_SECRETARY.model),
      instructions: typeof agent?.instructions === 'string' ? agent.instructions : undefined,
    })
  } catch (error) {
    console.warn('[chatOps] Failed to ensure Agent Home for chat:', error)
  }
}

async function resolveAgentMaker(db: SolidDatabase, agentId: string): Promise<string> {
  try {
    const agent = await db.findByResource(agentTable, { id: agentId })
    const agentUri = agent ? resolveRowSubject(agent as Record<string, unknown>) : undefined
    if (agentUri) return agentUri
  } catch (error) {
    console.warn('[chatOps] Failed to resolve default AI Secretary agent URI:', error)
  }

  return agentTable.resolveIriForDatabase(db,  { id: agentId }) ?? agentId
}

async function ensureDefaultWelcomeMessage(
  chatId: string,
  threadId: string | undefined,
  maker: string,
): Promise<MessageRow | null> {
  if (!threadId) return null

  const existingMessages = await chatOps.fetchMessages(threadId, chatId).catch(() => [])
  const existing = existingMessages.find((message) =>
    message.role === 'assistant' && message.content === LINX_DEFAULT_SECRETARY.welcomeMessage
  )
  if (existing) {
    writeCollectionRow(messageCollection, existing, existing.id)
    return existing
  }

  return chatOps.createAssistantMessage(
    chatId,
    threadId,
    LINX_DEFAULT_SECRETARY.welcomeMessage,
    maker,
  )
}

// ============================================================================
// Chat Collection
// ============================================================================

export const chatCollection = createPodCollection<typeof chatTable, ChatRow, ChatInsert>({
  table: chatTable,
  queryKey: ['chats'],
  queryClient,
  getDb,
  orderBy: { column: 'lastActiveAt', direction: 'desc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Chat item is missing id.')
    return item.id
  },
})

// ============================================================================
// Thread Collection
// ============================================================================

// Columns needed for thread list view
const threadListColumns: (keyof ThreadRow)[] = [
  'id',
  'chat',
  'title',
  'starred',
  'workspace',
  'updatedAt',
]

export const threadCollection = createPodCollection<typeof threadTable, ThreadRow, ThreadInsert>({
  table: threadTable,
  queryKey: ['threads'],
  queryClient,
  getDb,
  columns: threadListColumns,
  orderBy: { column: 'updatedAt', direction: 'desc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Thread item is missing id.')
    return item.id
  },
})

// ============================================================================
// Workspace Collection
// ============================================================================

const workspaceListColumns: (keyof WorkspaceRow)[] = [
  'id',
  'title',
  'workspaceType',
  'kind',
  'root',
  'repoRoot',
  'baseRef',
  'branch',
  'updatedAt',
]

export const workspaceCollection = createPodCollection<typeof workspaceTable, WorkspaceRow, WorkspaceInsert>({
  table: workspaceTable,
  queryKey: ['workspaces'],
  queryClient,
  getDb,
  columns: workspaceListColumns,
  orderBy: { column: 'updatedAt', direction: 'desc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Workspace item is missing id.')
    return item.id
  },
})

// ============================================================================
// Message Collection
// ============================================================================

// Columns needed for message list view (excludes richContent, replacedBy, deletedAt, updatedAt)
const messageListColumns: (keyof MessageRow)[] = [
  'id',
  'thread',
  'chat',
  'maker',
  'role',
  'content',
  'status',
  'createdAt',
]

export const messageCollection = createPodCollection<typeof messageTable, MessageRow, MessageInsert>({
  table: messageTable,
  queryKey: ['messages'],
  queryClient,
  getDb,
  columns: messageListColumns,
  orderBy: { column: 'createdAt', direction: 'asc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Message item is missing id.')
    return item.id
  },
})

// ============================================================================
// Agent Collection (for creating AI chats)
// ============================================================================

export const agentCollection = createPodCollection<typeof agentTable, AgentRow, AgentInsert>({
  table: agentTable,
  queryKey: ['agents'],
  queryClient,
  getDb,
  orderBy: { column: 'name', direction: 'asc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Agent item is missing id.')
    return item.id
  },
})

// ============================================================================
// Contact Collection (for creating AI chats)
// ============================================================================

export const _contactCollection = createPodCollection<typeof contactTable, ContactRow, ContactInsert>({
  table: contactTable,
  queryKey: ['contacts'],
  queryClient,
  getDb,
  orderBy: { column: 'name', direction: 'asc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Contact item is missing id.')
    return item.id
  },
})

// ============================================================================
// Chat Operations (Business Logic)
// ============================================================================

export interface CreateAIChatInput {
  title: string
  provider: string
  model: string
  systemPrompt?: string
}

export interface UpdateAgentProfileInput {
  agentId: string
  name?: string
  instructions?: string
  chatId?: string
  contactId?: string
}

export interface UpdateAgentModelInput {
  agentId: string
  provider: string
  model: string
  chatId?: string
  contactId?: string
}

/**
 * Chat Operations - Business logic for chat management
 * 
 * All operations that need to coordinate multiple collections go here.
 * Simple CRUD can use the collections directly.
 */
export const chatOps = {
  // ==========================================================================
  // Query Operations
  // ==========================================================================

  /**
   * Get all chats from collection state
   */
  getAll(): ChatRow[] {
    const stateMap = chatCollection.state
    return Array.from(stateMap.values())
  },

  /**
   * Get chat by ID
   */
  getById(id: string): ChatRow | null {
    const stateMap = chatCollection.state
    const items = Array.from(stateMap.values())
    return items.find((c: ChatRow) => c.id === id) || null
  },

  /**
   * Get threads for a chat
   */
  getThreads(chatId: string): ThreadRow[] {
    const stateMap = threadCollection.state
    const items = Array.from(stateMap.values())
    return items.filter((t: ThreadRow) => threadRepository.chatId(t) === chatId)
  },

  /**
   * Get messages for a thread
   */
  getMessages(threadId: string): MessageRow[] {
    const stateMap = messageCollection.state
    const items = Array.from(stateMap.values())
    return items
      .filter((m: MessageRow) => extractLinkedEntityId(m.thread) === threadId)
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return aTime - bTime
      })
  },

  // ==========================================================================
  // Chat CRUD Operations
  // ==========================================================================

  /**
   * Create an AI Chat with new Agent and Contact
   * 
   * Flow:
   * 1. Create Agent record (with avatarUrl from provider)
   * 2. Create Contact record (type: agent, entity → Agent)
   * 3. Create Chat record (participants → Contact URI)
   * 
   * @returns The created Chat with related IDs
   */
  async createAIChat(input: CreateAIChatInput): Promise<ChatRow & { agentId: string; contactId: string }> {
    const { title, provider, model, systemPrompt } = input

    const db = getDb()
    if (!db) {
      throw new Error('Solid database is not ready')
    }

    return await runChatOpsProjection({
      action: 'ai-chat.create',
      kind: 'insert',
      metadata: (value) => ({
        chatUri: readResultString(value, 'chatUri') ?? resolveRowSubject(value as Record<string, unknown>),
        agentUri: readResultString(value, 'agentUri'),
        contactUri: readResultString(value, 'contactUri'),
        provider: normalizeAIConfigProviderId(provider),
        model: normalizeAIConfigResourceId(model),
      }),
    }, async () => {
      const providerInfo = getAgentProviderInfo(provider)
      const {
        agent,
        contact,
        agentId,
        contactId,
        contactUri,
      } = await createAgentContactRecords(db, {
        name: title,
        provider: normalizeAIConfigProviderId(provider),
        model: normalizeAIConfigResourceId(model),
        instructions: systemPrompt,
      })
      await ensureAgentHome(db, {
        agentId,
        name: title,
        provider: normalizeAIConfigProviderId(provider),
        model: normalizeAIConfigResourceId(model),
        instructions: systemPrompt,
      })

      const chatId = crypto.randomUUID()
      const now = new Date()

      writeCollectionRow(agentCollection, agent as AgentRow, agentId)
      writeCollectionRow(_contactCollection, contact as ContactRow, contactId)

      const chatData: ChatInsert = {
        id: chatId,
        title,
        avatarUrl: providerInfo?.logoUrl,
        metadata: title === LINX_DEFAULT_SECRETARY.title
          ? createSecretaryMetadata()
          : undefined,
        participants: [contactUri],
        createdAt: now,
        updatedAt: now,
        lastActiveAt: now,
      }
      const chatTx = chatCollection.insert(chatData as ChatRow)
      await chatTx.isPersisted.promise
      writeCollectionRow(chatCollection, { ...chatData, id: chatId } as ChatRow, chatId)
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.chats })

      return {
        ...chatData,
        id: chatId,
        agentId,
        contactId,
        chatUri: chatTable.buildIriForDatabase(db,  { id: chatId }),
        agentUri: resolveRowSubject(agent as Record<string, unknown>)
          ?? agentTable.buildIriForDatabase(db,  { id: agentId }),
        contactUri,
      } as ChatRow & { agentId: string; contactId: string }
    })
  },

  /**
   * LinX product welcome flow.
   *
   * xpod remains generic storage/runtime infrastructure; LinX owns the
   * product-specific default assistant and records completion in LinX settings.
   */
  async ensureLinxWelcome(): Promise<LinxWelcomeResult | null> {
    if (!linxWelcomeInFlight) {
      linxWelcomeInFlight = ensureLinxWelcomeInternal()
        .finally(() => {
          linxWelcomeInFlight = null
        })
    }

    return linxWelcomeInFlight
  },

  /**
   * Update a chat
   */
  async updateChat(id: string, data: Partial<ChatRow>): Promise<void> {
    const dbForProjection = getDb()
    const chatTarget = {
      id: extractChatIdFromChatRef(id) ?? id,
    }
    const chatUri = dbForProjection
      ? chatTable.resolveIriForDatabase(dbForProjection,  chatTarget) ?? undefined
      : undefined

    await runChatOpsProjection({
      action: 'chat.update',
      kind: 'update',
      chatId: id,
      chatUri,
      metadata: {
        fieldKeys: Object.keys(data),
      },
    }, async () => {
      const db = getDb()
      const updatedAt = new Date()
      if (!chatCollection.get(id)) {
        if (!db) {
          throw new Error('Solid database is not ready')
        }
        await ensureChatStateRow(db, id)
      }

      if (db) {
        const existing = chatCollection.get(id)
        await updateExactRecord(db, chatTable as any, chatUri ?? existing ?? chatTarget, {
          ...data,
          updatedAt,
        } as Record<string, unknown>)
        writeCollectionRow(chatCollection, {
          ...(existing ?? { id }),
          ...data,
          updatedAt,
        } as ChatRow, id)
        return
      }

      const tx = chatCollection.update(id, (draft: any) => {
        Object.assign(draft, data, { updatedAt })
      })
      await tx.isPersisted.promise
    })
  },

  /**
   * Toggle chat starred status
   */
  async toggleChatStar(id: string, currentStarred: boolean): Promise<void> {
    const newStarred = !currentStarred
    await this.updateChat(id, { starred: newStarred })

    // CP1: report starred change to favorites hub
    const chat = this.getById(id)
    favoriteHooks.onStarredChange('chat', id, newStarred, {
      title: chat?.title ?? id,
      targetType: MEETING.LongChat,
      searchText: chat?.title ?? undefined,
      snapshotContent: chat?.lastMessagePreview ?? undefined,
    })
  },

  /**
   * Toggle chat muted status
   */
  async toggleChatMute(id: string, currentMuted: boolean): Promise<void> {
    await this.updateChat(id, { muted: !currentMuted })
  },

  /**
   * Delete a chat (and its threads/messages)
   */
  async deleteChat(id: string): Promise<void> {
    const db = getDb()
    if (!db) {
      throw new Error('Solid database is not ready')
    }

    if (await isProtectedLinxSecretaryChat(db, id)) {
      throw new Error('AI Secretary 是默认助手，不能删除。')
    }

    await runChatOpsProjection({
      action: 'chat.delete',
      kind: 'delete',
      chatId: id,
      chatUri: chatTable.buildIriForDatabase(db,  {
        id: extractChatIdFromChatRef(id) ?? id,
      }),
    }, async () => {
      // Delete all threads first
      const threads = this.getThreads(id)
      for (const thread of threads) {
        await this.deleteThread(thread.id, id)
      }

      // Delete chat
      const tx = chatCollection.delete(id)
      await tx.isPersisted.promise
    })
  },

  // ==========================================================================
  // Thread CRUD Operations
  // ==========================================================================

  /**
   * Create a new thread
   */
  async createThread(chatId: string, title?: string): Promise<ThreadRow> {
    const db = getDb()
    const threadId = crypto.randomUUID()
    const now = new Date()
    const chatUri = db
      ? chatTable.buildIriForDatabase(db,  {
        id: extractChatIdFromChatRef(chatId) ?? chatId,
      })
      : null
    const threadResourceId = threadTable.buildId( {
      ...threadRepository.targetForChat(chatId, threadId),
    })
    
    const threadData: ThreadInsert = {
      id: db ? threadResourceId : threadId,
      parent: chatUri ?? threadRepository.targetForChat(chatId).parent,
      title: title || `话题 ${now.toLocaleTimeString()}`,
      createdAt: now,
      updatedAt: now,
    }
    
    if (db) {
      await runChatOpsProjection({
        action: 'thread.create',
        kind: 'insert',
        chatId,
        threadId,
        chatUri: chatUri ?? undefined,
        threadUri: threadTable.buildIriForDatabase(db,  threadResourceId),
      }, () => db.insert(threadTable).values(threadData as any).execute())
    } else {
      const tx = threadCollection.insert(threadData as ThreadRow)
      await tx.isPersisted.promise
    }
    threadChatIdCache.set(threadId, chatId)
    writeCollectionRow(threadCollection, { ...threadData, id: threadId } as ThreadRow, threadId)
    
    // Invalidate threads query
    queryClient.invalidateQueries({ queryKey: ['chats', chatId, 'threads'] })
    
    return { ...threadData, id: threadId, parent: chatUri ?? threadRepository.targetForChat(chatId).parent } as ThreadRow
  },

  async ensureThreadWorkspace(input: {
    threadId: string
    workspaceUri?: string
    title?: string
    repoPath?: string
    folderPath?: string
    baseRef?: string
    branch?: string
  }): Promise<string> {
    return await runChatOpsProjection({
      action: 'thread.workspace.ensure',
      kind: 'upsert',
      threadId: input.threadId,
      workspaceId: input.workspaceUri ? parseWorkspaceIdFromContainerUri(input.workspaceUri) ?? undefined : undefined,
      workspaceUri: input.workspaceUri,
      metadata: (value) => ({
        workspaceUri: typeof value === 'string' ? value : input.workspaceUri,
        hasLocalPath: Boolean(input.repoPath || input.folderPath),
      }),
    }, async () => {
      const db = getDb()
      if (!db) {
        throw new Error('数据库未就绪，无法创建 workspace。')
      }

      const thread = await ensureThreadStateRow(db, input.threadId)
      const requestedWorkspaceUri = input.workspaceUri?.trim()

      if (requestedWorkspaceUri && isLocalWorkspaceUri(requestedWorkspaceUri)) {
        if (thread.workspace !== requestedWorkspaceUri) {
          await this.updateThread(input.threadId, { workspace: requestedWorkspaceUri })
          const chatId = threadRepository.chatId(thread)
          if (chatId) {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.threads(chatId) })
          }
        }
        return requestedWorkspaceUri
      }

      if (!requestedWorkspaceUri && thread.workspace && isLocalWorkspaceUri(thread.workspace)) {
        return thread.workspace
      }

      const podBaseUrl = resolvePodBaseUrlFromDatabase(db)
      if (!podBaseUrl) {
        throw new Error('无法解析 Pod 地址，无法创建 workspace。')
      }

      const currentPodWorkspaceUri =
        thread.workspace && !isLocalWorkspaceUri(thread.workspace) ? thread.workspace : undefined
      const workspaceUri =
        requestedWorkspaceUri
        ?? currentPodWorkspaceUri
        ?? resolveWorkspaceContainerUri(podBaseUrl, input.threadId)
      const workspaceId = parseWorkspaceIdFromContainerUri(workspaceUri) ?? input.threadId
      const normalizedRepoPath = normalizeLocalWorkspacePath(input.repoPath)
      const normalizedFolderPath = normalizeLocalWorkspacePath(input.folderPath)
      const kind: WorkspaceKind =
        normalizedFolderPath && normalizedRepoPath && normalizedFolderPath !== normalizedRepoPath
          ? 'worktree'
          : normalizedRepoPath
            ? 'git'
            : 'folder'
      const now = new Date()

      const cachedWorkspace = workspaceCollection.get(workspaceId)
      const persistedWorkspaceRows: WorkspaceRow[] = []
      if (!cachedWorkspace) {
        const persistedWorkspace = await db.findById(workspaceTable as any, workspaceId)
        if (persistedWorkspace) {
          persistedWorkspaceRows.push(persistedWorkspace as WorkspaceRow)
        }
      }
      const existingWorkspace = cachedWorkspace ?? persistedWorkspaceRows[0] as WorkspaceRow | undefined

      const nextWorkspaceCreate: WorkspaceInsert = {
        id: workspaceId,
        title: input.title?.trim() || thread.title || 'Workspace',
        workspaceType: 'pod',
        kind,
        root: workspaceUri,
        repoRoot: existingWorkspace?.repoRoot || undefined,
        baseRef: input.baseRef?.trim() || existingWorkspace?.baseRef || '',
        branch: input.branch?.trim() || existingWorkspace?.branch || '',
        createdAt: existingWorkspace?.createdAt ?? now,
        updatedAt: now,
      }
      const nextWorkspaceRow = {
        ...existingWorkspace,
        ...nextWorkspaceCreate,
        id: workspaceId,
        createdAt: existingWorkspace?.createdAt ?? now,
        updatedAt: now,
      } as WorkspaceRow

      if (existingWorkspace) {
        if (!cachedWorkspace) {
          writeCollectionRow(workspaceCollection, existingWorkspace, workspaceId)
        }
        const tx = workspaceCollection.update(workspaceId, (draft: any) => {
          Object.assign(draft, {
            title: nextWorkspaceCreate.title,
            workspaceType: nextWorkspaceCreate.workspaceType,
            kind: nextWorkspaceCreate.kind,
            root: nextWorkspaceCreate.root,
            repoRoot: nextWorkspaceCreate.repoRoot,
            baseRef: nextWorkspaceCreate.baseRef,
            branch: nextWorkspaceCreate.branch,
            updatedAt: now,
          })
        })
        await tx.isPersisted.promise
      } else {
        const tx = workspaceCollection.insert(nextWorkspaceCreate as WorkspaceRow)
        await tx.isPersisted.promise
      }

      writeCollectionRow(workspaceCollection, nextWorkspaceRow, workspaceId)

      if (thread.workspace !== workspaceUri) {
        await this.updateThread(input.threadId, { workspace: workspaceUri })
        const chatId = threadRepository.chatId(thread)
        if (chatId) {
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.threads(chatId) })
        }
      }

      return workspaceUri
    })
  },

  /**
   * Update a thread
   */
  async updateThread(id: string, data: Partial<ThreadRow>): Promise<void> {
    await runChatOpsProjection({
      action: 'thread.update',
      kind: 'update',
      threadId: id,
      metadata: (value) => ({
        threadUri: resolveRowSubject(value as Record<string, unknown>) ?? readResultString(value, 'threadUri'),
        fieldKeys: Object.keys(data),
      }),
    }, async () => {
      const tx = threadCollection.update(id, (draft: any) => {
        Object.assign(draft, data, { updatedAt: new Date() })
      })
      await tx.isPersisted.promise
      return threadCollection.get(id) ?? { id, ...data }
    })
  },

  /**
   * Toggle thread starred status
   */
  async toggleThreadStar(id: string, chatId: string, currentStarred: boolean): Promise<void> {
    await this.updateThread(id, { starred: !currentStarred })
    queryClient.invalidateQueries({ queryKey: ['chats', chatId, 'threads'] })
  },

  /**
   * Delete a thread (and its messages)
   */
  async deleteThread(id: string, chatId: string): Promise<void> {
    const db = getDb()
    const chatUri = db
      ? chatTable.buildIriForDatabase(db,  {
        id: extractChatIdFromChatRef(chatId) ?? chatId,
      })
      : undefined
    const threadResourceId = threadTable.buildId( {
      ...threadRepository.targetForChat(chatId, id),
    })
    const threadUri = db
      ? threadTable.buildIriForDatabase(db,  threadResourceId)
      : undefined

    await runChatOpsProjection({
      action: 'thread.delete',
      kind: 'delete',
      chatId,
      threadId: id,
      chatUri,
      threadUri,
    }, async () => {
      // Delete all messages first
      const messages = this.getMessages(id)
      for (const msg of messages) {
        const tx = messageCollection.delete(msg.id)
        await tx.isPersisted.promise
      }

      // Delete thread
      const tx = threadCollection.delete(id)
      await tx.isPersisted.promise

      // Invalidate threads query
      queryClient.invalidateQueries({ queryKey: ['chats', chatId, 'threads'] })
    })
  },

  // ==========================================================================
  // Message CRUD Operations
  // ==========================================================================

  /**
   * Create a user message
   */
  async createUserMessage(
    chatId: string, 
    threadId: string, 
    content: string, 
    maker: string
  ): Promise<MessageRow> {
    const db = getDb()
    if (!db) throw new Error('Database not connected')

    const msgId = crypto.randomUUID()
    const now = new Date()
    const threadResourceId = threadTable.buildId( {
      ...threadRepository.targetForChat(chatId, threadId),
    })
    const threadRef = threadTable.buildIriForDatabase(db,  threadResourceId)
    if (!threadRef) {
      throw new Error(`Failed to resolve thread IRI for thread ${threadId}`)
    }
    const chatRef = chatTable.buildIriForDatabase(db,  {
      id: extractChatIdFromChatRef(chatId) ?? chatId,
    })
    const messageResource = messageTable.buildId( {
      id: msgId,
      chat: buildChatTargetRef(chatId),
      thread: threadRef,
      createdAt: now,
    })
    const messageUri = messageTable.buildIriForDatabase(db,  messageResource)
    
    const msgData = {
      id: messageResource,
      chat: chatRef,
      thread: threadRef,
      maker,
      role: 'user',
      content,
      status: 'sent',
      createdAt: now,
    } as MessageInsert
    
    await runChatOpsProjection({
      action: 'message.create',
      kind: 'insert',
      chatId,
      threadId,
      messageId: msgId,
      chatUri: chatRef,
      threadUri: threadRef,
      messageUri,
      role: 'user',
    }, () => db.insert(messageTable).values(msgData as any).execute())
    writeCollectionRow(messageCollection, { ...msgData, id: msgId } as MessageRow, msgId)
    
    // Update chat last activity
    await this.updateChat(chatId, {
      lastActiveAt: now,
      lastMessage: messageUri,
      lastMessagePreview: content.slice(0, 100),
    })
    
    // Invalidate messages query
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages(chatId, threadId) })
    
    return { ...msgData, id: msgId } as MessageRow
  },

  /**
   * Create an assistant message
   */
  async createAssistantMessage(
    chatId: string,
    threadId: string,
    content: string,
    maker: string,
    richContent?: string
  ): Promise<MessageRow> {
    const db = getDb()
    if (!db) throw new Error('Database not connected')

    const msgId = crypto.randomUUID()
    const now = new Date()
    const threadResourceId = threadTable.buildId( {
      ...threadRepository.targetForChat(chatId, threadId),
    })
    const threadRef = threadTable.buildIriForDatabase(db,  threadResourceId)
    if (!threadRef) {
      throw new Error(`Failed to resolve thread IRI for thread ${threadId}`)
    }
    const chatRef = chatTable.buildIriForDatabase(db,  {
      id: extractChatIdFromChatRef(chatId) ?? chatId,
    })
    const messageResource = messageTable.buildId( {
      id: msgId,
      chat: buildChatTargetRef(chatId),
      thread: threadRef,
      createdAt: now,
    })
    const messageUri = messageTable.buildIriForDatabase(db,  messageResource)
    
    const msgData = {
      id: messageResource,
      chat: chatRef,
      thread: threadRef,
      maker,
      role: 'assistant',
      content,
      richContent,
      status: 'sent',
      createdAt: now,
    } as MessageInsert
    
    await runChatOpsProjection({
      action: 'message.create',
      kind: 'insert',
      chatId,
      threadId,
      messageId: msgId,
      chatUri: chatRef,
      threadUri: threadRef,
      messageUri,
      role: 'assistant',
    }, () => db.insert(messageTable).values(msgData as any).execute())
    writeCollectionRow(messageCollection, { ...msgData, id: msgId } as MessageRow, msgId)
    
    // Update chat last activity
    await this.updateChat(chatId, {
      lastActiveAt: now,
      lastMessage: messageUri,
      lastMessagePreview: content.slice(0, 100),
    })
    
    // Invalidate messages query
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages(chatId, threadId) })
    
    return { ...msgData, id: msgId } as MessageRow
  },

  /**
   * Delete a message
   */
  async deleteMessage(id: string, threadId: string): Promise<void> {
    const chatId = getCachedThreadChatId(threadId) || ''
    const db = getDb()
    const chatUri = db && chatId
      ? chatTable.buildIriForDatabase(db,  {
        id: extractChatIdFromChatRef(chatId) ?? chatId,
      })
      : undefined
    const threadUri = db && chatId
      ? threadTable.buildIriForDatabase(db,  {
        ...threadRepository.targetForChat(chatId, threadId),
      })
      : undefined
    await runChatOpsProjection({
      action: 'message.delete',
      kind: 'delete',
      chatId,
      threadId,
      messageId: id,
      chatUri,
      threadUri,
    }, async () => {
      const tx = messageCollection.delete(id)
      await tx.isPersisted.promise

      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages(chatId, threadId) })
    })
  },

  // ==========================================================================
  // Agent Operations
  // ==========================================================================

  /**
   * Update agent profile and keep related contact/chat display fields in sync.
   */
  async updateAgentProfile(input: UpdateAgentProfileInput): Promise<void> {
    const dbForProjection = getDb()
    await runChatOpsProjection({
      action: 'agent.profile.update',
      kind: 'update',
      agentId: input.agentId,
      chatId: input.chatId,
      contactId: input.contactId,
      metadata: {
        agentUri: dbForProjection
          ? agentTable.resolveIriForDatabase(dbForProjection,  { id: input.agentId }) ?? undefined
          : undefined,
        chatUri: input.chatId && dbForProjection
          ? chatTable.resolveIriForDatabase(dbForProjection,  {
            id: extractChatIdFromChatRef(input.chatId) ?? input.chatId,
          }) ?? undefined
          : undefined,
        contactUri: input.contactId && dbForProjection
          ? contactTable.resolveIriForDatabase(dbForProjection,  { id: input.contactId }) ?? undefined
          : undefined,
        fieldKeys: [
          ...(input.name !== undefined ? ['name'] : []),
          ...(input.instructions !== undefined ? ['instructions'] : []),
        ],
      },
    }, async () => {
      const { agentId, name, instructions, chatId, contactId } = input
      const normalizedName = name?.trim()
      const nextInstructions = instructions?.trim() ?? ''

      const tx = agentCollection.update(agentId, (draft: any) => {
        if (normalizedName) {
          draft.name = normalizedName
        }
        if (instructions !== undefined) {
          draft.instructions = nextInstructions || undefined
        }
        draft.updatedAt = new Date()
      })
      await tx.isPersisted.promise

      if (contactId && normalizedName) {
        const contactTx = _contactCollection.update(contactId, (draft: any) => {
          draft.name = normalizedName
          draft.updatedAt = new Date()
        })
        await contactTx.isPersisted.promise
      }

      if (chatId && normalizedName) {
        await this.updateChat(chatId, { title: normalizedName })
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.chats })
      }
    })
  },

  /**
   * Update an agent's instructions (system prompt)
   */
  async updateAgentInstructions(agentId: string, instructions: string): Promise<void> {
    const dbForProjection = getDb()
    await runChatOpsProjection({
      action: 'agent.instructions.update',
      kind: 'update',
      agentId,
      metadata: {
        agentUri: dbForProjection
          ? agentTable.resolveIriForDatabase(dbForProjection,  { id: agentId }) ?? undefined
          : undefined,
        fieldKeys: ['instructions'],
      },
    }, async () => {
      const tx = agentCollection.update(agentId, (draft: any) => {
        draft.instructions = instructions
        draft.updatedAt = new Date()
      })
      await tx.isPersisted.promise
    })
  },

  /**
   * Update an agent's model (and avatarUrl when provider changes)
   * Also updates the related Chat's avatarUrl for list display
   */
  async updateAgentModel(agentId: string, provider: string, model: string, chatId?: string, contactId?: string): Promise<void> {
    const dbForProjection = getDb()
    await runChatOpsProjection({
      action: 'agent.model.update',
      kind: 'update',
      agentId,
      chatId,
      contactId,
      metadata: {
        agentUri: dbForProjection
          ? agentTable.resolveIriForDatabase(dbForProjection,  { id: agentId }) ?? undefined
          : undefined,
        chatUri: chatId && dbForProjection
          ? chatTable.resolveIriForDatabase(dbForProjection,  {
            id: extractChatIdFromChatRef(chatId) ?? chatId,
          }) ?? undefined
          : undefined,
        contactUri: contactId && dbForProjection
          ? contactTable.resolveIriForDatabase(dbForProjection,  { id: contactId }) ?? undefined
          : undefined,
        provider: normalizeAIConfigProviderId(provider),
        model: normalizeAIConfigResourceId(model),
      },
    }, async () => {
      const providerInfo = getAgentProviderInfo(provider)
      const providerRef = normalizeAIConfigProviderId(provider)
      const modelRef = normalizeAIConfigResourceId(model)
      const tx = agentCollection.update(agentId, (draft: any) => {
        const currentProviderId = normalizeAIConfigProviderId(typeof draft.provider === 'string' ? draft.provider : '')
        const providerChanged = currentProviderId !== provider
        draft.provider = providerRef
        draft.model = modelRef
        // Update avatarUrl when provider changes (unless user set a custom one)
        if (providerChanged && providerInfo?.logoUrl) {
          draft.avatarUrl = providerInfo.logoUrl
        }
        draft.updatedAt = new Date()
      })
      await tx.isPersisted.promise

      if (contactId && providerInfo?.logoUrl) {
        const contactTx = _contactCollection.update(contactId, (draft: any) => {
          draft.avatarUrl = providerInfo.logoUrl
          draft.updatedAt = new Date()
        })
        await contactTx.isPersisted.promise
      }

      // Also update Chat avatarUrl if chatId provided and provider changed
      if (chatId && providerInfo?.logoUrl) {
        await this.updateChat(chatId, { avatarUrl: providerInfo.logoUrl })
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.chats })
      }
    })
  },

  // ==========================================================================
  // AI Completion
  // ==========================================================================

  /**
   * Get base URL for a provider using Discovery Service
   * 
   * Currently reads from local JSON (providers.json).
   * Future: Can be upgraded to remote discovery service.
   */
  getProviderBaseUrl(providerSlug: string): string {
    const provider = getAgentProviderInfo(providerSlug)
    return provider?.baseUrl || 'https://api.openai.com/v1'
  },

  /**
   * Fetch AI completion
   */
  async fetchCompletion(
    providerSlug: string,
    params: {
      baseUrl?: string | null
      apiKey: string
      model: string
      messages: { role: string; content: string }[]
    }
  ): Promise<string> {
    const { baseUrl, apiKey, model, messages } = params
    
    // Use provided baseUrl or get from discovery service
    const base = baseUrl || this.getProviderBaseUrl(providerSlug)
    const cleanBase = base.replace(/\/$/, '')
    const endpoint = `${cleanBase}/chat/completions`
    
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1024,
        temperature: 0.7,
      }),
    })
    
    if (!res.ok) {
      const text = await res.text()
      console.error('[chatOps] AI API Error:', text)
      throw new Error(`AI Error ${res.status}: ${text.slice(0, 100)}`)
    }
    
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
  },

  /**
   * Get API credential for a provider from Pod-backed AI config resources.
   */
  async getCredential(provider: string): Promise<{ apiKey: string; baseUrl?: string } | null> {
    const db = getDb()
    if (!db) return null

    const selected = await aiConfigRepository.loadCredentialForBackend(db, normalizeAIConfigProviderId(provider))

    if (!selected) return null

    await aiConfigRepository.markCredentialUsed(db, selected)

    return {
      apiKey: selected.apiKey,
      baseUrl: selected.baseUrl || undefined,
    }
  },

  // ==========================================================================
  // Fetch Operations (for initial load)
  // ==========================================================================

  /**
   * Fetch chats from Pod
   */
  async fetchChats(): Promise<ChatRow[]> {
    const db = getDb()
    if (!db) {
      return chatCollection.fetch()
    }

    let rows: ChatRow[]
    try {
      rows = await db.select()
        .from(chatTable)
        .orderBy('lastActiveAt', 'desc')
        .execute() as ChatRow[]
    } catch (error) {
      console.warn('[chatOps] fetchChats failed, falling back to collection state:', error)
      return chatOps.getAll()
    }
    if (rows.length === 0) {
      return rows
    }

    return hydrateChatRows(db, rows)
  },

  /**
   * Fetch threads for a chat
   */
  async fetchThreads(chatId: string): Promise<ThreadRow[]> {
    const db = getDb()
    if (!db) return []
    
    const chatCol = (threadTable as any).chat
    let rows: ThreadRow[]
    try {
      rows = await db.select()
        .from(threadTable)
        .where(eq(chatCol, chatId))
        .orderBy('updatedAt', 'desc')
        .execute() as ThreadRow[]
    } catch (error) {
      console.warn('[chatOps] fetchThreads failed, falling back to collection state:', error)
      return chatOps.getThreads(chatId)
    }

    rows.forEach((row) => {
      const rowChatId = threadRepository.chatId(row)
      if (row.id && rowChatId) {
        threadChatIdCache.set(row.id, rowChatId)
      }
    })
    
    return rows
  },

  /**
   * Fetch messages for a thread
   */
  async fetchMessages(threadId: string, chatId?: string | null): Promise<MessageRow[]> {
    const db = getDb()
    const cachedMessages = chatOps.getMessages(threadId)
    if (!db || cachedMessages.length > 0) return cachedMessages
    const resolvedChatId = await loadChatIdForThread(db, threadId, chatId)
    if (!resolvedChatId) {
      console.warn('[chatOps] Failed to resolve thread IRI for message query:', threadId)
      return chatOps.getMessages(threadId)
    }
    const threadRef = threadTable.buildIriForDatabase(db,  {
      ...threadRepository.targetForChat(resolvedChatId, threadId),
    })

    try {
      const threadCol = (messageTable as any).thread
      const rows = await db.select()
        .from(messageTable)
        .where(eq(threadCol, threadRef))
        .orderBy('createdAt', 'asc')
        .execute() as MessageRow[]

      if (rows.length > 0) {
        return rows
      }

      const allRows = await db.select()
        .from(messageTable)
        .orderBy('createdAt', 'asc')
        .execute() as MessageRow[]

      return allRows.filter((row) => {
        const rowThread = row.thread
        return rowThread === threadRef
          || rowThread === threadId
          || (typeof rowThread === 'string' && rowThread.endsWith(`#${threadId}`))
      })
    } catch (error) {
      console.warn('[chatOps] fetchMessages failed, falling back to collection state:', error)
      return chatOps.getMessages(threadId)
    }
  },

  // ==========================================================================
  // Subscription Operations
  // ==========================================================================

  /**
   * Subscribe to Pod notifications for real-time updates
   */
  async subscribeToPod(): Promise<() => void> {
    const db = getDb()
    if (!db) {
      console.warn('[chatOps] No database available for subscription')
      return () => {}
    }
    
    const unsubscribers: (() => void)[] = []
    
    try {
      const chatUnsub = await chatCollection.subscribeToPod(db)
      const threadUnsub = await threadCollection.subscribeToPod(db)
      const messageUnsub = await messageCollection.subscribeToPod(db)
      
      unsubscribers.push(chatUnsub, threadUnsub, messageUnsub)
    } catch (e) {
      console.error('[chatOps] Failed to subscribe:', e)
    }
    
    return () => {
      unsubscribers.forEach(unsub => {
        try { unsub() } catch (e) { console.warn('[chatOps] Unsubscribe error:', e) }
      })
    }
  },
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize chat collections with the database instance.
 * Call this from a component that has access to useSolidDatabase.
 */
export function initializeChatCollections(db: SolidDatabase | null) {
  setDatabaseGetter(() => db)
}

// ============================================================================
// Legacy Subscription API (for backward compatibility)
// ============================================================================

/**
 * @deprecated Use chatOps.subscribeToPod() instead
 */
export async function subscribeToChatCollections(db: SolidDatabase): Promise<() => void> {
  setDatabaseGetter(() => db)
  return chatOps.subscribeToPod()
}

// ============================================================================
// React Query Hooks
// ============================================================================

import { useSolidDatabase } from '@/providers/solid-database-provider'

/**
 * Hook to initialize chat collections with database.
 * Call this at the top of any component that uses chat collections.
 */
export function useChatInit() {
  const { db } = useSolidDatabase()
  setDatabaseGetter(() => db)

  return { db, isReady: !!db }
}

const QUERY_KEYS = {
  chats: ['chats'] as const,
  chat: (id: string) => ['chats', id] as const,
  threads: (chatId: string) => ['chats', chatId, 'threads'] as const,
  workspaces: ['workspaces'] as const,
  messages: (chatId: string, threadId: string) => ['chats', chatId, 'threads', threadId, 'messages'] as const,
}

/**
 * Hook to fetch chat list with optional search
 */
export function useChatList(filters?: { search?: string }) {
  const db = getDb()
  return useQuery({
    queryKey: [...QUERY_KEYS.chats, filters?.search || ''],
    queryFn: async () => {
      if (!db) return []
      
      // Use drizzle-solid ilike for server-side search
      if (filters?.search?.trim()) {
        const pattern = `%${filters.search.trim()}%`
        try {
          const results = await db
            .select()
            .from(chatTable)
            .where(
              or(
                like(chatTable.title as any, pattern),
                like(chatTable.lastMessagePreview as any, pattern)
              )
            )
            .orderBy('lastActiveAt', 'desc')
            .execute()
          return await hydrateChatRows(db, results as ChatRow[])
        } catch (error) {
          console.error('[useChatList] Search error, falling back to local:', error)
          // Fallback to local search
          const chats = await chatOps.fetchChats()
          const search = filters.search.toLowerCase()
          return chats.filter(c => 
            c.title?.toLowerCase().includes(search) ||
            c.lastMessagePreview?.toLowerCase().includes(search)
          )
        }
      }
      
      return chatOps.fetchChats()
    },
    enabled: !!db,
  })
}

/**
 * Hook to fetch thread list for a chat
 */
export function useThreadList(chatId: string, options?: { enabled?: boolean }) {
  const db = getDb()
  const enabled = options?.enabled ?? (!!db && !!chatId)
  
  return useQuery({
    queryKey: QUERY_KEYS.threads(chatId || ''),
    queryFn: async () => {
      if (!db || !chatId) return []
      return chatOps.fetchThreads(chatId)
    },
    enabled: !!db && !!chatId && enabled,
  })
}

/**
 * Hook to fetch all threads for chat list/runtime index use cases.
 */
export function useThreadIndex(options?: { enabled?: boolean }) {
  const db = getDb()
  const enabled = options?.enabled ?? !!db

  return useQuery({
    queryKey: ['threads', 'index'],
    queryFn: async () => {
      if (!db) return []
      return threadCollection.fetch()
    },
    enabled: !!db && enabled,
  })
}

export function useWorkspaceList(options?: { enabled?: boolean }) {
  const db = getDb()
  const enabled = options?.enabled ?? !!db

  return useQuery({
    queryKey: QUERY_KEYS.workspaces,
    queryFn: async () => {
      if (!db) return []
      return workspaceCollection.fetch()
    },
    enabled: !!db && enabled,
  })
}

/**
 * Hook to fetch message list for a thread
 */
export function useMessageList(chatId: string | null, threadId: string | null) {
  const db = getDb()
  
  return useQuery({
    queryKey: QUERY_KEYS.messages(chatId || '', threadId || ''),
    queryFn: async () => {
      if (!db || !threadId || !chatId) return []
      return chatOps.fetchMessages(threadId, chatId)
    },
    enabled: !!db && !!threadId && !!chatId,
  })
}

// ============================================================================
// Mutation Hooks (using chatOps)
// ============================================================================

/**
 * Hook for chat mutations
 */
export function useChatMutations() {
  const qc = useQueryClient()
  
  const createAIChat = useMutation({
    mutationFn: (input: CreateAIChatInput) => chatOps.createAIChat(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.chats })
    },
  })

  const updateChat = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<ChatRow>) => 
      chatOps.updateChat(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.chats })
    },
  })

  const deleteChat = useMutation({
    mutationFn: (id: string) => chatOps.deleteChat(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.chats })
    },
  })

  const ensureLinxWelcome = useMutation({
    mutationFn: () => chatOps.ensureLinxWelcome(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.chats })
    },
  })

  const createThread = useMutation({
    mutationFn: ({ chatId, title }: { chatId: string; title?: string }) => 
      chatOps.createThread(chatId, title),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.threads(variables.chatId) })
    },
  })

  const ensureThreadWorkspace = useMutation({
    mutationFn: (input: {
      threadId: string
      workspaceUri?: string
      title?: string
      repoPath?: string
      folderPath?: string
      baseRef?: string
      branch?: string
    }) => chatOps.ensureThreadWorkspace(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.workspaces })
      qc.invalidateQueries({ queryKey: ['threads', 'index'] })
    },
  })

  const updateThread = useMutation({
    mutationFn: ({ id, chatId, ...data }: { id: string; chatId: string } & Partial<ThreadRow>) => 
      chatOps.updateThread(id, data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.threads(variables.chatId) })
    },
  })

  const deleteThread = useMutation({
    mutationFn: ({ id, chatId }: { id: string; chatId: string }) => 
      chatOps.deleteThread(id, chatId),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.threads(variables.chatId) })
    },
  })

  const deleteMessage = useMutation({
    mutationFn: ({ id, threadId }: { id: string; threadId: string }) => 
      chatOps.deleteMessage(id, threadId),
    onSuccess: (_, variables) => {
      const cachedChatId = getCachedThreadChatId(variables.threadId) || ''
      qc.invalidateQueries({ queryKey: QUERY_KEYS.messages(cachedChatId, variables.threadId) })
    },
  })

  const updateAgentProfile = useMutation({
    mutationFn: (input: UpdateAgentProfileInput) => chatOps.updateAgentProfile(input),
    onSuccess: (_, variables) => {
      if (variables.chatId) {
        qc.invalidateQueries({ queryKey: QUERY_KEYS.chats })
      }
    },
  })

  const updateAgentInstructions = useMutation({
    mutationFn: ({ agentId, instructions }: { agentId: string; instructions: string }) =>
      chatOps.updateAgentInstructions(agentId, instructions),
  })

  const updateAgentModel = useMutation({
    mutationFn: ({ agentId, provider, model, chatId, contactId }: UpdateAgentModelInput) =>
      chatOps.updateAgentModel(agentId, provider, model, chatId, contactId),
    onSuccess: (_, variables) => {
      if (variables.chatId) {
        qc.invalidateQueries({ queryKey: QUERY_KEYS.chats })
      }
    },
  })

  return {
    createAIChat,
    ensureLinxWelcome,
    updateChat,
    deleteChat,
    createThread,
    ensureThreadWorkspace,
    updateThread,
    deleteThread,
    deleteMessage,
    updateAgentProfile,
    updateAgentInstructions,
    updateAgentModel,
  }
}

/**
 * Combined hook that mirrors the old useChatService API
 * for easier migration
 */
export function useChatCollections() {
  const mutations = useChatMutations()
  
  return {
    useChatList,
    useThreadList,
    useMessageList,
    mutations,
    // Direct access to chatOps for non-mutation operations
    ops: chatOps,
  }
}
