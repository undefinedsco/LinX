/**
 * Favorites Collections & favoriteHooks Tests
 *
 * Tests for favoriteHooks.onStarredChange (upsert / delete)
 * and cross-module hooks integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================================================
// Mock Setup (must be before imports)
// ============================================================================

const { mockCollectionState, mockInsert, mockUpdate, mockDelete, mockFetch } = vi.hoisted(() => ({
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
}))

vi.mock('@/lib/data/pod-collection', () => ({
  createPodCollection: vi.fn(() => ({
    state: mockCollectionState,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    fetch: mockFetch,
  })),
}))

vi.mock('@/providers/query-provider', () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}))

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => ({ db: null }),
}))

// Mock crypto.randomUUID
const mockUUIDs = ['fav-uuid-1', 'fav-uuid-2', 'fav-uuid-3', 'fav-uuid-4']
let uuidIndex = 0
vi.stubGlobal('crypto', {
  randomUUID: () => mockUUIDs[uuidIndex++ % mockUUIDs.length],
})

// ============================================================================
// Imports (after mocks)
// ============================================================================

import {
  clearFavoriteOpsSyncResults,
  favoriteHooks,
  favoriteOps,
  getFavoriteOpsSyncResults,
  setFavoritesDatabaseGetter,
} from './collections'
import { MEETING, SCHEMA, VCARD } from '@undefineds.co/models'
import { queryClient } from '@/providers/query-provider'

// ============================================================================
// Tests
// ============================================================================

describe('favoriteHooks.onStarredChange', () => {
  beforeEach(() => {
    uuidIndex = 0
    vi.clearAllMocks()
    mockCollectionState.clear()
    clearFavoriteOpsSyncResults()
  })

  afterEach(() => {
    setFavoritesDatabaseGetter(() => null)
  })

  describe('starred = true (upsert)', () => {
    it('should insert a new favorite when none exists for sourceModule+target', async () => {
      await favoriteHooks.onStarredChange('chat', 'chat-1', true, {
        title: 'Test Chat',
        searchText: 'Test Chat search',
        snapshotContent: 'Last message preview',
      })

      expect(mockInsert).toHaveBeenCalledTimes(1)
      const insertedData = mockInsert.mock.calls[0][0]
      expect(insertedData.id).toBe('fav-uuid-1')
      expect(insertedData.sourceModule).toBe('chat')
      expect(insertedData.sourceId).toBeUndefined()
      expect(insertedData.targetType).toBe(MEETING.LongChat)
      expect(insertedData.target).toBe('/.data/chat/chat-1/index.ttl#this')
      expect(insertedData.title).toBe('Test Chat')
      expect(insertedData.searchText).toBe('Test Chat search')
      expect(insertedData.snapshotContent).toBe('Last message preview')
      expect(insertedData.favoredAt).toBeInstanceOf(Date)

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['favorites'],
      })
      expect(getFavoriteOpsSyncResults()).toHaveLength(1)
      expect(getFavoriteOpsSyncResults()[0]).toMatchObject({
        source: 'app-favorites',
        target: 'pod',
        direction: 'local-to-core',
        plane: 'projection',
        authority: 'core',
        status: 'completed',
        metadata: {
          action: 'favorite.star',
          resourceBindings: {
            favorite: { local: 'fav-uuid-1' },
            target: {
              uri: '/.data/chat/chat-1/index.ttl#this',
              local: 'chat-1',
            },
          },
          sourceModule: 'chat',
          targetType: MEETING.LongChat,
          starred: true,
        },
      })
    })

    it('should update existing favorite when one already exists', async () => {
      // Pre-populate state with an existing favorite
      mockCollectionState.set('existing-fav', {
        id: 'existing-fav',
        sourceModule: 'chat',
        target: '/.data/chat/chat-1/index.ttl#this',
        title: 'Old Title',
      })

      await favoriteHooks.onStarredChange('chat', 'chat-1', true, {
        title: 'Updated Title',
        snapshotContent: 'New content',
      })

      expect(mockInsert).not.toHaveBeenCalled()
      expect(mockUpdate).toHaveBeenCalledTimes(1)
      expect(mockUpdate).toHaveBeenCalledWith('existing-fav', expect.any(Function))

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['favorites'],
      })
      expect(getFavoriteOpsSyncResults()).toHaveLength(1)
      expect(getFavoriteOpsSyncResults()[0]).toMatchObject({
        source: 'app-favorites',
        target: 'pod',
        direction: 'local-to-core',
        plane: 'projection',
        authority: 'core',
        status: 'completed',
        metadata: {
          action: 'favorite.star',
          resourceBindings: {
            favorite: { local: 'existing-fav' },
            target: {
              uri: '/.data/chat/chat-1/index.ttl#this',
              local: 'chat-1',
            },
          },
          sourceModule: 'chat',
          starred: true,
        },
      })
    })

    it('should use the local target as fallback title when metadata.title is missing', async () => {
      await favoriteHooks.onStarredChange('contacts', 'contact-1', true)

      expect(mockInsert).toHaveBeenCalledTimes(1)
      const insertedData = mockInsert.mock.calls[0][0]
      expect(insertedData.targetType).toBe(VCARD.Individual)
      expect(insertedData.title).toBe('contact-1')
      expect(insertedData.searchText).toBe('contact-1')
    })

    it('preserves explicit RDF target type from the caller', async () => {
      await favoriteHooks.onStarredChange('files', 'https://pod.example/public/README.md', true, {
        title: 'README.md',
        targetType: SCHEMA.MediaObject,
      })

      expect(mockInsert).toHaveBeenCalledTimes(1)
      const insertedData = mockInsert.mock.calls[0][0]
      expect(insertedData.targetType).toBe(SCHEMA.MediaObject)
      expect(insertedData.target).toBe('https://pod.example/public/README.md')
      expect(getFavoriteOpsSyncResults()[0]).toMatchObject({
        metadata: {
          resourceBindings: {
            target: {
              uri: 'https://pod.example/public/README.md',
              local: 'https://pod.example/public/README.md',
            },
          },
          targetType: SCHEMA.MediaObject,
        },
      })
    })
  })

  describe('starred = false (delete)', () => {
    it('should delete the favorite matching sourceModule+target', async () => {
      mockCollectionState.set('fav-to-delete', {
        id: 'fav-to-delete',
        sourceModule: 'chat',
        target: '/.data/chat/chat-1/index.ttl#this',
        title: 'Chat to unfavorite',
      })

      await favoriteHooks.onStarredChange('chat', 'chat-1', false)

      expect(mockDelete).toHaveBeenCalledTimes(1)
      expect(mockDelete).toHaveBeenCalledWith('fav-to-delete')

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['favorites'],
      })
      expect(getFavoriteOpsSyncResults()).toHaveLength(1)
      expect(getFavoriteOpsSyncResults()[0]).toMatchObject({
        source: 'app-favorites',
        target: 'pod',
        direction: 'local-to-core',
        plane: 'projection',
        authority: 'core',
        status: 'completed',
        metadata: {
          action: 'favorite.unstar',
          resourceBindings: {
            favorite: { local: 'fav-to-delete' },
            target: {
              uri: '/.data/chat/chat-1/index.ttl#this',
              local: 'chat-1',
            },
          },
          sourceModule: 'chat',
          starred: false,
        },
      })
    })

    it('should do nothing if no matching favorite exists', async () => {
      mockCollectionState.clear()

      await favoriteHooks.onStarredChange('chat', 'nonexistent', false)

      expect(mockDelete).not.toHaveBeenCalled()
      expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
      expect(getFavoriteOpsSyncResults()).toHaveLength(1)
      expect(getFavoriteOpsSyncResults()[0]).toMatchObject({
        source: 'app-favorites',
        target: 'pod',
        direction: 'local-to-core',
        plane: 'projection',
        authority: 'core',
        status: 'completed',
        metadata: {
          action: 'favorite.unstar',
          resourceBindings: {
            target: {
              uri: '/.data/chat/nonexistent/index.ttl#this',
              local: 'nonexistent',
            },
          },
          sourceModule: 'chat',
          starred: false,
        },
      })
    })
  })
})

describe('favoriteOps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCollectionState.clear()
    clearFavoriteOpsSyncResults()
  })

  describe('getAll', () => {
    it('should return all favorites from collection state', () => {
      mockCollectionState.set('f1', { id: 'f1', title: 'Fav 1' })
      mockCollectionState.set('f2', { id: 'f2', title: 'Fav 2' })

      const result = favoriteOps.getAll()
      expect(result).toHaveLength(2)
    })

    it('should return empty array when no favorites', () => {
      const result = favoriteOps.getAll()
      expect(result).toEqual([])
    })
  })

  describe('getById', () => {
    it('should find favorite by id', () => {
      mockCollectionState.set('f1', { id: 'f1', title: 'Found' })

      const result = favoriteOps.getById('f1')
      expect(result?.title).toBe('Found')
    })

    it('should return null if not found', () => {
      const result = favoriteOps.getById('nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('removeFavorite', () => {
    it('should call collection delete', async () => {
      await favoriteOps.removeFavorite('f1')
      expect(mockDelete).toHaveBeenCalledWith('f1')
      expect(getFavoriteOpsSyncResults()).toHaveLength(1)
      expect(getFavoriteOpsSyncResults()[0]).toMatchObject({
        source: 'app-favorites',
        target: 'pod',
        direction: 'local-to-core',
        plane: 'projection',
        authority: 'core',
        status: 'completed',
        metadata: {
          action: 'favorite.remove',
          resourceBindings: {
            favorite: { local: 'f1' },
          },
        },
      })
    })
  })
})
