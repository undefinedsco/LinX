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
import { like, or } from '@undefineds.co/drizzle-solid'
import {
  chatTable,
  threadTable,
  workspaceTable,
  messageTable,
  agentTable,
  contactTable,
  credentialTable,
  eq,
  getBuiltinProvider,
  UDFS,
  WF,
  type ChatRow,
  type ChatInsert,
  type ThreadRow,
  type ThreadInsert,
  type WorkspaceRow,
  type WorkspaceInsert,
  type WorkspaceKind,
  type MessageRow,
  type MessageInsert,
  type AgentInsert,
  type AgentRow,
  type ContactInsert,
  type ContactRow,
  isLocalWorkspaceUri,
  resolveWorkspaceContainerUri,
  parseWorkspaceIdFromContainerUri,
  normalizeLocalWorkspacePath,
} from '@linx/models'
import type { SolidDatabase } from '@linx/models'
import { queryClient } from '@/providers/query-provider'
import { createPodCollection } from '@/lib/data/pod-collection'
import { favoriteHooks } from '@/modules/favorites/collections'
import { createAgentContactRecords, writeCollectionRow } from '@/lib/data/direct-chat-records'

// ============================================================================
// Database Getter
// ============================================================================

let dbGetter: (() => SolidDatabase | null) | null = null
const threadChatIdCache = new Map<string, string>()

export function setDatabaseGetter(getter: () => SolidDatabase | null) {
  dbGetter = getter
}

function getDb(): SolidDatabase | null {
  return dbGetter?.() ?? null
}

function getPodBaseUrl(db: SolidDatabase): string | null {
  const podUrl = (db as any).getDialect?.()?.getPodUrl?.()
  if (typeof podUrl === 'string' && podUrl.length > 0) {
    return podUrl.replace(/\/$/, '')
  }

  const webId = (db as any).getSession?.()?.info?.webId
  if (typeof webId !== 'string' || !webId.includes('/profile/card#me')) {
    return null
  }
  return webId.replace('/profile/card#me', '')
}

function getCurrentWebId(db: SolidDatabase): string | null {
  const webId = (
    (db as any).getDialect?.()?.getWebId?.()
    ?? (db as any).getSession?.()?.info?.webId
    ?? (db as any).session?.info?.webId
  )
  return typeof webId === 'string' && webId.length > 0 ? webId : null
}

function normalizeParticipants(participants: string[], selfWebId?: string | null): string[] {
  return Array.from(new Set(participants)).sort((left, right) => {
    if (selfWebId) {
      if (left === selfWebId && right !== selfWebId) return -1
      if (right === selfWebId && left !== selfWebId) return 1
    }
    return left.localeCompare(right)
  })
}

function hasHydratedChatMetadata(metadata: unknown): boolean {
  return typeof metadata === 'object'
    && metadata !== null
    && !Array.isArray(metadata)
    && 'memberRoles' in metadata
}

function buildChatSubjectIri(db: SolidDatabase, chatId: string | undefined): string | null {
  if (!chatId) return null
  const podBaseUrl = getPodBaseUrl(db)
  if (!podBaseUrl) return null
  return `${podBaseUrl}/.data/chat/${chatId}/index.ttl#this`
}

function getCachedThreadChatId(threadId: string): string | null {
  return threadChatIdCache.get(threadId) ?? threadCollection.get(threadId)?.chatId ?? null
}

async function resolveThreadChatId(
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

  const cachedRow = cachedChatId
    ? await (db as any).findByLocator(threadTable as any, { id: threadId, chatId: cachedChatId } as any)
    : null
  const row = (cachedRow
    ?? (await db.select().from(threadTable).execute()).find((entry: any) => entry.id === threadId)) as ThreadRow | undefined
  if (!row?.chatId) {
    return null
  }

  threadChatIdCache.set(threadId, row.chatId)
  ;(threadCollection.utils as { writeUpsert?: (data: ThreadRow) => void }).writeUpsert?.(row)
  return row.chatId
}

