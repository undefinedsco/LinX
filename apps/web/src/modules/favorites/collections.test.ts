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

const {
  mockCollectionState,
  mockInsert,
  mockUpdate,
  mockDelete,
  mockFetch,
  mockSubscribeToPod,
  mockCollectionOptions,
} = vi.hoisted(() => ({
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
  mockSubscribeToPod: vi.fn().mockResolvedValue(() => undefined),
  mockCollectionOptions: {} as Record<string, any>,
}))

vi.mock('@/lib/data/pod-collection', () => ({
  createPodCollection: vi.fn((options: Record<string, any>) => {
    Object.assign(mockCollectionOptions, options)
    return {
      state: mockCollectionState,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
      fetch: mockFetch,
      subscribeToPod: mockSubscribeToPod,
    }
  }),
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
  favoriteHooks,
  favoriteOps,
  setFavoritesDatabaseGetter,
} from './collections'
import { queryClient } from '@/providers/query-provider'

// ============================================================================
// Tests
// ============================================================================

describe('favoriteHooks.onStarredChange', () => {
  beforeEach(() => {
    uuidIndex = 0
    vi.clearAllMocks()
    mockCollectionState.clear()
  })

  afterEach(() => {
    setFavoritesDatabaseGetter(() => null)
  })

  describe('starred = true (upsert)', () => {
    it('should insert a new favorite when none exists for sourceModule+sourceId', async () => {
      await favoriteHooks.onStarredChange('chat', 'chat-1', true, {
        title: 'Test Chat',
        searchText: 'Test Chat search',
        snapshotContent: 'Last message preview',
      })

      expect(mockInsert).toHaveBeenCalledTimes(1)
      const insertedData = mockInsert.mock.calls[0][0]
      expect(insertedData.id).toBe('fav-uuid-1')
      expect(insertedData.targetType).toBe('http://schema.org/CreativeWork')
      expect(insertedData.target).toBe('chat-1')
      expect(insertedData.targetUri).toBe('chat-1')
      expect(insertedData.sourceModule).toBe('chat')
      expect(insertedData.sourceId).toBe('chat-1')
      expect(insertedData.title).toBe('Test Chat')
      expect(insertedData.searchText).toBe('Test Chat search')
      expect(insertedData.snapshotContent).toBe('Last message preview')
      expect(insertedData.favoredAt).toBeInstanceOf(Date)

      expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
    })

    it('should update existing favorite when one already exists', async () => {
      // Pre-populate state with an existing favorite
      mockCollectionState.set('existing-fav', {
        id: 'existing-fav',
        sourceModule: 'chat',
        sourceId: 'chat-1',
        title: 'Old Title',
      })

      await favoriteHooks.onStarredChange('chat', 'chat-1', true, {
        title: 'Updated Title',
        snapshotContent: 'New content',
      })

      expect(mockInsert).not.toHaveBeenCalled()
      expect(mockUpdate).toHaveBeenCalledTimes(1)
      expect(mockUpdate).toHaveBeenCalledWith('existing-fav', expect.any(Function))

      expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
    })

    it('should use sourceId as fallback title when metadata.title is missing', async () => {
      await favoriteHooks.onStarredChange('contacts', 'contact-1', true)

      expect(mockInsert).toHaveBeenCalledTimes(1)
      const insertedData = mockInsert.mock.calls[0][0]
      expect(insertedData.title).toBe('contact-1')
      expect(insertedData.searchText).toBe('contact-1')
      expect(insertedData.targetType).toBe('http://schema.org/CreativeWork')
    })
  })

  describe('starred = false (delete)', () => {
    it('should delete the favorite matching sourceModule+sourceId', async () => {
      mockCollectionState.set('fav-to-delete', {
        id: 'fav-to-delete',
        sourceModule: 'chat',
        sourceId: 'chat-1',
        title: 'Chat to unfavorite',
      })

      await favoriteHooks.onStarredChange('chat', 'chat-1', false)

      expect(mockDelete).toHaveBeenCalledTimes(1)
      expect(mockDelete).toHaveBeenCalledWith('fav-to-delete')

      expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
    })

    it('should do nothing if no matching favorite exists', async () => {
      mockCollectionState.clear()

      await favoriteHooks.onStarredChange('chat', 'nonexistent', false)

      expect(mockDelete).not.toHaveBeenCalled()
      expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
    })
  })
})

describe('favoriteOps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCollectionState.clear()
  })

  describe('getAll', () => {
    it('should return all favorites from collection state', () => {
      mockCollectionState.set('f1', { id: 'f1', title: 'Fav 1' })
      mockCollectionState.set('f2', { id: 'f2', title: 'Fav 2' })

      const result = favoriteOps.getAll()
      expect(result).toHaveLength(2)
    })

    it('normalizes legacy target fields from collection state', () => {
      mockCollectionState.set('legacy-favorite', {
        id: 'legacy-favorite',
        target: 'https://pod.example/report.md',
        title: 'Report',
      })

      expect(favoriteOps.getAll()).toEqual([
        expect.objectContaining({
          id: 'legacy-favorite',
          targetUri: 'https://pod.example/report.md',
          sourceId: 'https://pod.example/report.md',
        }),
      ])
    })

    it('should return empty array when no favorites', () => {
      const result = favoriteOps.getAll()
      expect(result).toEqual([])
    })
  })

  describe('getById', () => {
    it('should find favorite by id', () => {
      mockCollectionState.set('f1', { id: 'f1', title: 'Found', target: 'https://pod.example/file.md' })

      const result = favoriteOps.getById('f1')
      expect(result?.title).toBe('Found')
      expect(result?.targetUri).toBe('https://pod.example/file.md')
      expect(result?.sourceId).toBe('https://pod.example/file.md')
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
    })
  })

  describe('query-model wiring', () => {
    it('bounds the resident favorites window by favored time', () => {
      expect(mockCollectionOptions.window).toEqual({
        limit: 100,
        orderBy: [{ column: 'favoredAt', direction: 'desc' }],
        maxResidentPages: 3,
      })
    })

    it('keeps an absent database subscription lazy', async () => {
      setFavoritesDatabaseGetter(() => null)

      const unsubscribe = await favoriteOps.subscribeToPod()

      expect(mockSubscribeToPod).not.toHaveBeenCalled()
      expect(unsubscribe()).toBeUndefined()
    })

    it('delegates one physical subscription to the shared Pod collection', async () => {
      const db = { id: 'favorites-db' }
      const unsubscribe = vi.fn()
      mockSubscribeToPod.mockResolvedValueOnce(unsubscribe)
      setFavoritesDatabaseGetter(() => db as any)

      await expect(favoriteOps.subscribeToPod()).resolves.toBe(unsubscribe)
      expect(mockSubscribeToPod).toHaveBeenCalledOnce()
      expect(mockSubscribeToPod).toHaveBeenCalledWith(db)
    })

    it('normalizes legacy target fields through the collection projection', async () => {
      const [legacy] = mockCollectionOptions.transformRows([{
        id: 'legacy-favorite',
        target: 'https://pod.example/report.md',
        title: 'Report',
      }])

      expect(legacy).toEqual(expect.objectContaining({
        id: 'legacy-favorite',
        targetUri: 'https://pod.example/report.md',
        sourceId: 'https://pod.example/report.md',
      }))
    })
  })
})
