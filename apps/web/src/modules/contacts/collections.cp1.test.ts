/**
 * CP1 Group Operations Tests
 *
 * Tests for contactOps CP1 group CRUD: createGroupWithChat, updateMemberRole,
 * resolveMembers, and getGroupMemberRoles.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ContactClass, ContactType } from '@linx/models'

const mockDb = {
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      execute: vi.fn().mockResolvedValue(undefined),
    }),
  }),
}

// Use vi.hoisted so these are available in vi.mock
const {
  mockCollectionState,
  mockChatState,
  mockInsert,
  mockUpdate,
  mockDelete,
  mockFetch,
  mockSubscribeToPod,
} = vi.hoisted(() => ({
  mockCollectionState: new Map(),
  mockChatState: new Map(),
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

vi.mock('@/modules/chat/collections', () => ({
  chatCollection: {
    state: mockChatState,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  },
}))

vi.mock('@/providers/query-provider', () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}))

const mockUUIDs = ['uuid-1', 'uuid-2', 'uuid-3', 'uuid-4', 'uuid-5', 'uuid-6']
let uuidIndex = 0
vi.stubGlobal('crypto', {
  randomUUID: () => mockUUIDs[uuidIndex++ % mockUUIDs.length],
})

// Import after mocks
import { contactOps, setContactsDatabaseGetter } from './collections'

function seedGroupContact(groupId = 'group-1', chatId = 'chat-1') {
  mockCollectionState.set(groupId, {
    id: groupId,
    name: 'Test Group',
    rdfType: ContactClass.GROUP,
    contactType: ContactType.SOLID,
    entityUri: `/.data/chat/${chatId}/index.ttl#this`,
  })
}

describe('CP1: createGroupWithChat', () => {
  beforeEach(() => {
    uuidIndex = 0
    vi.clearAllMocks()
    mockCollectionState.clear()
    mockChatState.clear()
    setContactsDatabaseGetter(() => mockDb as any)
  })

  afterEach(() => {
    setContactsDatabaseGetter(() => null)
  })

  it('should create group + chat when >= 2 members', async () => {
    const result = await contactOps.createGroupWithChat({
      name: 'Test Group',
      participants: ['member-1', 'member-2'],
    })

    expect(result.id).toBeDefined()
    expect(result.chatId).toBeDefined()
    expect(result.name).toBe('Test Group')
    expect(result.contactType).toBe(ContactType.SOLID)
    expect(result.rdfType).toBe(ContactClass.GROUP)
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
    expect(mockInsert).toHaveBeenCalledTimes(1)
  })

  it('should include ownerRef in participants and metadata', async () => {
    const ownerRef = 'https://me.example/profile/card#me'
    const participantRef = 'https://alice.example/profile/card#me'

    await contactOps.createGroupWithChat({
      name: 'Owner Group',
      participants: [participantRef],
      ownerRef,
    })

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Owner Group',
      participants: expect.arrayContaining([participantRef, ownerRef]),
      metadata: {
        memberRoles: {
          [ownerRef]: 'owner',
        },
      },
    }))
  })

  it('should reject when fewer than 2 members', async () => {
    await expect(
      contactOps.createGroupWithChat({
        name: 'Too Small',
        participants: ['only-one'],
      }),
    ).rejects.toThrow('群组至少需要 2 名成员')
  })

  it('should allow any two participant URIs', async () => {
    const result = await contactOps.createGroupWithChat({
      name: 'Mixed Participants',
      participants: ['human-1', 'ai-1'],
    })

    expect(result.name).toBe('Mixed Participants')
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
    expect(mockInsert).toHaveBeenCalledTimes(1)
  })

  it('should count ownerRef toward the minimum member count', async () => {
    const result = await contactOps.createGroupWithChat({
      name: 'Owner Plus One',
      participants: ['https://alice.example/profile/card#me'],
      ownerRef: 'https://me.example/profile/card#me',
    })

    expect(result.name).toBe('Owner Plus One')
    expect(mockInsert).toHaveBeenCalledTimes(1)
  })
})

describe('CP1: updateMemberRole', () => {
  beforeEach(() => {
    uuidIndex = 0
    vi.clearAllMocks()
    mockCollectionState.clear()
    mockChatState.clear()
  })

  it('should update role in chat metadata', async () => {
    // Set up a group chat with participants
    seedGroupContact()
    mockChatState.set('chat-1', {
      id: 'chat-1',
      participants: ['https://pod.example/profile/member-a#me', 'https://pod.example/profile/member-b#me'],
      metadata: null,
    })

    await contactOps.updateMemberRole('group-1', 'https://pod.example/profile/member-a#me', 'admin')

    expect(mockUpdate).toHaveBeenCalledWith('chat-1', expect.any(Function))
  })

  it('should write member role into metadata object', async () => {
    seedGroupContact()
    mockChatState.set('chat-1', {
      id: 'chat-1',
      participants: ['https://pod.example/profile/member-a#me'],
      metadata: null,
    })

    await contactOps.updateMemberRole('group-1', 'https://pod.example/profile/member-a#me', 'admin')

    expect(mockUpdate).toHaveBeenCalledWith('chat-1', expect.any(Function))

    const updater = mockUpdate.mock.calls[0]?.[1] as ((draft: any) => void) | undefined
    const draft = {
      metadata: null,
      participants: ['https://pod.example/profile/member-a#me'],
    }
    updater?.(draft)

    expect(draft.metadata).toEqual({
      memberRoles: {
        'https://pod.example/profile/member-a#me': 'admin',
      },
    })
  })

  it('should throw if member is not in the group', async () => {
    seedGroupContact()
    mockChatState.set('chat-1', {
      id: 'chat-1',
      participants: ['https://pod.example/profile/member-a#me'],
    })

    await expect(
      contactOps.updateMemberRole('group-1', 'https://pod.example/profile/not-a-member#me', 'admin'),
    ).rejects.toThrow('is not a member')
  })

  it('should throw if no chat found for group', async () => {
    mockCollectionState.clear()
    mockChatState.clear()

    await expect(
      contactOps.updateMemberRole('missing-group', 'https://pod.example/profile/member-a#me', 'admin'),
    ).rejects.toThrow('No chat found')
  })
})

describe('CP1: getGroupMemberRoles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCollectionState.clear()
    mockChatState.clear()
  })

  it('should return role map from chat metadata', () => {
    seedGroupContact()
    mockChatState.set('chat-1', {
      id: 'chat-1',
      participants: ['https://pod.example/profile/m-1#me', 'https://pod.example/profile/m-2#me'],
      metadata: {
        memberRoles: {
          'https://pod.example/profile/m-1#me': 'admin',
          'https://pod.example/profile/m-2#me': 'member',
        },
      },
    })

    const roles = contactOps.getGroupMemberRoles('group-1')

    expect(roles).toEqual({
      'https://pod.example/profile/m-1#me': 'admin',
      'https://pod.example/profile/m-2#me': 'member',
    })
  })

  it('should return empty object when no metadata', () => {
    seedGroupContact()
    mockChatState.set('chat-1', {
      id: 'chat-1',
      participants: ['https://pod.example/profile/m-1#me'],
    })

    const roles = contactOps.getGroupMemberRoles('group-1')

    expect(roles).toEqual({})
  })

  it('should return empty object when no chat found', () => {
    mockChatState.clear()

    const roles = contactOps.getGroupMemberRoles('/.data/contacts/no-group.ttl')

    expect(roles).toEqual({})
  })
})

describe('CP1: getGroupMembers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCollectionState.clear()
    mockChatState.clear()
  })

  it('should merge chat participants with owner refs from metadata', () => {
    seedGroupContact()
    mockChatState.set('chat-1', {
      id: 'chat-1',
      participants: ['https://pod.example/profile/m-1#me'],
      metadata: {
        memberRoles: {
          'https://pod.example/profile/owner#me': 'owner',
        },
      },
    })

    expect(contactOps.getGroupMembers('group-1')).toEqual([
      'https://pod.example/profile/m-1#me',
      'https://pod.example/profile/owner#me',
    ])
  })
})

describe('CP1: resolveMembers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCollectionState.clear()
  })

  it('should resolve member IDs to ContactRow objects', () => {
    mockCollectionState.set('c-1', { id: 'c-1', name: 'Alice', entityUri: 'https://pod.example/profile/c-1#me' })
    mockCollectionState.set('c-2', { id: 'c-2', name: 'Bob', entityUri: 'https://pod.example/profile/c-2#me' })
    mockCollectionState.set('c-3', { id: 'c-3', name: 'Charlie', entityUri: 'https://pod.example/profile/c-3#me' })

    const result = contactOps.resolveMembers([
      'https://pod.example/profile/c-1#me',
      'https://pod.example/profile/c-3#me',
    ])

    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Alice')
    expect(result[1].name).toBe('Charlie')
  })

  it('should skip unknown IDs', () => {
    mockCollectionState.set('c-1', { id: 'c-1', name: 'Alice', entityUri: 'https://pod.example/profile/c-1#me' })

    const result = contactOps.resolveMembers(['https://pod.example/profile/c-1#me', 'unknown'])

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Alice')
  })

  it('should resolve member entity URIs back to contacts', () => {
    mockCollectionState.set('c-1', {
      id: 'c-1',
      entityUri: 'https://pod.example/profile/c-1#me',
      name: 'Alice',
    })
    mockCollectionState.set('c-2', {
      id: 'c-2',
      entityUri: 'https://pod.example/profile/c-2#me',
      name: 'Bob',
    })

    const result = contactOps.resolveMembers([
      'https://pod.example/profile/c-1#me',
      'https://pod.example/profile/c-2#me',
    ])

    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Alice')
    expect(result[1].name).toBe('Bob')
  })

  it('should return empty array for empty input', () => {
    const result = contactOps.resolveMembers([])
    expect(result).toEqual([])
  })
})
