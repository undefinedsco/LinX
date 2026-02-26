/**
 * Contacts Module Collections
 * 
 * TanStack DB collections for Contact and Agent entities.
 * These collections provide reactive data management with Solid Pod persistence.
 * 
 * Includes `contactOps` for business logic that spans multiple collections.
 */

import { createPodCollection } from '@/lib/data/pod-collection'
import { like, or } from '@undefineds.co/drizzle-solid'
import {
  contactTable,
  agentTable,
  solidProfileTable,
  type ContactRow,
  type ContactInsert,
  type AgentRow,
  type AgentInsert,
  type ChatRow,
  type ChatInsert,
  type SolidProfileRow,
  ContactType,
} from '@linx/models'
import type { SolidDatabase } from '@linx/models'
import { queryClient } from '@/providers/query-provider'
// Import chat collection singleton from chat module
import { chatCollection } from '@/modules/chat/collections'

// ============================================================================
// Database Getter
// ============================================================================

let dbGetter: (() => SolidDatabase | null) | null = null

export function setContactsDatabaseGetter(getter: () => SolidDatabase | null) {
  dbGetter = getter
}

function getDb(): SolidDatabase | null {
  return dbGetter?.() ?? null
}

// ============================================================================
// Contact Collection
// ============================================================================

export const contactCollection = createPodCollection<typeof contactTable, ContactRow, ContactInsert>({
  table: contactTable,
  queryKey: ['contacts'],
  queryClient,
  getDb,
  orderBy: { column: 'name', direction: 'asc' },
  getKey: (item) => {
    if (!item.id) {
      throw new Error('Contact record is missing id')
    }
    return item.id
  },
})

// ============================================================================
// Agent Collection
// ============================================================================

export const agentCollection = createPodCollection<typeof agentTable, AgentRow, AgentInsert>({
  table: agentTable,
  queryKey: ['agents'],
  queryClient,
  getDb,
  orderBy: { column: 'name', direction: 'asc' },
  getKey: (item) => {
    if (!item.id) {
      throw new Error('Agent record is missing id')
    }
    return item.id
  },
})

// ============================================================================
// Chat Collection - imported from chat module as singleton
// ============================================================================

// chatCollection is imported from '@/modules/chat/collections' at the top
// to avoid creating duplicate instances

// ============================================================================
// Contact Operations (Business Logic)
// ============================================================================

export interface CreateAgentInput {
  name: string
  instructions?: string
  model?: string
  provider?: string
}

export interface CreateFriendInput {
  name: string
  webId: string
  avatarUrl?: string
}

export interface CreateGroupInput {
  name: string
  avatarUrl?: string
  memberIds: string[]
  aiAssistantIds?: string[]
}

export interface SolidProfileInfo {
  name: string
  webId: string
  avatarUrl?: string
  inbox?: string
}

export interface RemoteAgentInfo {
  name: string
  description?: string
  avatarUrl?: string
  instructions?: string
  model?: string
  provider?: string
  temperature?: number
  tools?: string[]
}

export interface SyncResult {
  success: boolean
  error?: string
  data?: SolidProfileInfo | RemoteAgentInfo
}

export interface SearchResult {
  contacts: ContactRow[]
  total: number
}

/**
 * Contact Operations - Business logic for contact management
 * 
 * All operations that need to coordinate multiple collections go here.
 * Simple CRUD can use the collections directly.
 */
