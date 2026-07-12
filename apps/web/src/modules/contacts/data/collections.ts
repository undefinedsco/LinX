/**
 * Contacts Module Collections
 *
 * TanStack DB collections for Contact and Agent entities.
 * These collections provide reactive data management with Solid Pod persistence.
 *
 * Includes `contactOps` for business logic that spans multiple collections.
 */

import { like, or } from '@undefineds.co/drizzle-solid'
import {
  chatResource,
  contactResource,
  agentResource,
  solidProfileResource,
  type ContactRow,
  type ContactInsert,
  type AgentRow,
  type ChatMetadata,
  type ChatMemberRole,
  type ChatRow,
  type ChatInsert,
  type SolidProfileRow,
  ContactType,
  isAgentContact,
  isGroupContact,
} from '@undefineds.co/models'
import type { SolidDatabase } from '@undefineds.co/models'
import {
  agentHomeDirFromResourceId,
  agentResourceId,
  asBaseRelativeResourceId,
  asResourceIri,
  type BaseRelativeResourceId,
  type ResourceIri,
} from '@/lib/data/resource-identity'
import { createAgentHome } from '@/lib/data/agent-home'
import { queryClient } from '@/providers/query-provider'
import { buildGroupContactInfo } from '../domain/contact-projection'
import type { GroupContactInfo } from '../domain/types'
import {
  createAgentContactRecords,
  createGroupContactRecord,
  createSolidContactRecord,
  writeCollectionRow,
} from '@/lib/data/direct-chat-records'
import { toStringArray } from '@/lib/utils'
import {
  getContactsChatPort,
  type ContactsMatrixAuthOptions,
} from './chat-port'
import { favoriteHooks } from '@/modules/favorites/collections'
import {
  agentCollection,
  contactCollection,
  getContactsDatabase as getDb,
} from './resource-collections'

export {
  agentCollection,
  contactCollection,
  initializeContactCollections,
  setContactsDatabaseGetter,
} from './resource-collections'
export {
  configureContactsChatPort,
  getContactsChatCollection,
  useContactsChatSelection,
} from './chat-port'

// ============================================================================
// Database Getter
// ============================================================================

