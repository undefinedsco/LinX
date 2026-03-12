/**
 * Chat Module Collections
 * 
 * TanStack DB collections for Chat, Thread, and Message entities.
 * These collections provide reactive data management with Solid Pod persistence.
 * 
 * Includes `chatOps` for business logic that spans multiple collections.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { like, or } from '@undefineds.co/drizzle-solid'
import {
  chatTable,
  threadTable,
  messageTable,
  agentTable,
  contactTable,
  credentialTable,
  eq,
  getBuiltinProvider,
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
} from '@linx/models'
import type { SolidDatabase } from '@linx/models'
import { queryClient } from '@/providers/query-provider'
import { createPodCollection } from '@/lib/data/pod-collection'
import { favoriteHooks } from '@/modules/favorites/collections'
import { createAgentContactRecords, upsertStateRow } from '@/lib/data/direct-chat-records'

// ============================================================================
// Database Getter
// ============================================================================

let dbGetter: (() => SolidDatabase | null) | null = null

export function setDatabaseGetter(getter: () => SolidDatabase | null) {
  dbGetter = getter
}

function getDb(): SolidDatabase | null {
  return dbGetter?.() ?? null
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
// Message Collection
// ============================================================================

// Columns needed for message list view (excludes richContent, replacedBy, deletedAt, updatedAt)
const messageListColumns: (keyof MessageRow)[] = [
  'id',
  'threadId',
  'chatId',
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
      .filter((m: MessageRow) => m.threadId === threadId)
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

    upsertStateRow(agentCollection.state, agent as AgentRow, agentId)
    upsertStateRow(_contactCollection.state, contact as ContactRow, contactId)

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
    upsertStateRow(chatCollection.state, { ...chatData, id: chatId } as ChatRow, chatId)
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.chats })

    return { ...chatData, id: chatId, agentId, contactId } as ChatRow & { agentId: string; contactId: string }
  },

  /**
   * Update a chat
   */
  async updateChat(id: string, data: Partial<ChatRow>): Promise<void> {
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
    
    // Invalidate threads query
    queryClient.invalidateQueries({ queryKey: ['chats', chatId, 'threads'] })
    
    return { ...threadData, id: threadId } as ThreadRow
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
    const msgId = crypto.randomUUID()
    const now = new Date()
    
    const msgData: MessageInsert = {
      id: msgId,
      chatId,
      threadId,
      maker,
      role: 'user',
      content,
      status: 'sent',
      createdAt: now,
    }
    
    const tx = messageCollection.insert(msgData as MessageRow)
    await tx.isPersisted.promise
    
    // Update chat last activity
    await this.updateChat(chatId, {
      lastActiveAt: now,
      lastMessageId: msgId,
      lastMessagePreview: content.slice(0, 100),
    })
    
    // Invalidate messages query
    queryClient.invalidateQueries({ queryKey: ['threads', threadId, 'messages'] })
    
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
    const msgId = crypto.randomUUID()
    const now = new Date()
    
    const msgData: MessageInsert = {
      id: msgId,
      chatId,
      threadId,
      maker,
      role: 'assistant',
      content,
      richContent,
      status: 'sent',
      createdAt: now,
    }
    
    const tx = messageCollection.insert(msgData as MessageRow)
    await tx.isPersisted.promise
    
    // Update chat last activity
    await this.updateChat(chatId, {
      lastActiveAt: now,
      lastMessageId: msgId,
      lastMessagePreview: content.slice(0, 100),
    })
    
    // Invalidate messages query
    queryClient.invalidateQueries({ queryKey: ['threads', threadId, 'messages'] })
    
    return { ...msgData, id: msgId } as MessageRow
  },

  /**
   * Delete a message
   */
  async deleteMessage(id: string, threadId: string): Promise<void> {
    const tx = messageCollection.delete(id)
    await tx.isPersisted.promise
    
    // Invalidate messages query
    queryClient.invalidateQueries({ queryKey: ['threads', threadId, 'messages'] })
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
    return await chatCollection.fetch()
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
    
    return rows
  },

  /**
   * Fetch messages for a thread
   */
  async fetchMessages(threadId: string): Promise<MessageRow[]> {
    const db = getDb()
    if (!db) return []
    
    const threadIdCol = (messageTable as any).threadId
    const createdAtCol = (messageTable as any).createdAt
    const rows = await db.select()
      .from(messageTable)
      .where(eq(threadIdCol, threadId))
      .orderBy(createdAtCol)
      .execute()
    
    return rows
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
  messages: (threadId: string) => ['threads', threadId, 'messages'] as const,
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
                like(chatTable.title, pattern),
                like(chatTable.lastMessagePreview, pattern)
              )
            )
            .orderBy(chatTable.lastActiveAt, 'desc')
            .execute()
          return results as ChatRow[]
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
 * Hook to fetch message list for a thread
 */
export function useMessageList(threadId: string | null) {
  const db = getDb()
  
  return useQuery({
    queryKey: QUERY_KEYS.messages(threadId || ''),
    queryFn: async () => {
      if (!db || !threadId) return []
      return chatOps.fetchMessages(threadId)
    },
    enabled: !!db && !!threadId,
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
      qc.invalidateQueries({ queryKey: QUERY_KEYS.messages(variables.threadId) })
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
