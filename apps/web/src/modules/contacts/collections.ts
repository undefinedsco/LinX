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
  type ChatMetadata,
  type ChatMemberRole,
  type ChatRow,
  type ChatInsert,
  type SolidProfileRow,
  ContactType,
  isGroupContact,
  resolveRowId,
} from '@linx/models'
import type { SolidDatabase } from '@linx/models'
import { queryClient } from '@/providers/query-provider'
import type { GroupContactInfo } from './types'
import {
  createAgentContactRecords,
  createGroupContactRecord,
  createSolidContactRecord,
  writeCollectionRow,
} from '@/lib/data/direct-chat-records'
// Import chat collection singleton from chat module
import { chatCollection } from '@/modules/chat/collections'
import { favoriteHooks } from '@/modules/favorites/collections'

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

function buildLocalChatUri(chatId: string): string {
  return `/.data/chat/${chatId}/index.ttl#this`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readChatMetadata(metadata: unknown): ChatMetadata {
  if (!isRecord(metadata)) return {}

  const memberRoles = metadata.memberRoles
  if (!isRecord(memberRoles)) {
    return {}
  }

  return {
    memberRoles: Object.fromEntries(
      Object.entries(memberRoles).filter(
        (entry): entry is [string, ChatMemberRole] =>
          entry[1] === 'owner' || entry[1] === 'admin' || entry[1] === 'member',
      ),
    ),
  }
}

function readMemberRoles(metadata: unknown): Record<string, ChatMemberRole> {
  return readChatMetadata(metadata).memberRoles ?? {}
}

function writeChatMetadata(draft: Record<string, unknown>, metadata: ChatMetadata) {
  draft.metadata = metadata
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

function hasParticipant(chat: Pick<ChatRow, 'participants'> | null | undefined, participantRefs: string[]): boolean {
  const participants = Array.isArray(chat?.participants) ? chat.participants : []
  return participants.some((participant) => participantRefs.includes(participant))
}

function getContactRefs(contact: Partial<ContactRow> | null | undefined): string[] {
  const refs = new Set<string>()
  if (contact?.id) refs.add(contact.id)
  const uri = resolveRowId(contact ?? null)
  if (uri) refs.add(uri)
  return Array.from(refs)
}

function getChatRefs(chat: Partial<ChatRow> | null | undefined): string[] {
  const refs = new Set<string>()
  if (!chat) return []
  if (chat.id) {
    refs.add(chat.id)
    refs.add(buildLocalChatUri(chat.id))
  }
  const uri = resolveRowId(chat ?? null)
  if (uri) refs.add(uri)
  return Array.from(refs)
}

function findContactRecord(contactIdOrRef: string): ContactRow | null {
  const items = Array.from(contactCollection.state.values())
  return items.find((contact: ContactRow) => {
    const itemId = (contact as any)['@id'] || (contact as any).subject || contact.id
    return itemId === contactIdOrRef || contact.id === contactIdOrRef
  }) ?? null
}

function buildDirectChatParticipants(contactRef: string): string[] {
  return [contactRef]
}

function buildGroupChatParticipants(participants: string[], ownerRef?: string): string[] {
  return Array.from(new Set([...(ownerRef ? [ownerRef] : []), ...participants]))
}

function getMemberParticipants(chat: Pick<ChatRow, 'participants'> | null | undefined): string[] {
  const participants = Array.isArray(chat?.participants) ? chat.participants : []
  return participants
}

function getFallbackMemberLabel(memberRef: string): string {
  if (!memberRef) return ''
  if (!memberRef.startsWith('http://') && !memberRef.startsWith('https://')) {
    return memberRef
      .split('/')
      .filter(Boolean)
      .pop()
      ?.replace(/\.ttl(#.*)?$/, '')
      ?? memberRef
  }

  try {
    const url = new URL(memberRef)
    const pathTail = url.pathname
      .split('/')
      .filter((segment) => segment && segment !== 'profile' && segment !== 'card')
      .pop()
      ?.replace(/\.ttl$/, '')

    if (pathTail) return pathTail
    return url.hostname
  } catch {
    return memberRef
  }
}

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
  participants: string[]
  ownerRef?: string
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
   * 3. Create Chat record (participants → Contact)
   * 
   * @returns The created Contact (with chatId attached)
   */
  async createAgent(input: CreateAgentInput): Promise<ContactInsert & { id: string; chatId: string }> {
    const { name, instructions, model = 'gpt-4o-mini', provider = 'openai' } = input

    const db = getDb()
    if (!db) {
      throw new Error('Solid database is not ready')
    }

    const { agent, contact, contactId, contactUri } = await createAgentContactRecords(db, {
      name,
      provider,
      model,
      instructions,
    })

    const chatId = crypto.randomUUID()
    const now = new Date()

    writeCollectionRow(agentCollection, agent as AgentRow)
    writeCollectionRow(contactCollection, contact as ContactRow, contactId)

    const chatData: ChatInsert = {
      id: chatId,
      title: name,
      avatarUrl: contact.avatarUrl || undefined,
      participants: buildDirectChatParticipants(contactUri),
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    }
    const chatTx = chatCollection.insert(chatData as ChatRow)
    
    await chatTx.isPersisted.promise
    writeCollectionRow(chatCollection, { ...chatData, id: chatId } as ChatRow, chatId)
    
    // Invalidate chat query to refresh list
    queryClient.invalidateQueries({ queryKey: ['chats'] })
    queryClient.invalidateQueries({ queryKey: ['contacts'] })
    
    return { ...(contact as ContactRow), id: contactId, chatId }
  },
  
  /**
   * Add a Solid friend (create Contact and Chat)
   * 
   * Flow:
   * 1. Create Contact record (type: solid, entityUri → WebID)
   * 2. Create Chat record (participants → Contact)
   * 
   * @returns The created Contact (with chatId attached)
   */
  async addFriend(input: CreateFriendInput): Promise<ContactInsert & { id: string; chatId: string }> {
    const { name } = input

    const db = getDb()
    if (!db) {
      throw new Error('Solid database is not ready')
    }

    const { contact, contactId, contactUri } = await createSolidContactRecord(db, input)
    writeCollectionRow(contactCollection, contact as ContactRow, contactId)

    const chatId = crypto.randomUUID()
    const now = new Date()

    const chatData: ChatInsert = {
      id: chatId,
      title: name,
      avatarUrl: contact.avatarUrl || undefined,
      participants: buildDirectChatParticipants(contactUri),
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    }
    const chatTx = chatCollection.insert(chatData as ChatRow)
    
    await chatTx.isPersisted.promise
    writeCollectionRow(chatCollection, { ...chatData, id: chatId } as ChatRow, chatId)
    
    // Invalidate chat query
    queryClient.invalidateQueries({ queryKey: ['chats'] })
    queryClient.invalidateQueries({ queryKey: ['contacts'] })
    
    return { ...(contact as ContactRow), id: contactId, chatId }
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
    const newStarred = !currentStarred
    await this.updateContact(id, { starred: newStarred })

    // CP1: report starred change to favorites hub
    const contact = this.getById(id)
    favoriteHooks.onStarredChange('contacts', id, newStarred, {
      title: contact?.name ?? id,
      searchText: contact?.name ?? undefined,
      snapshotContent: contact?.note ?? undefined,
    })
  },
  
  /**
   * Delete a contact (and associated chat if any)
   */
  async deleteContact(id: string): Promise<void> {
    const contact = this.getById(id)
    if (contact) {
      const chats = Array.from(chatCollection.state.values()) as ChatRow[]
      const participantRefs = getContactRefs(contact)

      const linkedChats = chats.filter((chat) => {
        if (isGroupContact(contact)) {
          const groupChatRef = contact.entityUri ?? contact.id
          return getChatRefs(chat).includes(groupChatRef)
        }

        const participants = Array.isArray(chat.participants) ? chat.participants : []
        return participants.length <= 1 && hasParticipant(chat, participantRefs)
      })

      for (const chat of linkedChats) {
        const chatTx = chatCollection.delete(chat.id)
        await chatTx.isPersisted.promise
      }
    }

    const tx = contactCollection.delete(id)
    await tx.isPersisted.promise

    queryClient.invalidateQueries({ queryKey: ['chats'] })
    queryClient.invalidateQueries({ queryKey: ['contacts'] })
  },
  
  /**
   * Get contact detail by ID
   * Searches in collection state
   */
  getById(id: string): ContactRow | null {
    return findContactRecord(id)
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
    const contact = this.getById(contactId)
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`)
    }

    const participantRefs = getContactRefs(contact)

    // First, try to find existing chat
    const chats = Array.from(chatCollection.state.values())
    const existingChat = chats.find((chat: ChatRow) => hasParticipant(chat, participantRefs))
    
    if (existingChat) {
      return existingChat.id
    }
    
    // No existing chat, create one
    const chatId = crypto.randomUUID()
    const now = new Date()
    const primaryParticipant = participantRefs.find((ref) => ref !== contact.id) ?? contact.id
    
    const chatData: ChatInsert = {
      id: chatId,
      title: contact.alias || contact.name,
      avatarUrl: contact.avatarUrl || undefined,
      participants: buildDirectChatParticipants(primaryParticipant),
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    }
    
    const tx = chatCollection.insert(chatData as ChatRow)
    await tx.isPersisted.promise
    writeCollectionRow(chatCollection, { ...chatData, id: chatId } as ChatRow, chatId)
    
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
   * 1. Create Contact record (rdfType: GroupContact, entityUri → Chat URI)
   * 2. Create Chat record (participants → member URIs)
   *
   * @returns The created Contact with chatId
   */
  async createGroup(input: CreateGroupInput): Promise<ContactInsert & { id: string; chatId: string }> {
    const { name, avatarUrl, participants, ownerRef } = input

    const db = getDb()
    if (!db) {
      throw new Error('Solid database is not ready')
    }

    const chatId = crypto.randomUUID()
    const chatUri = buildLocalChatUri(chatId)

    const { contact, contactId } = await createGroupContactRecord(db, {
      name,
      avatarUrl,
      entityUri: chatUri,
    })
    const now = new Date()

    // 2. Create Chat linked to group contact
    const chatData: ChatInsert = {
      id: chatId,
      title: name,
      participants: buildGroupChatParticipants(participants, ownerRef),
      avatarUrl: avatarUrl || undefined,
      metadata: ownerRef
        ? {
            memberRoles: {
              [ownerRef]: 'owner',
            },
          }
        : undefined,
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    }
    const chatTx = chatCollection.insert(chatData as ChatRow)

    writeCollectionRow(contactCollection, contact as ContactRow, contactId)

    await chatTx.isPersisted.promise
    writeCollectionRow(chatCollection, { ...chatData, id: chatId } as ChatRow, chatId)

    queryClient.invalidateQueries({ queryKey: ['chats'] })
    queryClient.invalidateQueries({ queryKey: ['contacts'] })

    return { ...(contact as ContactRow), id: contactId, chatId }
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
    return this.getAll().filter((contact) => isGroupContact(contact))
  },

  /**
   * Get personal (solid) contacts
   */
  getPersonalContacts(): ContactRow[] {
    return this.getAll().filter(
      (contact) => contact.contactType === ContactType.SOLID && !isGroupContact(contact),
    )
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
    const groupContact = this.getById(groupContactId)
    const groupChatRef = groupContact?.entityUri ?? groupContactId
    return chats.find((chat: ChatRow) => getChatRefs(chat).includes(groupChatRef)) ?? null
  },

  /**
   * Get participant IDs for a group contact (reads from linked Chat).
   */
  getGroupMembers(groupContactId: string): string[] {
    const chat = this.getGroupChat(groupContactId)
    const participantRefs = getMemberParticipants(chat)
    const roleRefs = Object.keys(readMemberRoles(chat?.metadata))
    return buildGroupChatParticipants([...participantRefs, ...roleRefs])
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
      draft.participants = buildGroupChatParticipants([...current, memberId])
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
  // CP1: Enhanced Group Operations
  // ==========================================================================

  /**
   * Create a group with associated chat — CP1 entry point.
   *
   * Validates minimum participant count (>= 2)
   * then delegates to createGroup().
   */
  async createGroupWithChat(
    input: CreateGroupInput,
  ): Promise<ContactInsert & { id: string; chatId: string }> {
    const totalMembers = buildGroupChatParticipants(input.participants, input.ownerRef).length
    if (totalMembers < 2) {
      throw new Error('群组至少需要 2 名成员')
    }
    return this.createGroup(input)
  },

  /**
   * Update a member's role within a group.
   *
   * Role metadata is stored in the Chat.metadata JSON field as:
   *   { memberRoles: { [participantRef]: MemberRole } }
   *
   * Only 'admin' and 'member' can be set — 'owner' is immutable after creation.
   */
  async updateMemberRole(
    groupContactId: string,
    memberId: string,
    role: 'admin' | 'member',
  ): Promise<void> {
    const chat = this.getGroupChat(groupContactId)
    if (!chat) throw new Error(`No chat found for group contact: ${groupContactId}`)

    const members = chat.participants ?? []
    if (!members.includes(memberId)) {
      throw new Error(`Contact ${memberId} is not a member of this group`)
    }

    const tx = chatCollection.update(chat.id, (draft: any) => {
      const meta = readChatMetadata(draft.metadata)
      const roles = readMemberRoles(draft.metadata)
      roles[memberId] = role
      writeChatMetadata(draft, { ...meta, memberRoles: roles })
      draft.updatedAt = new Date()
    })
    await tx.isPersisted.promise
    queryClient.invalidateQueries({ queryKey: ['contacts'] })
  },

  /**
   * Get the role map for a group (from Chat.metadata.memberRoles).
   */
  getGroupMemberRoles(groupContactId: string): Record<string, string> {
    const chat = this.getGroupChat(groupContactId)
    if (!chat) return {}
    return readMemberRoles((chat as any).metadata)
  },

  /**
   * Build group display metadata for list/detail UIs.
   */
  getGroupDisplayInfo(groupContactId: string, currentUserRef?: string): GroupContactInfo {
    const memberRefs = this.getGroupMembers(groupContactId)
    const roleMap = this.getGroupMemberRoles(groupContactId)
    const resolvedByRef = new Map(
      this.resolveMembers(memberRefs).flatMap((member) => {
        const refs = new Set<string>()
        if (member.id) refs.add(member.id)
        if (typeof member.entityUri === 'string' && member.entityUri.length > 0) {
          refs.add(member.entityUri)
        }
        const resolved = resolveRowId(member)
        if (resolved) refs.add(resolved)
        return Array.from(refs).map((ref) => [ref, member] as const)
      }),
    )

    const memberPreview = Array.from(
      new Set(
        memberRefs
          .map((memberRef) => {
            const member = resolvedByRef.get(memberRef)
            return member?.alias || member?.name || getFallbackMemberLabel(memberRef)
          })
          .filter((value): value is string => value != null && value.length > 0),
      ),
    ).slice(0, 4)

    return {
      memberCount: memberRefs.length,
      isOwner: !!currentUserRef && roleMap[currentUserRef] === 'owner',
      memberPreview,
    }
  },

  /**
   * Resolve participant URIs to ContactRow objects for display.
   * Returns contacts in the same order as the input URIs.
   */
  resolveMembers(participants: string[]): ContactRow[] {
    const all = this.getAll()
    const byId = new Map<string, ContactRow>(
      all.flatMap((contact) => {
        const refs = new Set<string>()
        if (contact.id) refs.add(contact.id)
        if (typeof contact.entityUri === 'string' && contact.entityUri.length > 0) {
          refs.add(contact.entityUri)
        }
        const resolved = resolveRowId(contact)
        if (resolved) refs.add(resolved)
        return Array.from(refs).map((ref) => [ref, contact] as const)
      }),
    )
    return participants
      .map(id => byId.get(id))
      .filter((c): c is ContactRow => c != null)
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