async function findByIriCompat<T>(db: SolidDatabase, resource: unknown, iri: string): Promise<T | null> {
  if (typeof (db as any).findByIri === 'function') {
    return await (db as any).findByIri(resource as any, iri)
  }
  throw new Error('Solid database is missing findByIri support.')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asContactId(id: string): BaseRelativeResourceId {
  return asBaseRelativeResourceId(id, 'Contact id')
}

function asAgentId(id: string): BaseRelativeResourceId {
  const resourceId = asBaseRelativeResourceId(id, 'Agent id')
  agentHomeDirFromResourceId(resourceId)
  return resourceId
}

function resolveContactIri(db: SolidDatabase, contact: Pick<ContactRow, 'id'>): ResourceIri {
  const id = asBaseRelativeResourceId(contact.id, 'Contact row.id')
  return asResourceIri(db.resolveRowIri(contactResource as any, { id }), 'Contact IRI')
}

function resolveChatIri(db: SolidDatabase, chat: Pick<ChatRow, 'id'>): ResourceIri {
  const id = asBaseRelativeResourceId(chat.id, 'Chat row.id')
  return asResourceIri(db.resolveRowIri(chatResource as any, { id }), 'Chat IRI')
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
// Chat Port
// ============================================================================

function getChatCollection(): any {
  return getContactsChatPort().chatCollection
}

function getThreadCollection(): any {
  return getContactsChatPort().threadCollection
}

function hasParticipant(chat: Pick<ChatRow, 'participants'> | null | undefined, participantRefs: readonly string[]): boolean {
  const participants = toStringArray(chat?.participants)
  return participants.some((participant) => participantRefs.includes(participant))
}

function getContactParticipantRefs(db: SolidDatabase, contact: ContactRow): string[] {
  return [resolveContactIri(db, contact)]
}

function getChatRef(db: SolidDatabase, chat: ChatRow): ResourceIri {
  return resolveChatIri(db, chat)
}

function findContactRecord(contactId: string): ContactRow | null {
  const id = asContactId(contactId)
  return contactCollection.state.get(id) as ContactRow | undefined ?? null
}

function buildDirectChatParticipants(contactRef: string): string[] {
  return [contactRef]
}

function buildGroupChatParticipants(participants: string[], ownerRef?: string): string[] {
  return Array.from(new Set([...(ownerRef ? [ownerRef] : []), ...participants]))
}

function getMemberParticipants(chat: Pick<ChatRow, 'participants'> | null | undefined): string[] {
  return toStringArray(chat?.participants)
}

async function compensatePersistedWrites(compensations: Array<() => Promise<void>>): Promise<void> {
  for (let index = compensations.length - 1; index >= 0; index -= 1) {
    try {
      await compensations[index]()
    } catch {
      // Continue unwinding; the original persistence error remains authoritative.
    }
  }
}

function deletePersistedContact(contactId: string): () => Promise<void> {
  return async () => {
    const tx = contactCollection.delete(contactId)
    await tx.isPersisted.promise
  }
}

function forgetLocalCollectionRow(collection: any, rowId: string): void {
  const canManualSync =
    typeof collection?.utils?.writeDelete === 'function'
    && (typeof collection.isReady !== 'function' || collection.isReady())
  if (canManualSync) {
    try {
      collection.utils.writeDelete(rowId)
      return
    } catch {
      // Fall through to headless/bootstrap state cleanup.
    }
  }

  if (collection?.state instanceof Map) {
    collection.state.delete(rowId)
    return
  }
  collection?._state?.syncedData?.delete?.(rowId)
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
  matrix?: ContactsMatrixAuthOptions
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
   * 2. Create Contact record (type: agent, about → Agent)
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

    const compensations: Array<() => Promise<void>> = []
    const agentId = agentResourceId(crypto.randomUUID())
    try {
      const agentHome = await createAgentHome(db, {
        agentId,
        name,
        provider,
        model,
        instructions,
      })
      compensations.push(agentHome.rollback)

      const { agent, contact, contactId, contactUri } = await createAgentContactRecords(db, {
        agentId,
        name,
        provider,
        model,
        instructions,
      })
      compensations.push(deletePersistedContact(contactId))

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
      const chatTx = getChatCollection().insert(chatData as ChatRow)

      await chatTx.isPersisted.promise
      writeCollectionRow(getChatCollection(), { ...chatData, id: chatId } as ChatRow, chatId)

      queryClient.invalidateQueries({ queryKey: ['chats'] })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })

      return { ...(contact as ContactRow), id: contactId, chatId }
    } catch (error) {
      await compensatePersistedWrites(compensations)
      forgetLocalCollectionRow(agentCollection, agentId)
      throw error
    }
  },

  /**
   * Add a Solid friend (create Contact and Chat)
   *
   * Flow:
   * 1. Create Contact record (type: solid, about → WebID)
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

    const compensations: Array<() => Promise<void>> = []
    try {
      const { contact, contactId, contactUri } = await createSolidContactRecord(db, input)
      compensations.push(deletePersistedContact(contactId))
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
      const chatTx = getChatCollection().insert(chatData as ChatRow)

      await chatTx.isPersisted.promise
      writeCollectionRow(getChatCollection(), { ...chatData, id: chatId } as ChatRow, chatId)

      queryClient.invalidateQueries({ queryKey: ['chats'] })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })

      return { ...(contact as ContactRow), id: contactId, chatId }
    } catch (error) {
      await compensatePersistedWrites(compensations)
      throw error
    }
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
  async updateAgent(idOrRef: string, data: Partial<AgentRow>): Promise<void> {
    const targetId = asAgentId(idOrRef)

    const tx = agentCollection.update(targetId, (draft: any) => {
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
      const db = getDb()
      if (!db) {
        throw new Error('Solid database is not ready')
      }
      const chats = Array.from(getChatCollection().state.values()) as ChatRow[]
      const participantRefs = getContactParticipantRefs(db, contact)

      const linkedChats = chats.filter((chat) => {
        if (isGroupContact(contact)) {
          return !!contact.about && getChatRef(db, chat) === contact.about
        }

        const participants = toStringArray(chat.participants)
        return participants.length <= 1 && hasParticipant(chat, participantRefs)
      })

      for (const chat of linkedChats) {
        const chatTx = getChatCollection().delete(chat.id)
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
    const agentId = asAgentId(id)
    return agentCollection.state.get(agentId) as AgentRow | undefined ?? null
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
   * Searches in: name, alias, externalId, note, about
   */
  async search(query: string): Promise<ContactRow[]> {
    if (!query.trim()) return this.getAll()

    const db = getDb()
    if (!db) return []

    const pattern = `%${query.trim()}%`

    try {
      const results = await db
        .select()
        .from(contactResource)
        .where(
          or(
            like(contactResource.name as any, pattern),
            like(contactResource.alias as any, pattern),
            like(contactResource.externalId as any, pattern),
            like(contactResource.note as any, pattern),
            like(contactResource.about as any, pattern)
          )
        )
        .execute()

      return results as ContactRow[]
    } catch (error) {
      console.error('[contactOps] Search error:', error)
      throw error
    }
  },

  /**
   * Find contact by about (WebID or Agent ID)
   */
  findByAbout(about: string): ContactRow | null {
    const all = this.getAll()
    return all.find(c => c.about === about) || null
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

    const db = getDb()
    if (!db) {
      throw new Error('Solid database is not ready')
    }
    const participantRefs = getContactParticipantRefs(db, contact)

    // First, try to find existing chat
    const chats = Array.from(getChatCollection().state.values()) as ChatRow[]
    const existingChat = chats.find((chat: ChatRow) => hasParticipant(chat, participantRefs))

    if (existingChat) {
      return existingChat.id
    }

    // No existing chat, create one
    const chatId = crypto.randomUUID()
    const now = new Date()
    const primaryParticipant = participantRefs[0]

    const chatData: ChatInsert = {
      id: chatId,
      title: contact.alias || contact.name,
      avatarUrl: contact.avatarUrl || undefined,
      participants: buildDirectChatParticipants(primaryParticipant),
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    }

    const tx = getChatCollection().insert(chatData as ChatRow)
    await tx.isPersisted.promise
    writeCollectionRow(getChatCollection(), { ...chatData, id: chatId } as ChatRow, chatId)

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
      const record = await findByIriCompat<SolidProfileRow>(db, solidProfileResource, webId)

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
   * Uses the agentResource schema to parse the data.
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
      const record = await findByIriCompat<AgentRow>(db, agentResource, agentUrl)

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
        tools: toStringArray(record.tools),
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
   * - Fetches fresh data from about
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

    const about = contact.about
    if (!about) {
      return { success: false, error: '没有关联的远程资源' }
    }

    // Check if about is remote (starts with http)
    const isRemote = about.startsWith('http://') || about.startsWith('https://')
    if (!isRemote) {
      // Local about (e.g., local agent), no sync needed
      return { success: true, data: undefined }
    }

    try {
      let data: SolidProfileInfo | RemoteAgentInfo | null = null

      if (contact.contactType === ContactType.SOLID) {
        // Fetch Solid Profile
        data = await this.fetchSolidProfile(about)
      } else if (isAgentContact(contact)) {
        // Fetch Remote Agent
        data = await this.fetchRemoteAgent(about)
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
   * Check if a contact needs sync (has remote about)
   */
  isRemoteContact(contact: ContactRow | null): boolean {
    if (!contact?.about) return false
    return contact.about.startsWith('http://') || contact.about.startsWith('https://')
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
   * 1. Create Contact record (rdfType: GroupContact, about → Chat)
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

    const now = new Date()
    const matrixRoom = input.matrix
      ? await getContactsChatPort().createMatrixGroupRoom({
          db,
          authFetch: input.matrix.authFetch,
          name,
          participants,
          ownerRef,
        })
      : null
    const chatId = matrixRoom?.chatId ?? crypto.randomUUID()
    const chatUri = matrixRoom?.chatUri ?? resolveChatIri(db, { id: chatId } as ChatRow)

    const compensations: Array<() => Promise<void>> = []
    try {
      const { contact, contactId } = await createGroupContactRecord(db, {
        name,
        avatarUrl,
        about: chatUri,
      })
      compensations.push(deletePersistedContact(contactId))

      if (matrixRoom) {
        const participantRefs = buildGroupChatParticipants(participants, ownerRef)
        const memberRoles = ownerRef
          ? {
              [ownerRef]: 'owner' as const,
            }
          : undefined
        const matrixChatMetadata = {
          protocol: 'matrix',
          roomId: matrixRoom.roomId,
          ...(memberRoles ? { memberRoles } : {}),
        }
        if (typeof (db as any).updateById === 'function') {
          await (db as any).updateById(chatResource as any, matrixRoom.chatId, {
            participants: participantRefs,
            avatarUrl: avatarUrl || undefined,
            metadata: matrixChatMetadata,
            updatedAt: now,
            lastActiveAt: now,
          }).catch((error: unknown) => {
            console.warn('[contactOps] Failed to enrich Matrix chat metadata:', error)
          })
        }
        const [persistedChat, persistedThread] = await Promise.all([
          getContactsChatPort().loadMatrixChatRow(db, matrixRoom.chatId).catch(() => null),
          getContactsChatPort().loadMatrixThreadRow(db, matrixRoom.threadId).catch(() => null),
        ])
        const fallbackChat = {
          id: matrixRoom.chatId,
          title: name,
          participants: participantRefs,
          avatarUrl: avatarUrl || undefined,
          metadata: matrixChatMetadata,
          createdAt: now,
          updatedAt: now,
          lastActiveAt: now,
        } as ChatRow
        writeCollectionRow(contactCollection, contact as ContactRow, contactId)
        writeCollectionRow(getChatCollection(), {
          ...fallbackChat,
          ...(persistedChat ?? {}),
          participants: participantRefs,
          avatarUrl: avatarUrl || persistedChat?.avatarUrl,
          metadata: {
            ...((persistedChat?.metadata && typeof persistedChat.metadata === 'object') ? persistedChat.metadata : {}),
            ...matrixChatMetadata,
          },
        } as ChatRow, matrixRoom.chatId)
        if (persistedThread) {
          writeCollectionRow(getThreadCollection(), persistedThread as any, matrixRoom.threadId)
        }

        queryClient.invalidateQueries({ queryKey: ['chats'] })
        queryClient.invalidateQueries({ queryKey: ['contacts'] })
        queryClient.invalidateQueries({ queryKey: ['chats', matrixRoom.chatId, 'threads'] })

        return { ...(contact as ContactRow), id: contactId, chatId: matrixRoom.chatId }
      }

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
      const chatTx = getChatCollection().insert(chatData as ChatRow)

      writeCollectionRow(contactCollection, contact as ContactRow, contactId)

      await chatTx.isPersisted.promise
      writeCollectionRow(getChatCollection(), { ...chatData, id: chatId } as ChatRow, chatId)

      queryClient.invalidateQueries({ queryKey: ['chats'] })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })

      return { ...(contact as ContactRow), id: contactId, chatId }
    } catch (error) {
      await compensatePersistedWrites(compensations)
      throw error
    }
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
  getGroupChat(
    groupContactId: string,
    contacts?: ContactRow[],
    chats: ChatRow[] = Array.from(getChatCollection().state.values()) as ChatRow[],
  ): ChatRow | null {
    const db = getDb()
    if (!db) {
      return null
    }
    const contactRows = contacts ?? this.getAll()
    const groupContact = contactRows.find((contact) => contact.id === groupContactId) ?? null
    if (!groupContact?.about) {
      return null
    }
    return chats.find((chat: ChatRow) => getChatRef(db, chat) === groupContact.about) ?? null
  },

  /**
   * Get participant IDs for a group contact (reads from linked Chat).
   */
  getGroupMembers(groupContactId: string, contacts?: ContactRow[], chats?: ChatRow[]): string[] {
    const chat = this.getGroupChat(groupContactId, contacts, chats)
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

    const current = toStringArray(chat.participants)
    if (current.includes(memberId)) return // already a member

    const tx = getChatCollection().update(chat.id, (draft: any) => {
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

    const current = toStringArray(chat.participants)
    if (!current.includes(memberId)) return // not a member

    const tx = getChatCollection().update(chat.id, (draft: any) => {
      draft.participants = current.filter((id) => id !== memberId)
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
      const tx = getChatCollection().update(chat.id, (draft: any) => {
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

    const members = toStringArray(chat.participants)
    if (!members.includes(memberId)) {
      throw new Error(`Contact ${memberId} is not a member of this group`)
    }

    const tx = getChatCollection().update(chat.id, (draft: any) => {
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
  getGroupMemberRoles(groupContactId: string, contacts?: ContactRow[], chats?: ChatRow[]): Record<string, string> {
    const chat = this.getGroupChat(groupContactId, contacts, chats)
    if (!chat) return {}
    return readMemberRoles((chat as any).metadata)
  },

  /**
   * Build group display metadata for list/detail UIs.
   */
  getGroupDisplayInfo(groupContactId: string, currentUserRef?: string): GroupContactInfo {
    const memberRefs = this.getGroupMembers(groupContactId)
    const roleMap = this.getGroupMemberRoles(groupContactId)
    return buildGroupContactInfo({
      memberRefs,
      roleMap,
      resolvedMembers: this.resolveMembers(memberRefs),
      currentUserRef,
    })
  },

  /**
   * Resolve participant URIs to ContactRow objects for display.
   * Returns contacts in the same order as the input URIs.
   */
  resolveMembers(participants: string[], contacts?: ContactRow[]): ContactRow[] {
    const contactRows = contacts ?? this.getAll()
    const byId = new Map<string, ContactRow>(
      contactRows.flatMap((contact) => {
        const refs = new Set<string>()
        if (contact.id) refs.add(contact.id)
        if (typeof contact.about === 'string' && contact.about.length > 0) {
          refs.add(contact.about)
        }
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
