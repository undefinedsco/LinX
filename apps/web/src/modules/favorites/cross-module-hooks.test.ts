/**
 * Cross-Module Hooks Integration Tests
 *
 * Tests that chat and contacts modules correctly call
 * favoriteHooks.onStarredChange when toggling starred status.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================================================
// Mock Setup
// ============================================================================

const mockFavoriteOnStarredChange = vi.fn()

vi.mock('@/modules/favorites/collections', () => ({
  favoriteHooks: {
    onStarredChange: (...args: unknown[]) => mockFavoriteOnStarredChange(...args),
  },
}))

// Shared collection mock primitives
const { mockCollectionState, mockInsert, mockUpdate, mockDelete, mockFetch, mockSubscribeToPod, mockGet } = vi.hoisted(() => ({
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
  mockGet: vi.fn((id: string) => mockCollectionState.get(id) ?? null),
}))

vi.mock('@/lib/data/pod-collection', () => ({
  createPodCollection: vi.fn(() => ({
    state: mockCollectionState,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    get: mockGet,
    fetch: mockFetch,
    subscribeToPod: mockSubscribeToPod,
  })),
}))

vi.mock('@/providers/query-provider', () => ({
  queryClient: { invalidateQueries: vi.fn() },
}))

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => ({ db: null }),
}))

vi.mock('@undefineds.co/models', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@undefineds.co/models')>()
  const mockResource = {
    buildId: ({ id }: { id: string }) => id,
  }
  return {
    ...actual,
    chatResource: mockResource,
    threadResource: mockResource,
    workspaceResource: mockResource,
    messageResource: mockResource,
    agentResource: mockResource,
    contactResource: mockResource,
    credentialResource: mockResource,
    solidProfileResource: mockResource,
    favoriteResource: mockResource,
    eq: vi.fn(),
    getBuiltinProvider: vi.fn(),
  }
})

vi.mock('@undefineds.co/drizzle-solid', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@undefineds.co/drizzle-solid')>()
  return {
    ...actual,
    like: vi.fn(),
    or: vi.fn(),
  }
})

// ============================================================================
// Imports (after mocks)
// ============================================================================

import { chatOps } from '@/modules/chat/collections'
import { contactOps } from '@/modules/contacts/collections'

// ============================================================================
// Tests
// ============================================================================

describe('Cross-Module Hooks: Chat -> Favorites', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCollectionState.clear()
  })

  it('chatOps.toggleChatStar calls favoriteHooks.onStarredChange with starred=true', async () => {
    mockCollectionState.set('chat-1', {
      id: 'chat-1',
      title: 'My Chat',
      lastMessagePreview: 'Hello',
      starred: false,
    })

    await chatOps.toggleChatStar('chat-1', false)

    expect(mockFavoriteOnStarredChange).toHaveBeenCalledWith(
      'chat',
      'chat-1',
      true,
      expect.objectContaining({ title: 'My Chat' }),
    )
  })

  it('chatOps.toggleChatStar calls favoriteHooks.onStarredChange with starred=false', async () => {
    mockCollectionState.set('chat-2', {
      id: 'chat-2',
      title: 'Starred Chat',
      starred: true,
    })

    await chatOps.toggleChatStar('chat-2', true)

    expect(mockFavoriteOnStarredChange).toHaveBeenCalledWith(
      'chat',
      'chat-2',
      false,
      expect.objectContaining({ title: 'Starred Chat' }),
    )
  })
})

describe('Cross-Module Hooks: Contacts -> Favorites', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCollectionState.clear()
  })

  it('contactOps.toggleStar calls favoriteHooks.onStarredChange with starred=true', async () => {
    mockCollectionState.set('contact-1', {
      id: 'contact-1',
      name: 'Alice',
      note: 'Friend',
      starred: false,
    })

    await contactOps.toggleStar('contact-1', false)

    expect(mockFavoriteOnStarredChange).toHaveBeenCalledWith(
      'contacts',
      'contact-1',
      true,
      expect.objectContaining({ title: 'Alice' }),
    )
  })

  it('contactOps.toggleStar calls favoriteHooks.onStarredChange with starred=false', async () => {
    mockCollectionState.set('contact-2', {
      id: 'contact-2',
      name: 'Bob',
      starred: true,
    })

    await contactOps.toggleStar('contact-2', true)

    expect(mockFavoriteOnStarredChange).toHaveBeenCalledWith(
      'contacts',
      'contact-2',
      false,
      expect.objectContaining({ title: 'Bob' }),
    )
  })
})