export const contactOps = {
  /**
   * Create an AI Agent with associated Contact and Chat
   * 
   * Flow:
   * 1. Create Agent record
   * 2. Create Contact record (type: agent, entityUri → Agent)
   * 3. Create Chat record (contact → Contact)
   * 
   * @returns The created Contact (with chatId attached)
   */
  async createAgent(input: CreateAgentInput): Promise<ContactInsert & { id: string; chatId: string }> {
    const { name, instructions, model = 'gpt-4o', provider = 'openai' } = input
    
    const agentId = crypto.randomUUID()
    const contactId = crypto.randomUUID()
    const chatId = crypto.randomUUID()
    const now = new Date()
    
    // 1. Create Agent
    const agentData: AgentInsert = {
      id: agentId,
      name,
      instructions: instructions || undefined,
      model,
      provider,
    }
    const agentTx = agentCollection.insert(agentData as AgentRow)
    
    // 2. Create Contact (pointing to Agent)
    const contactData: ContactInsert = {
      id: contactId,
      name,
      contactType: ContactType.AGENT,
      entityUri: agentId, // Reference to agent
      createdAt: now,
      updatedAt: now,
    }
    const contactTx = contactCollection.insert(contactData as ContactRow)
    
    // 3. Create Chat (pointing to Contact)
    // Use chatCollection singleton from chat module
    const chatData: ChatInsert = {
      id: chatId,
      title: name,
      contact: contactId, // Reference to contact
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    }
    const chatTx = chatCollection.insert(chatData as ChatRow)
    
    // Wait for all to persist
    await Promise.all([
      agentTx.isPersisted.promise,
      contactTx.isPersisted.promise,
      chatTx.isPersisted.promise,
    ])
    
    // Invalidate chat query to refresh list
    queryClient.invalidateQueries({ queryKey: ['chats'] })
    
    return { ...contactData, id: contactId, chatId }
  },
  
  /**
   * Add a Solid friend (create Contact and Chat)
   * 
   * Flow:
   * 1. Create Contact record (type: solid, entityUri → WebID)
   * 2. Create Chat record (contact → Contact)
   * 
   * @returns The created Contact (with chatId attached)
   */
  async addFriend(input: CreateFriendInput): Promise<ContactInsert & { id: string; chatId: string }> {
    const { name, webId, avatarUrl } = input
    
    const contactId = crypto.randomUUID()
    const chatId = crypto.randomUUID()
    const now = new Date()
    
    // 1. Create Contact
    const contactData: ContactInsert = {
      id: contactId,
      name,
      contactType: ContactType.SOLID,
      entityUri: webId,
      avatarUrl,
      createdAt: now,
      updatedAt: now,
      lastSyncedAt: now, // 首次添加时已获取了最新数据
    }
    const contactTx = contactCollection.insert(contactData as ContactRow)
    
    // 2. Create Chat - use chatCollection singleton from chat module
    const chatData: ChatInsert = {
      id: chatId,
      title: name,
      contact: contactId,
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    }
    const chatTx = chatCollection.insert(chatData as ChatRow)
    
    // Wait for persistence
    await Promise.all([
      contactTx.isPersisted.promise,
      chatTx.isPersisted.promise,
    ])
    
    // Invalidate chat query
    queryClient.invalidateQueries({ queryKey: ['chats'] })
    
    return { ...contactData, id: contactId, chatId }
  },
  
  /**
   * Update a contact
   */
  async updateContact(id: string, data: Partial<ContactRow>): Promise<void> {
    const tx = contactCollection.update(id, (draft: any) => {
      Object.assign(draft, data, { updatedAt: new Date() })
    })
    await tx.isPersisted.promise
  },
  
  /**
   * Update an agent
   */
  async updateAgent(id: string, data: Partial<AgentRow>): Promise<void> {
    const tx = agentCollection.update(id, (draft: any) => {
      Object.assign(draft, data)
    })
    await tx.isPersisted.promise
  },
  
  /**
   * Toggle starred status
   */
  async toggleStar(id: string, currentStarred: boolean): Promise<void> {
    await this.updateContact(id, { starred: !currentStarred })
  },
  
  /**
   * Delete a contact (and associated chat if any)
   * 
   * TODO: Also delete associated chat and messages
   */
  async deleteContact(id: string): Promise<void> {
    const tx = contactCollection.delete(id)
    await tx.isPersisted.promise
    
    // TODO: Find and delete associated chat
    // const chats = chatCollection.state.data?.filter(c => c.contact === id)
    // for (const chat of chats) {
    //   await chatCollection.delete(chat.id).isPersisted.promise
    // }
  },
  
  /**
   * Get contact detail by ID
   * Searches in collection state
   */
  getById(id: string): ContactRow | null {
    // Collection state is a Map, convert to array
    const stateMap = contactCollection.state
    const items = Array.from(stateMap.values())
    const found = items.find((c: ContactRow) => {
      const itemId = (c as any)['@id'] || (c as any).subject || c.id
      return itemId === id || c.id === id
    })
    return found || null
  },
  
  /**
   * Get agent detail by ID
   */
  getAgentById(id: string): AgentRow | null {
    // Collection state is a Map, convert to array
    const stateMap = agentCollection.state
    const items = Array.from(stateMap.values())
    const found = items.find((a: AgentRow) => {
      const itemId = (a as any)['@id'] || (a as any).subject || a.id
      return itemId === id || a.id === id
    })
    return found || null
  },

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  /**
   * Get all contacts from collection state
   */
  getAll(): ContactRow[] {
    const stateMap = contactCollection.state
    return Array.from(stateMap.values())
  },

  /**
   * Get all agents from collection state
   */
  getAllAgents(): AgentRow[] {
    const stateMap = agentCollection.state
    return Array.from(stateMap.values())
  },

  /**
   * Search contacts by query string using drizzle-solid ilike
   * Searches in: name, alias, externalId, note, entityUri
   */
  async search(query: string): Promise<ContactRow[]> {
    if (!query.trim()) return this.getAll()
    
    const db = getDb()
    if (!db) return []
    
    const pattern = `%${query.trim()}%`
    
    try {
      const results = await db
        .select()
        .from(contactTable)
        .where(
          or(
            like(contactTable.name, pattern),
            like(contactTable.alias, pattern),
            like(contactTable.externalId, pattern),
            like(contactTable.note, pattern),
            like(contactTable.entityUri, pattern)
          )
        )
        .execute()
      
      return results as ContactRow[]
    } catch (error) {
      console.error('[contactOps] Search error, falling back to local:', error)
      // Fallback to local search if SPARQL fails
      const searchLower = query.trim().toLowerCase()
      const all = this.getAll()
      
      return all.filter(c => 
        c.name?.toLowerCase().includes(searchLower) ||
        c.alias?.toLowerCase().includes(searchLower) ||
        c.externalId?.toLowerCase().includes(searchLower) ||
        c.note?.toLowerCase().includes(searchLower) ||
        c.entityUri?.toLowerCase().includes(searchLower)
      )
    }
  },

  /**
   * Find contact by entityUri (WebID or Agent ID)
   */
  findByEntityUri(entityUri: string): ContactRow | null {
    const all = this.getAll()
    return all.find(c => c.entityUri === entityUri) || null
  },

  // ==========================================================================
  // Chat Linkage Operations
  // ==========================================================================

  /**
   * Find existing chat for a contact, or create one if not exists
   * 
   * @returns chatId
   */
  async findOrCreateChat(contactId: string): Promise<string> {
    // Use chatCollection singleton from chat module
    
    // First, try to find existing chat
    const chats = Array.from(chatCollection.state.values())
    const existingChat = chats.find((c: ChatRow) => c.contact === contactId)
    
    if (existingChat) {
      return existingChat.id
    }
    
    // No existing chat, create one
    const contact = this.getById(contactId)
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`)
    }
    
    const chatId = crypto.randomUUID()
    const now = new Date()
    
    const chatData: ChatInsert = {
      id: chatId,
      title: contact.alias || contact.name,
      contact: contactId,
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    }
    
    const tx = chatCollection.insert(chatData as ChatRow)
    await tx.isPersisted.promise
    
    queryClient.invalidateQueries({ queryKey: ['chats'] })
    
    return chatId
  },

  // ==========================================================================
  // Solid Profile Operations
  // ==========================================================================

  /**
   * Fetch Solid Profile from WebID using drizzle-solid
   * 
   * Uses the current user's authenticated session to fetch remote profile.
   * This works because Solid authentication is cross-Pod.
   * 
   * @param webId - The WebID URL (e.g., https://alice.solidcommunity.net/profile/card#me)
   * @returns Profile info or null if not found/no access
   */
  async fetchSolidProfile(webId: string): Promise<SolidProfileInfo | null> {
    const db = getDb()
    if (!db) {
      console.warn('[contactOps] No database available for fetching profile')
      return null
    }
    
    try {
      // Use drizzle-solid to fetch remote profile
      // The '@id' query will resolve to the full WebID URL
      const record = await db.findFirst(solidProfileTable, { '@id': webId }) as SolidProfileRow | null
      
      if (!record) {
        console.warn(`[contactOps] Profile not found for WebID: ${webId}`)
        return null
      }
      
      return {
        name: record.name || record.nick || '',
        webId,
        avatarUrl: record.avatar || undefined,
        inbox: record.inbox || undefined,
      }
    } catch (error) {
      console.error('[contactOps] Error fetching Solid profile:', error)
      return null
    }
  },

  /**
   * Fetch remote Agent info using drizzle-solid
   * 
   * Agent data is stored in the agent's owner's Pod.
   * Uses the agentTable schema to parse the data.
   * 
   * @param agentUrl - The URL of the remote agent resource
   * @returns Agent info or null if not found/no access
   */
  async fetchRemoteAgent(agentUrl: string): Promise<RemoteAgentInfo | null> {
    const db = getDb()
    if (!db) {
      console.warn('[contactOps] No database available for fetching agent')
      return null
    }
    
    try {
      // Use drizzle-solid to fetch remote agent
      const record = await db.findFirst(agentTable, { '@id': agentUrl }) as AgentRow | null
      
      if (!record) {
        console.warn(`[contactOps] Agent not found at: ${agentUrl}`)
        return null
      }
      
      return {
        name: record.name || '',
        description: record.description || undefined,
        avatarUrl: record.avatarUrl || undefined,
        instructions: record.instructions || undefined,
        model: record.model || undefined,
        provider: record.provider || undefined,
        temperature: record.temperature || undefined,
        tools: record.tools || undefined,
      }
    } catch (error) {
      console.error('[contactOps] Error fetching remote agent:', error)
      return null
    }
  },

  /**
   * Sync a contact from its remote source (WebID or Agent URL)
   * 
   * Implements Solid "source control" principle:
   * - Fetches fresh data from entityUri
   * - Updates cached fields (name, avatarUrl, lastSyncedAt)
   * - Returns the fetched data for detail display
   * 
   * @param contactId - The contact to sync
   * @returns SyncResult with success status and fetched data
   */
  async syncContact(contactId: string): Promise<SyncResult> {
    const contact = this.getById(contactId)
    if (!contact) {
      return { success: false, error: '联系人不存在' }
    }
    
    const entityUri = contact.entityUri
    if (!entityUri) {
      return { success: false, error: '没有关联的远程资源' }
    }
    
    // Check if entityUri is remote (starts with http)
    const isRemote = entityUri.startsWith('http://') || entityUri.startsWith('https://')
    if (!isRemote) {
      // Local entity (e.g., local agent), no sync needed
      return { success: true, data: undefined }
    }
    
    try {
      let data: SolidProfileInfo | RemoteAgentInfo | null = null
      
      if (contact.contactType === ContactType.SOLID) {
        // Fetch Solid Profile
        data = await this.fetchSolidProfile(entityUri)
      } else if (contact.contactType === ContactType.AGENT) {
        // Fetch Remote Agent
        data = await this.fetchRemoteAgent(entityUri)
      }
      
      if (!data) {
        return { 
          success: false, 
          error: '无法获取远程数据，源可能已删除或无权访问' 
        }
      }
      
      // Update cached fields in Contact
      const updateData: Partial<ContactRow> = {
        lastSyncedAt: new Date(),
      }
      
      // Only update name/avatar if we got new data and it's different
      if (data.name && data.name !== contact.name) {
        updateData.name = data.name
      }
      if (data.avatarUrl && data.avatarUrl !== contact.avatarUrl) {
        updateData.avatarUrl = data.avatarUrl
      }
      
      await this.updateContact(contactId, updateData)
      
      return { success: true, data }
    } catch (error) {
      console.error('[contactOps] Sync error:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '同步失败' 
      }
    }
  },

  /**
   * Check if a contact needs sync (has remote entityUri)
   */
  isRemoteContact(contact: ContactRow | null): boolean {
    if (!contact?.entityUri) return false
    return contact.entityUri.startsWith('http://') || contact.entityUri.startsWith('https://')
  },

  /**
   * Get human-readable time since last sync
   */
  getLastSyncedText(lastSyncedAt: Date | null | undefined): string {
    if (!lastSyncedAt) return '从未同步'
    
    const now = new Date()
    const diff = now.getTime() - new Date(lastSyncedAt).getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    
    if (days > 0) return `${days}天前同步`
    if (hours > 0) return `${hours}小时前同步`
    if (minutes > 0) return `${minutes}分钟前同步`
    return '刚刚同步'
  },

  // ==========================================================================
  // Group Operations
  // ==========================================================================

  /**
   * Create a Group Contact with associated Chat
   *
   * Flow:
   * 1. Create Contact record (type: group, entityUri → self)
   * 2. Create Chat record (contact → Contact, participants → member URIs)
   *
   * @returns The created Contact with chatId
   */
  async createGroup(input: CreateGroupInput): Promise<ContactInsert & { id: string; chatId: string }> {
    const { name, avatarUrl, memberIds, aiAssistantIds = [] } = input

    const contactId = crypto.randomUUID()
    const chatId = crypto.randomUUID()
    const now = new Date()

    // Combine human members + AI assistants as participants
    const allParticipants = [...memberIds, ...aiAssistantIds]

    // 1. Create group Contact (entityUri points to self)
    const contactData: ContactInsert = {
      id: contactId,
      name,
      contactType: ContactType.GROUP,
      entityUri: contactId, // Group entityUri points to self
      avatarUrl: avatarUrl || undefined,
      createdAt: now,
      updatedAt: now,
    }
    const contactTx = contactCollection.insert(contactData as ContactRow)

    // 2. Create Chat linked to group contact
    const chatData: ChatInsert = {
      id: chatId,
      title: name,
      contact: contactId,
      participants: allParticipants,
      avatarUrl: avatarUrl || undefined,
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    }
    const chatTx = chatCollection.insert(chatData as ChatRow)

    await Promise.all([
      contactTx.isPersisted.promise,
      chatTx.isPersisted.promise,
    ])

    queryClient.invalidateQueries({ queryKey: ['chats'] })
    queryClient.invalidateQueries({ queryKey: ['contacts'] })

    return { ...contactData, id: contactId, chatId }
  },

  /**
   * Get contacts filtered by contactType
   */
  getByType(type: string): ContactRow[] {
    return this.getAll().filter(c => c.contactType === type)
  },

  /**
   * Get group contacts
   */
  getGroups(): ContactRow[] {
    return this.getByType(ContactType.GROUP)
  },

  /**
   * Get personal (solid) contacts
   */
  getPersonalContacts(): ContactRow[] {
    return this.getByType(ContactType.SOLID)
  },

  /**
   * Get agent contacts
   */
  getAgentContacts(): ContactRow[] {
    return this.getByType(ContactType.AGENT)
  },

  /**
   * Get the Chat record linked to a group contact.
   * Returns null if no chat is found.
   */
  getGroupChat(groupContactId: string): ChatRow | null {
    const chats = Array.from(chatCollection.state.values())
    return chats.find((c: ChatRow) => c.contact === groupContactId) ?? null
  },

  /**
   * Get participant IDs for a group contact (reads from linked Chat).
   */
  getGroupMembers(groupContactId: string): string[] {
    const chat = this.getGroupChat(groupContactId)
    return chat?.participants ?? []
  },

  /**
   * Add a member to a group (appends to Chat.participants).
   */
  async addMemberToGroup(groupContactId: string, memberId: string): Promise<void> {
    const chat = this.getGroupChat(groupContactId)
    if (!chat) throw new Error(`No chat found for group contact: ${groupContactId}`)

    const current = chat.participants ?? []
    if (current.includes(memberId)) return // already a member

    const tx = chatCollection.update(chat.id, (draft: any) => {
      draft.participants = [...current, memberId]
      draft.updatedAt = new Date()
    })
    await tx.isPersisted.promise
    queryClient.invalidateQueries({ queryKey: ['contacts'] })
  },

  /**
   * Remove a member from a group (removes from Chat.participants).
   */
  async removeMemberFromGroup(groupContactId: string, memberId: string): Promise<void> {
    const chat = this.getGroupChat(groupContactId)
    if (!chat) throw new Error(`No chat found for group contact: ${groupContactId}`)

    const current = chat.participants ?? []
    if (!current.includes(memberId)) return // not a member

    const tx = chatCollection.update(chat.id, (draft: any) => {
      draft.participants = current.filter((id: string) => id !== memberId)
      draft.updatedAt = new Date()
    })
    await tx.isPersisted.promise
    queryClient.invalidateQueries({ queryKey: ['contacts'] })
  },

  /**
   * Update group name (updates both Contact.name and Chat.title).
   */
  async updateGroupName(groupContactId: string, newName: string): Promise<void> {
    // Update contact
    await this.updateContact(groupContactId, { name: newName })

    // Update linked chat title
    const chat = this.getGroupChat(groupContactId)
    if (chat) {
      const tx = chatCollection.update(chat.id, (draft: any) => {
        draft.title = newName
        draft.updatedAt = new Date()
      })
      await tx.isPersisted.promise
      queryClient.invalidateQueries({ queryKey: ['chats'] })
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
      console.warn('[contactOps] No database available for subscription')
      return () => {}
    }
    
    const unsubscribe = await contactCollection.subscribeToPod(db)
    return unsubscribe
  },

  /**
   * Fetch contacts from Pod (initial load)
   */
  async fetch(): Promise<ContactRow[]> {
    return await contactCollection.fetch()
  },
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize contact collections with the database instance.
 * Call this from a component that has access to useSolidDatabase.
 */
export function initializeContactCollections(db: SolidDatabase | null) {
  setContactsDatabaseGetter(() => db)
}