async function buildThreadSubjectIri(
  db: SolidDatabase,
  threadId: string | undefined,
  chatId?: string | null,
): Promise<string | null> {
  if (!threadId) return null
  const resolvedChatId = await resolveThreadChatId(db, threadId, chatId)
  if (!resolvedChatId) return null
  const podBaseUrl = getPodBaseUrl(db)
  if (!podBaseUrl) return null
  return `${podBaseUrl}/.data/chat/${resolvedChatId}/index.ttl#${threadId}`
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
    const subjectIri = buildChatSubjectIri(db, row.id)
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

  const rows = await chatCollection.fetch()
  const [row] = await hydrateChatRows(db, rows.filter((candidate) => candidate.id === chatId))

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
  const cachedRow = cachedChatId
    ? await (db as any).findByLocator(threadTable as any, { id: threadId, chatId: cachedChatId } as any)
    : null
  const row = (cachedRow
    ?? (await db.select().from(threadTable).execute()).find((entry: any) => entry.id === threadId)) as ThreadRow | undefined

  if (!row) {
    throw new Error(`Thread ${threadId} was not found in the Pod`)
  }

  threadChatIdCache.set(threadId, row.chatId)
  ;(threadCollection.utils as { writeUpsert?: (data: ThreadRow) => void }).writeUpsert?.(row)
  return row
}

// ============================================================================
// Chat Collection
// ============================================================================

// Columns needed for chat list view and group member operations.
const chatListColumns: (keyof ChatRow)[] = [
  'id',
  'title',
  'avatarUrl',
  'participants',
  'metadata',
  'starred',
  'muted',
  'unreadCount',
  'lastActiveAt',
  'lastMessagePreview',
]

