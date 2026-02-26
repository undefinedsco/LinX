/**
 * CP1 Group Operations Tests
 *
 * Tests for contactOps CP1 group CRUD: createGroupWithChat, updateMemberRole,
 * resolveMembers, and getGroupMemberRoles.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ContactType } from '@linx/models'

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
import { contactOps } from './collections'

describe('CP1: createGroupWithChat', () => {
  beforeEach(() => {
    uuidIndex = 0
    vi.clearAllMocks()
    mockCollectionState.clear()
    mockChatState.clear()
  })

  it('should create group + chat when >= 2 members', async () => {
    const result = await contactOps.createGroupWithChat({
      name: 'Test Group',
      memberIds: ['member-1', 'member-2'],
    })

    expect(result.id).toBeDefined()
    expect(result.chatId).toBeDefined()
    expect(result.name).toBe('Test Group')
    expect(result.contactType).toBe(ContactType.GROUP)
    // 2 inserts: contact + chat
    expect(mockInsert).toHaveBeenCalledTimes(2)
  })

  it('should reject when fewer than 2 members', async () => {
    await expect(
      contactOps.createGroupWithChat({
        name: 'Too Small',
        memberIds: ['only-one'],
      }),
    ).rejects.toThrow('群组至少需要 2 名成员')
  })

  it('should count AI assistants toward the 2-member minimum', async () => {
    const result = await contactOps.createGroupWithChat({
      name: 'Human + AI',
      memberIds: ['human-1'],
      aiAssistantIds: ['ai-1'],
    })

    expect(result.name).toBe('Human + AI')
    expect(mockInsert).toHaveBeenCalledTimes(2)
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
    mockChatState.set('chat-1', {
      id: 'chat-1',
      contact: 'group-1',
      participants: ['member-a', 'member-b'],
      metadata: null,
    })

    await contactOps.updateMemberRole('group-1', 'member-a', 'admin')

    expect(mockUpdate).toHaveBeenCalledWith('chat-1', expect.any(Function))
  })

  it('should throw if member is not in the group', async () => {
    mockChatState.set('chat-1', {
      id: 'chat-1',
      contact: 'group-1',
      participants: ['member-a'],
    })

    await expect(
      contactOps.updateMemberRole('group-1', 'not-a-member', 'admin'),
    ).rejects.toThrow('is not a member')
  })

  it('should throw if no chat found for group', async () => {
    mockChatState.clear()

    await expect(
      contactOps.updateMemberRole('no-group', 'member-a', 'admin'),
    ).rejects.toThrow('No chat found')
  })
})

describe('CP1: getGroupMemberRoles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChatState.clear()
  })

  it('should return role map from chat metadata', () => {
    mockChatState.set('chat-1', {
      id: 'chat-1',
      contact: 'group-1',
      participants: ['m-1', 'm-2'],
      metadata: { memberRoles: { 'm-1': 'admin', 'm-2': 'member' } },
    })

    const roles = contactOps.getGroupMemberRoles('group-1')

    expect(roles).toEqual({ 'm-1': 'admin', 'm-2': 'member' })
  })

  it('should return empty object when no metadata', () => {
    mockChatState.set('chat-1', {
      id: 'chat-1',
      contact: 'group-1',
      participants: ['m-1'],
    })

    const roles = contactOps.getGroupMemberRoles('group-1')

    expect(roles).toEqual({})
  })

  it('should return empty object when no chat found', () => {
    mockChatState.clear()

    const roles = contactOps.getGroupMemberRoles('no-group')

    expect(roles).toEqual({})
  })
})

describe('CP1: resolveMembers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCollectionState.clear()
  })

  it('should resolve member IDs to ContactRow objects', () => {
    mockCollectionState.set('c-1', { id: 'c-1', name: 'Alice' })
    mockCollectionState.set('c-2', { id: 'c-2', name: 'Bob' })
    mockCollectionState.set('c-3', { id: 'c-3', name: 'Charlie' })

    const result = contactOps.resolveMembers(['c-1', 'c-3'])

    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Alice')
    expect(result[1].name).toBe('Charlie')
  })

  it('should skip unknown IDs', () => {
    mockCollectionState.set('c-1', { id: 'c-1', name: 'Alice' })

    const result = contactOps.resolveMembers(['c-1', 'unknown'])

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Alice')
  })

  it('should return empty array for empty input', () => {
    const result = contactOps.resolveMembers([])
    expect(result).toEqual([])
  })
})
