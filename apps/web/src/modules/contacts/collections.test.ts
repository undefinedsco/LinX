/**
 * Contact Collections & Operations Tests
 * 
 * Tests for contactOps business logic that coordinates multiple collections.
 * 
 * Note: These tests mock the database layer to test business logic in isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ContactClass, ContactType } from '@linx/models'

// Mock search results storage for db.select().from().where().execute()
let mockSearchResults: any[] = []

// Mock database with proper chaining for search queries
const mockDb = {
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      execute: vi.fn().mockResolvedValue(undefined),
    }),
  }),
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        execute: vi.fn().mockImplementation(() => Promise.resolve(mockSearchResults)),
      }),
      orderBy: vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue([]),
      }),
      execute: vi.fn().mockResolvedValue([]),
    }),
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  }),
  delete: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      execute: vi.fn().mockResolvedValue(undefined),
    }),
  }),
  // Add findFirst for remote profile/agent fetching
  findFirst: vi.fn().mockResolvedValue(null),
}

// Use vi.hoisted so these are available in vi.mock
const { mockCollectionState, mockInsert, mockUpdate, mockDelete, mockFetch, mockSubscribeToPod } = vi.hoisted(() => ({
  mockCollectionState: new Map(),
  mockInsert: vi.fn().mockReturnValue({
    isPersisted: { promise: Promise.resolve() },
  }),
  mockUpdate: vi.fn().mockReturnValue({
    isPersisted: { promise: Promise.resolve() },
  }),
  mockDelete: vi.fn().mockReturnValue({
    isPersisted: { promise: Promise.resolve() },
  }),
  mockFetch: vi.fn().mockResolvedValue([]),
  mockSubscribeToPod: vi.fn().mockResolvedValue(() => {}),
}))

// Mock createPodCollection before importing collections
vi.mock('@/lib/data/pod-collection', () => ({
  createPodCollection: vi.fn(() => ({
    state: mockCollectionState,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    fetch: mockFetch,
    subscribeToPod: mockSubscribeToPod,
  })),
}))

// Mock query client
vi.mock('@/providers/query-provider', () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}))

// Mock crypto.randomUUID
const mockUUIDs = [
  'uuid-1', 'uuid-2', 'uuid-3',
  'uuid-4', 'uuid-5', 'uuid-6',
]
let uuidIndex = 0

vi.stubGlobal('crypto', {
  randomUUID: () => mockUUIDs[uuidIndex++ % mockUUIDs.length],
})

// Import after mocks are set up
import { 
  contactOps, 
  contactCollection, 
  agentCollection,
  setContactsDatabaseGetter,
} from './collections'
import { queryClient } from '@/providers/query-provider'

describe('contactOps', () => {
  beforeEach(() => {
    uuidIndex = 0
    vi.clearAllMocks()
    mockCollectionState.clear()
    // Set up mock database
    setContactsDatabaseGetter(() => mockDb as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setContactsDatabaseGetter(() => null)
  })

  describe('createAgent', () => {
    it('should create Agent, Contact, and Chat with correct data', async () => {
      const input = {
        name: 'Test Agent',
        instructions: 'You are a helpful assistant',
        model: 'gpt-4o',
        provider: 'openai',
      }

      const result = await contactOps.createAgent(input)

      // Verify result structure
      expect(result.id).toBe('uuid-2') // Contact ID (second UUID)
      expect(result.chatId).toBe('uuid-3') // Chat ID (third UUID)
      expect(result.name).toBe('Test Agent')
      expect(result.contactType).toBe(ContactType.AGENT)
      expect(result.entityUri).toBe('uuid-1') // Agent ID (first UUID)
      
      // Repositories create Agent + Contact via db.insert; collection persists Chat
      expect(mockDb.insert).toHaveBeenCalledTimes(2)
      expect(mockInsert).toHaveBeenCalledTimes(1)
      
      // Verify query invalidation
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chats'] })
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['contacts'] })
    })

    it('should use default model and provider if not provided', async () => {
      const input = { name: 'Simple Agent' }

      const result = await contactOps.createAgent(input)

      expect(result.name).toBe('Simple Agent')
      // Agent should have been created with defaults
      expect(mockInsert).toHaveBeenCalled()
    })

    it('should handle optional instructions', async () => {
      const input = { name: 'No Instructions Agent' }

      const result = await contactOps.createAgent(input)

      expect(result.name).toBe('No Instructions Agent')
      expect(mockInsert).toHaveBeenCalled()
    })
  })

  describe('addFriend', () => {
    it('should create Contact and Chat for Solid friend', async () => {
      const input = {
        name: 'Alice',
        webId: 'https://alice.solidcommunity.net/profile/card#me',
        avatarUrl: 'https://alice.solidcommunity.net/avatar.png',
      }

      const result = await contactOps.addFriend(input)

      // Verify result structure
      expect(result.id).toBe('uuid-1') // Contact ID (first UUID)
      expect(result.chatId).toBe('uuid-2') // Chat ID (second UUID)
      expect(result.name).toBe('Alice')
      expect(result.contactType).toBe(ContactType.SOLID)
      expect(result.entityUri).toBe('https://alice.solidcommunity.net/profile/card#me')
      expect(result.avatarUrl).toBe('https://alice.solidcommunity.net/avatar.png')
      
      // Repository creates Contact; collection persists Chat
      expect(mockDb.insert).toHaveBeenCalledTimes(1)
      expect(mockInsert).toHaveBeenCalledTimes(1)
      
      // Verify query invalidation
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chats'] })
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['contacts'] })
    })

    it('should work without avatarUrl', async () => {
      const input = {
        name: 'Bob',
        webId: 'https://bob.pod/profile/card#me',
      }

      const result = await contactOps.addFriend(input)

      expect(result.name).toBe('Bob')
      expect(result.avatarUrl).toBeUndefined()
      expect(result.contactType).toBe(ContactType.SOLID)
    })
  })

  describe('updateContact', () => {
    it('should call collection update with correct id', async () => {
      await contactOps.updateContact('contact-1', { alias: 'New Alias' })

      expect(mockUpdate).toHaveBeenCalledWith('contact-1', expect.any(Function))
    })
  })

  describe('updateAgent', () => {
    it('should call collection update with correct id', async () => {
      await contactOps.updateAgent('agent-1', { instructions: 'New instructions' })

      expect(mockUpdate).toHaveBeenCalledWith('agent-1', expect.any(Function))
    })
  })

  describe('toggleStar', () => {
    it('should toggle starred from false to true', async () => {
      const updateSpy = vi.spyOn(contactOps, 'updateContact').mockResolvedValue()

      await contactOps.toggleStar('contact-1', false)

      expect(updateSpy).toHaveBeenCalledWith('contact-1', { starred: true })
    })

    it('should toggle starred from true to false', async () => {
      const updateSpy = vi.spyOn(contactOps, 'updateContact').mockResolvedValue()

      await contactOps.toggleStar('contact-1', true)

      expect(updateSpy).toHaveBeenCalledWith('contact-1', { starred: false })
    })
  })

  describe('deleteContact', () => {
    it('should call collection delete', async () => {
      await contactOps.deleteContact('contact-1')

      expect(mockDelete).toHaveBeenCalledWith('contact-1')
    })
  })

  describe('getById', () => {
    it('should find contact by id from collection state', () => {
      const mockContact = { id: 'contact-1', name: 'Test' }
      mockCollectionState.set('contact-1', mockContact)

      const result = contactOps.getById('contact-1')

      expect(result).toEqual(mockContact)
    })

    it('should return null if contact not found', () => {
      mockCollectionState.clear()

      const result = contactOps.getById('non-existent')

      expect(result).toBeNull()
    })

    it('should match by @id property (RDF subject)', () => {
      const mockContact = { id: 'contact-1', '@id': 'https://pod/contact-1', name: 'Test' }
      mockCollectionState.set('contact-1', mockContact)

      const result = contactOps.getById('https://pod/contact-1')

      expect(result).toEqual(mockContact)
    })
  })

  describe('findOrCreateChat', () => {
    it('should reuse an existing chat when participants store contact URI', async () => {
      const contact = {
        id: 'contact-1',
        '@id': 'https://pod.example/.data/contacts/contact-1.ttl',
        name: 'Alice',
      }
      const chat = {
        id: 'chat-1',
        participants: ['https://pod.example/.data/contacts/contact-1.ttl'],
      }

      mockCollectionState.set(contact.id, contact)
      mockCollectionState.set(chat.id, chat)

      const result = await contactOps.findOrCreateChat('contact-1')

      expect(result).toBe('chat-1')
      expect(mockInsert).not.toHaveBeenCalled()
    })

    it('should create a new chat using the persisted contact reference', async () => {
      const contact = {
        id: 'contact-1',
        '@id': 'https://pod.example/.data/contacts/contact-1.ttl',
        name: 'Alice',
      }

      mockCollectionState.set(contact.id, contact)

      const result = await contactOps.findOrCreateChat('contact-1')

      expect(result).toBe('uuid-1')
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'uuid-1',
          participants: ['https://pod.example/.data/contacts/contact-1.ttl'],
        }),
      )
    })
  })

  describe('getAgentById', () => {
    it('should find agent by id from collection state', () => {
      const mockAgent = { id: 'agent-1', name: 'Test Agent' }
      mockCollectionState.set('agent-1', mockAgent)

      const result = contactOps.getAgentById('agent-1')

      expect(result).toEqual(mockAgent)
    })

    it('should return null if agent not found', () => {
      mockCollectionState.clear()

      const result = contactOps.getAgentById('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('getGroupDisplayInfo', () => {
    it('should derive owner flag and member preview from group chat state', () => {
      const ownerRef = 'https://me.example/profile/card#me'
      const memberRef = 'https://bob.example/profile/card#me'

      mockCollectionState.set('group-1', {
        id: 'group-1',
        name: '产品群',
        rdfType: ContactClass.GROUP,
        entityUri: '/.data/chat/chat-1/index.ttl#this',
        contactType: ContactType.SOLID,
      })
      mockCollectionState.set('owner-contact', {
        id: 'owner-contact',
        name: 'Me',
        entityUri: ownerRef,
        contactType: ContactType.SOLID,
      })
      mockCollectionState.set('member-1', {
        id: 'member-1',
        name: 'Bob',
        alias: '老鲍',
        entityUri: memberRef,
        contactType: ContactType.SOLID,
      })
      mockCollectionState.set('chat-1', {
        id: 'chat-1',
        participants: [ownerRef, memberRef],
        metadata: {
          memberRoles: {
            [ownerRef]: 'owner',
          },
        },
      })

      const result = contactOps.getGroupDisplayInfo('group-1', ownerRef)

      expect(result).toEqual({
        memberCount: 2,
        isOwner: true,
        memberPreview: ['Me', '老鲍'],
      })
    })
  })
})

describe('Contact + Chat Linkage Logic', () => {
  beforeEach(() => {
    uuidIndex = 0
    vi.clearAllMocks()
    mockCollectionState.clear()
    setContactsDatabaseGetter(() => mockDb as any)
  })

  afterEach(() => {
    setContactsDatabaseGetter(() => null)
  })

  it('createAgent: Agent.id → Contact.entityUri, Contact reference → Chat.participants', async () => {
    const result = await contactOps.createAgent({ name: 'AI Assistant' })

    // UUID allocation: uuid-1 (Agent), uuid-2 (Contact), uuid-3 (Chat)
    const agentId = 'uuid-1'
    const contactId = 'uuid-2'
    const chatId = 'uuid-3'

    // Verify linkage
    expect(result.entityUri).toBe(agentId) // Contact → Agent
    expect(result.id).toBe(contactId)
    expect(result.chatId).toBe(chatId)
  })

  it('addFriend: WebID → Contact.entityUri, Contact reference → Chat.participants', async () => {
    const webId = 'https://friend.pod/profile/card#me'
    const result = await contactOps.addFriend({ name: 'Friend', webId })

    // UUID allocation: uuid-1 (Contact), uuid-2 (Chat)
    const contactId = 'uuid-1'
    const chatId = 'uuid-2'

    // Verify linkage
    expect(result.entityUri).toBe(webId) // Contact → WebID
    expect(result.id).toBe(contactId)
    expect(result.chatId).toBe(chatId)
  })

  it('createAgent uses repository+chat collection, addFriend uses repository+chat collection', async () => {
    mockInsert.mockClear()
    mockDb.insert.mockClear()

    await contactOps.createAgent({ name: 'Agent' })
    const agentDbInsertCount = mockDb.insert.mock.calls.length
    const agentCollectionInsertCount = mockInsert.mock.calls.length

    mockInsert.mockClear()
    mockDb.insert.mockClear()

    await contactOps.addFriend({ name: 'Friend', webId: 'https://friend.pod/#me' })
    const friendDbInsertCount = mockDb.insert.mock.calls.length
    const friendCollectionInsertCount = mockInsert.mock.calls.length

    expect(agentDbInsertCount).toBe(2) // Agent + Contact
    expect(agentCollectionInsertCount).toBe(1) // Chat
    expect(friendDbInsertCount).toBe(1) // Contact
    expect(friendCollectionInsertCount).toBe(1) // Chat
  })
})

describe('contactOps Query Operations', () => {
  beforeEach(() => {
    uuidIndex = 0
    vi.clearAllMocks()
    mockCollectionState.clear()
    setContactsDatabaseGetter(() => mockDb as any)
  })

  afterEach(() => {
    setContactsDatabaseGetter(() => null)
  })

  describe('getAll', () => {
    it('should return all contacts from collection state', () => {
      const mockContacts = [
        { id: 'contact-1', name: 'Alice' },
        { id: 'contact-2', name: 'Bob' },
      ]
      mockContacts.forEach(c => mockCollectionState.set(c.id, c))

      const result = contactOps.getAll()

      expect(result).toHaveLength(2)
    })

    it('should return empty array when no contacts', () => {
      mockCollectionState.clear()

      const result = contactOps.getAll()

      expect(result).toEqual([])
    })
  })

  describe('getAllAgents', () => {
    it('should return all agents from collection state', () => {
      const mockAgents = [
        { id: 'agent-1', name: 'Assistant A' },
        { id: 'agent-2', name: 'Assistant B' },
      ]
      mockAgents.forEach(a => mockCollectionState.set(a.id, a))

      const result = contactOps.getAllAgents()

      expect(result).toHaveLength(2)
    })
  })

  describe('search', () => {
    const mockContacts = [
      { id: '1', name: 'Alice Smith', alias: 'Ali', entityUri: 'https://alice.pod/#me' },
      { id: '2', name: 'Bob Johnson', alias: null, note: 'Friend from work' },
      { id: '3', name: 'Charlie Brown', alias: 'Chuck', externalId: 'wxid_charlie' },
    ]

    beforeEach(() => {
      mockContacts.forEach(c => mockCollectionState.set(c.id, c))
      // Reset mock search results
      mockSearchResults = []
    })

    it('should return all contacts when query is empty', async () => {
      const result = await contactOps.search('')
      expect(result).toHaveLength(3)
    })

    it('should search by name using drizzle-solid ilike', async () => {
      // Mock drizzle-solid returning filtered results
      mockSearchResults = [mockContacts[0]] // Alice Smith
      
      const result = await contactOps.search('alice')
      
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Alice Smith')
      // Verify db.select was called (drizzle-solid path, not fallback)
      expect(mockDb.select).toHaveBeenCalled()
    })

    it('should search by alias using drizzle-solid ilike', async () => {
      mockSearchResults = [mockContacts[2]] // Charlie Brown (alias: Chuck)
      
      const result = await contactOps.search('chuck')
      
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Charlie Brown')
      expect(mockDb.select).toHaveBeenCalled()
    })

    it('should search by note using drizzle-solid ilike', async () => {
      mockSearchResults = [mockContacts[1]] // Bob Johnson (note: Friend from work)
      
      const result = await contactOps.search('work')
      
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Bob Johnson')
      expect(mockDb.select).toHaveBeenCalled()
    })

    it('should search by externalId using drizzle-solid ilike', async () => {
      mockSearchResults = [mockContacts[2]] // Charlie Brown (externalId: wxid_charlie)
      
      const result = await contactOps.search('wxid')
      
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Charlie Brown')
      expect(mockDb.select).toHaveBeenCalled()
    })

    it('should search by entityUri using drizzle-solid ilike', async () => {
      mockSearchResults = [mockContacts[0]] // Alice (entityUri: https://alice.pod/#me)
      
      const result = await contactOps.search('alice.pod')
      
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Alice Smith')
      expect(mockDb.select).toHaveBeenCalled()
    })

    it('should return multiple matches', async () => {
      // 'o' matches Bob, Johnson, Brown
      mockSearchResults = [mockContacts[1], mockContacts[2]]
      
      const result = await contactOps.search('o')
      
      expect(result.length).toBeGreaterThanOrEqual(2)
      expect(mockDb.select).toHaveBeenCalled()
    })

    it('should return empty array when no matches', async () => {
      mockSearchResults = []
      
      const result = await contactOps.search('nonexistent')
      
      expect(result).toHaveLength(0)
      expect(mockDb.select).toHaveBeenCalled()
    })
  })

  describe('findByEntityUri', () => {
    beforeEach(() => {
      const mockContacts = [
        { id: '1', name: 'Alice', entityUri: 'https://alice.pod/#me' },
        { id: '2', name: 'Bob', entityUri: 'https://bob.pod/#me' },
        { id: '3', name: 'Agent', entityUri: 'agent-uuid-1' },
      ]
      mockContacts.forEach(c => mockCollectionState.set(c.id, c))
    })

    it('should find contact by WebID', () => {
      const result = contactOps.findByEntityUri('https://alice.pod/#me')
      expect(result?.name).toBe('Alice')
    })

    it('should find contact by agent ID', () => {
      const result = contactOps.findByEntityUri('agent-uuid-1')
      expect(result?.name).toBe('Agent')
    })

    it('should return null if not found', () => {
      const result = contactOps.findByEntityUri('https://nonexistent.pod/#me')
      expect(result).toBeNull()
    })
  })
})

describe('contactOps Solid Profile Operations', () => {
  beforeEach(() => {
    uuidIndex = 0
    vi.clearAllMocks()
    mockCollectionState.clear()
    setContactsDatabaseGetter(() => mockDb as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setContactsDatabaseGetter(() => null)
  })

  describe('fetchSolidProfile', () => {
    it('should return profile info when found', async () => {
      mockDb.findFirst.mockResolvedValueOnce({
        name: 'Alice Smith',
        nick: 'alice',
        avatar: 'https://alice.pod/avatar.png',
        inbox: 'https://alice.pod/inbox/',
      })

      const result = await contactOps.fetchSolidProfile('https://alice.pod/profile/card#me')

      expect(result).not.toBeNull()
      expect(result?.name).toBe('Alice Smith')
      expect(result?.webId).toBe('https://alice.pod/profile/card#me')
      expect(result?.avatarUrl).toBe('https://alice.pod/avatar.png')
      expect(result?.inbox).toBe('https://alice.pod/inbox/')
    })

    it('should return null when profile not found', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockDb.findFirst.mockResolvedValueOnce(null)

      const result = await contactOps.fetchSolidProfile('https://invalid.pod/profile')

      expect(result).toBeNull()
    })

    it('should use nick as fallback when name is missing', async () => {
      mockDb.findFirst.mockResolvedValueOnce({
        name: '',
        nick: 'bob',
        avatar: null,
        inbox: null,
      })

      const result = await contactOps.fetchSolidProfile('https://bob.solidcommunity.net/profile/card#me')

      expect(result?.name).toBe('bob')
    })

    it('should return null on error', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      mockDb.findFirst.mockRejectedValueOnce(new Error('Network error'))

      const result = await contactOps.fetchSolidProfile('https://error.pod/profile')

      expect(result).toBeNull()
    })
  })

  describe('syncContact', () => {
    it('should update contact with fetched profile data for Solid contact', async () => {
      const mockContact = { 
        id: 'contact-1', 
        name: 'Old Name', 
        contactType: 'solid',
        entityUri: 'https://alice.pod/profile/card#me' 
      }
      mockCollectionState.set('contact-1', mockContact)
      
      vi.spyOn(contactOps, 'fetchSolidProfile').mockResolvedValue({
        name: 'Alice Updated',
        webId: 'https://alice.pod/profile/card#me',
        avatarUrl: 'https://alice.pod/avatar.png',
      })
      vi.spyOn(contactOps, 'updateContact').mockResolvedValue()

      const result = await contactOps.syncContact('contact-1')

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        name: 'Alice Updated',
        webId: 'https://alice.pod/profile/card#me',
        avatarUrl: 'https://alice.pod/avatar.png',
      })
      expect(contactOps.updateContact).toHaveBeenCalledWith('contact-1', expect.objectContaining({
        name: 'Alice Updated',
        avatarUrl: 'https://alice.pod/avatar.png',
        lastSyncedAt: expect.any(Date),
      }))
    })

    it('should sync remote agent contact', async () => {
      const mockContact = { 
        id: 'contact-1', 
        name: 'Old Agent', 
        contactType: 'agent',
        entityUri: 'https://other.pod/agents/agent-1' 
      }
      mockCollectionState.set('contact-1', mockContact)
      
      vi.spyOn(contactOps, 'fetchRemoteAgent').mockResolvedValue({
        name: 'Updated Agent',
        avatarUrl: 'https://other.pod/agent-avatar.png',
        instructions: 'New instructions',
      })
      vi.spyOn(contactOps, 'updateContact').mockResolvedValue()

      const result = await contactOps.syncContact('contact-1')

      expect(result.success).toBe(true)
      expect(result.data?.name).toBe('Updated Agent')
    })

    it('should skip sync for local agent (non-http entityUri)', async () => {
      const mockContact = { 
        id: 'contact-1', 
        name: 'Local Agent', 
        contactType: 'agent',
        entityUri: 'local-agent-uuid-1'  // Not http
      }
      mockCollectionState.set('contact-1', mockContact)

      const result = await contactOps.syncContact('contact-1')

      expect(result.success).toBe(true)
      expect(result.data).toBeUndefined()  // No data fetched
    })

    it('should return error if contact not found', async () => {
      mockCollectionState.clear()

      const result = await contactOps.syncContact('non-existent')

      expect(result.success).toBe(false)
      expect(result.error).toBe('联系人不存在')
    })

    it('should return error if remote fetch fails', async () => {
      const mockContact = { 
        id: 'contact-1', 
        name: 'Alice', 
        contactType: 'solid',
        entityUri: 'https://alice.pod/profile/card#me' 
      }
      mockCollectionState.set('contact-1', mockContact)
      vi.spyOn(contactOps, 'fetchSolidProfile').mockResolvedValue(null)

      const result = await contactOps.syncContact('contact-1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('无法获取远程数据')
    })
  })

  describe('isRemoteContact', () => {
    it('should return true for http entityUri', () => {
      const contact = { entityUri: 'https://alice.pod/profile/card#me' } as any
      expect(contactOps.isRemoteContact(contact)).toBe(true)
    })

    it('should return false for local entityUri', () => {
      const contact = { entityUri: 'local-uuid-123' } as any
      expect(contactOps.isRemoteContact(contact)).toBe(false)
    })

    it('should return false for null contact', () => {
      expect(contactOps.isRemoteContact(null)).toBe(false)
    })
  })

  describe('getLastSyncedText', () => {
    it('should return "从未同步" for null', () => {
      expect(contactOps.getLastSyncedText(null)).toBe('从未同步')
    })

    it('should return "刚刚同步" for recent time', () => {
      const now = new Date()
      expect(contactOps.getLastSyncedText(now)).toBe('刚刚同步')
    })

    it('should return minutes ago', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
      expect(contactOps.getLastSyncedText(fiveMinutesAgo)).toBe('5分钟前同步')
    })

    it('should return hours ago', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
      expect(contactOps.getLastSyncedText(twoHoursAgo)).toBe('2小时前同步')
    })

    it('should return days ago', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      expect(contactOps.getLastSyncedText(threeDaysAgo)).toBe('3天前同步')
    })
  })
})