export const chatCollection = createPodCollection<typeof chatTable, ChatRow, ChatInsert>({
  table: chatTable,
  queryKey: ['chats'],
  queryClient,
  getDb,
  columns: chatListColumns,
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
  'chatId',
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
  'rootUri',
  'repoRootUri',
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
    return items.filter((t: ThreadRow) => t.chatId === chatId)
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
   * 2. Create Contact record (type: agent, entityUri → Agent)
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

    const providerInfo = getBuiltinProvider(provider)
    const {
      agent,
      contact,
      agentId,
      contactId,
      contactUri,
    } = await createAgentContactRecords(db, {
      name: title,
      provider,
      model,
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
      participants: [contactUri],
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    }
    const chatTx = chatCollection.insert(chatData as ChatRow)
    await chatTx.isPersisted.promise
    writeCollectionRow(chatCollection, { ...chatData, id: chatId } as ChatRow, chatId)
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.chats })

    return { ...chatData, id: chatId, agentId, contactId } as ChatRow & { agentId: string; contactId: string }
  },

  /**
   * Update a chat
   */
  async updateChat(id: string, data: Partial<ChatRow>): Promise<void> {
    const db = getDb()
    if (!chatCollection.get(id)) {
      if (!db) {
        throw new Error('Solid database is not ready')
      }
      await ensureChatStateRow(db, id)
    }

    const tx = chatCollection.update(id, (draft: any) => {
      Object.assign(draft, data, { updatedAt: new Date() })
    })
    await tx.isPersisted.promise
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
    // Delete all threads first
    const threads = this.getThreads(id)
    for (const thread of threads) {
      await this.deleteThread(thread.id, id)
    }
    
    // Delete chat
    const tx = chatCollection.delete(id)
    await tx.isPersisted.promise
  },

  // ==========================================================================
  // Thread CRUD Operations
  // ==========================================================================

  /**
   * Create a new thread
   */
  async createThread(chatId: string, title?: string): Promise<ThreadRow> {
    const threadId = crypto.randomUUID()
    const now = new Date()
    
    const threadData: ThreadInsert = {
      id: threadId,
      chatId,
      title: title || `话题 ${now.toLocaleTimeString()}`,
      createdAt: now,
      updatedAt: now,
    }
    
    const tx = threadCollection.insert(threadData as ThreadRow)
    await tx.isPersisted.promise
    threadChatIdCache.set(threadId, chatId)
    writeCollectionRow(threadCollection, { ...threadData, id: threadId } as ThreadRow, threadId)
    
    // Invalidate threads query
    queryClient.invalidateQueries({ queryKey: ['chats', chatId, 'threads'] })
    
    return { ...threadData, id: threadId } as ThreadRow
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
    const db = getDb()
    if (!db) {
      throw new Error('数据库未就绪，无法创建 workspace。')
    }

    const thread = await ensureThreadStateRow(db, input.threadId)
    const requestedWorkspaceUri = input.workspaceUri?.trim()

    if (requestedWorkspaceUri && isLocalWorkspaceUri(requestedWorkspaceUri)) {
      if (thread.workspace !== requestedWorkspaceUri) {
        await this.updateThread(input.threadId, { workspace: requestedWorkspaceUri })
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.threads(thread.chatId) })
      }
      return requestedWorkspaceUri
    }

    if (!requestedWorkspaceUri && thread.workspace && isLocalWorkspaceUri(thread.workspace)) {
      return thread.workspace
    }

    const podBaseUrl = getPodBaseUrl(db)
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
      const persistedWorkspace = await (db as any).findByLocator(workspaceTable as any, { id: workspaceId } as any)
      if (persistedWorkspace) {
        persistedWorkspaceRows.push(persistedWorkspace)
      }
    }
    const existingWorkspace = cachedWorkspace ?? persistedWorkspaceRows[0] as WorkspaceRow | undefined

    const nextWorkspaceCreate: WorkspaceInsert = {
      id: workspaceId,
      title: input.title?.trim() || thread.title || 'Workspace',
      workspaceType: 'pod',
      kind,
      rootUri: workspaceUri,
      repoRootUri: existingWorkspace?.repoRootUri || undefined,
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
          rootUri: nextWorkspaceCreate.rootUri,
          repoRootUri: nextWorkspaceCreate.repoRootUri,
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
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.threads(thread.chatId) })
    }

    return workspaceUri
  },

  /**
   * Update a thread
   */
  async updateThread(id: string, data: Partial<ThreadRow>): Promise<void> {
    const tx = threadCollection.update(id, (draft: any) => {
      Object.assign(draft, data, { updatedAt: new Date() })
    })
    await tx.isPersisted.promise
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
    const threadRef = await buildThreadSubjectIri(db, threadId, chatId)
    if (!threadRef) {
      throw new Error(`Failed to resolve thread IRI for thread ${threadId}`)
    }
    
    const msgData = {
      id: msgId,
      chat: buildChatSubjectIri(db, chatId) ?? chatId,
      thread: threadRef,
      maker,
      role: 'user',
      content,
      status: 'sent',
      createdAt: now,
    } as MessageInsert
    
    const tx = messageCollection.insert(msgData as MessageRow)
    await tx.isPersisted.promise
    
    // Update chat last activity
    await this.updateChat(chatId, {
      lastActiveAt: now,
      lastMessageId: msgId,
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
    const threadRef = await buildThreadSubjectIri(db, threadId, chatId)
    if (!threadRef) {
      throw new Error(`Failed to resolve thread IRI for thread ${threadId}`)
    }
    
    const msgData = {
      id: msgId,
      chat: buildChatSubjectIri(db, chatId) ?? chatId,
      thread: threadRef,
      maker,
      role: 'assistant',
      content,
      richContent,
      status: 'sent',
      createdAt: now,
    } as MessageInsert
    
    const tx = messageCollection.insert(msgData as MessageRow)
    await tx.isPersisted.promise
    
    // Update chat last activity
    await this.updateChat(chatId, {
      lastActiveAt: now,
      lastMessageId: msgId,
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
    const tx = messageCollection.delete(id)
    await tx.isPersisted.promise

    const chatId = getCachedThreadChatId(threadId) || ''
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages(chatId, threadId) })
  },

  // ==========================================================================
  // Agent Operations
  // ==========================================================================

  /**
   * Update agent profile and keep related contact/chat display fields in sync.
   */
  async updateAgentProfile(input: UpdateAgentProfileInput): Promise<void> {
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
  },

  /**
   * Update an agent's instructions (system prompt)
   */
  async updateAgentInstructions(agentId: string, instructions: string): Promise<void> {
    const tx = agentCollection.update(agentId, (draft: any) => {
      draft.instructions = instructions
      draft.updatedAt = new Date()
    })
    await tx.isPersisted.promise
  },

  /**
   * Update an agent's model (and avatarUrl when provider changes)
   * Also updates the related Chat's avatarUrl for list display
   */
  async updateAgentModel(agentId: string, provider: string, model: string, chatId?: string, contactId?: string): Promise<void> {
    const providerInfo = getBuiltinProvider(provider)
    const tx = agentCollection.update(agentId, (draft: any) => {
      const providerChanged = draft.provider !== provider
      draft.provider = provider
      draft.model = model
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
    const provider = getBuiltinProvider(providerSlug)
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
   * Get API credential for a provider from credentialTable
   */
  async getCredential(provider: string): Promise<{ apiKey: string; baseUrl?: string } | null> {
    const db = getDb()
    if (!db) return null
    
    const providerCol = (credentialTable as any).provider
    const rows = await db.select()
      .from(credentialTable)
      .where(eq(providerCol, `/settings/ai/providers.ttl#${provider}`))
      .execute()

    const cred = rows.find((row: any) => row?.status === 'active') ?? rows[0]

    if (!cred || !cred.apiKey) return null

    return {
      apiKey: cred.apiKey as string,
      baseUrl: cred.baseUrl || undefined,
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
    const rows = await chatCollection.fetch()
    if (!db || rows.length === 0) {
      return rows
    }

    const hydratedRows = await hydrateChatRows(db, rows)
    const writeBatch = (chatCollection.utils as { writeBatch?: (callback: () => void) => void }).writeBatch
    const writeUpsert = (chatCollection.utils as { writeUpsert?: (data: ChatRow) => void }).writeUpsert
    if (typeof writeBatch === 'function' && typeof writeUpsert === 'function') {
      writeBatch(() => {
        hydratedRows.forEach((row) => {
          writeUpsert(row)
        })
      })
    }
    return hydratedRows
  },

  /**
   * Fetch threads for a chat
   */
  async fetchThreads(chatId: string): Promise<ThreadRow[]> {
    const db = getDb()
    if (!db) return []
    
    const chatIdCol = (threadTable as any).chatId
    const rows = await db.select()
      .from(threadTable)
      .where(eq(chatIdCol, chatId))
      .orderBy('updatedAt', 'desc')
      .execute()

    rows.forEach((row) => {
      if (row.id && row.chatId) {
        threadChatIdCache.set(row.id, row.chatId)
      }
    })
    
    return rows
  },

  /**
   * Fetch messages for a thread
   */
  async fetchMessages(threadId: string, chatId?: string | null): Promise<MessageRow[]> {
    const db = getDb()
    if (!db) return []
    const resolvedChatId = await resolveThreadChatId(db, threadId, chatId)
    if (!resolvedChatId) {
      console.warn('[chatOps] Failed to resolve thread IRI for message query:', threadId)
      return []
    }
    const threadRef = await buildThreadSubjectIri(db, threadId, resolvedChatId)
    if (!threadRef) {
      console.warn('[chatOps] Failed to resolve thread IRI for message query:', threadId)
      return []
    }

    const threadCol = (messageTable as any).thread
    const createdAtCol = (messageTable as any).createdAt
    const rows = await db.select()
      .from(messageTable)
      .where(eq(threadCol, threadRef))
      .orderBy(createdAtCol)
      .execute()

    if (rows.length > 0) {
      return rows
    }

    const allRows = await db.select()
      .from(messageTable)
      .orderBy(createdAtCol)
      .execute()

    return allRows.filter((row) => {
      const rowThread = row.thread
      return rowThread === threadRef
        || rowThread === threadId
        || (typeof rowThread === 'string' && rowThread.endsWith(`#${threadId}`))
    })
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
            .orderBy(chatTable.lastActiveAt, 'desc')
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
