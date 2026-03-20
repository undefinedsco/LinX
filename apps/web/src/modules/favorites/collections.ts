/**
 * Favorites Module Collections
 *
 * TanStack DB collection for Favorite entities.
 * Provides reactive data management with Solid Pod persistence.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createPodCollection } from '@/lib/data/pod-collection'
import {
  favoriteTable,
  type FavoriteRow,
  type FavoriteInsert,
  type SourceModule,
} from '@linx/models'
import type { SolidDatabase } from '@linx/models'
import { queryClient } from '@/providers/query-provider'
import { useSolidDatabase } from '@/providers/solid-database-provider'

// ============================================================================
// Database Getter
// ============================================================================

let dbGetter: (() => SolidDatabase | null) | null = null

export function setFavoritesDatabaseGetter(getter: () => SolidDatabase | null) {
  dbGetter = getter
}

function getDb(): SolidDatabase | null {
  return dbGetter?.() ?? null
}

// ============================================================================
// Favorite Collection
// ============================================================================

export const favoriteCollection = createPodCollection<
  typeof favoriteTable,
  FavoriteRow,
  FavoriteInsert
>({
  table: favoriteTable,
  queryKey: ['favorites'],
  queryClient,
  getDb,
  orderBy: { column: 'favoredAt', direction: 'desc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Favorite item is missing id.')
    return item.id
  },
})

// ============================================================================
// Favorite Operations
// ============================================================================

export const favoriteOps = {
  getAll(): FavoriteRow[] {
    return Array.from(favoriteCollection.state.values())
  },

  getById(id: string): FavoriteRow | null {
    const items = Array.from(favoriteCollection.state.values())
    return items.find((f: FavoriteRow) => f.id === id) || null
  },

  async removeFavorite(id: string): Promise<void> {
    const tx = favoriteCollection.delete(id)
    await tx.isPersisted.promise
  },

  async fetchFavorites(): Promise<FavoriteRow[]> {
    return await favoriteCollection.fetch()
  },
}

// ============================================================================
// Favorite Hooks — cross-module starred change reporting
// ============================================================================

export interface StarredChangeMetadata {
  title: string
  searchText?: string
  snapshotContent?: string
  snapshotAuthor?: string
  snapshotMeta?: string
}

/**
 * Called by other modules when an entity's starred status changes.
 * starred=true  → upsert into favoriteCollection
 * starred=false → delete from favoriteCollection by sourceModule+sourceId
 */
async function onStarredChange(
  sourceModule: SourceModule,
  sourceId: string,
  starred: boolean,
  metadata?: StarredChangeMetadata,
): Promise<void> {
  if (starred) {
    // Check if already exists (by sourceModule + sourceId)
    const existing = Array.from(favoriteCollection.state.values()).find(
      (f: FavoriteRow) => f.sourceModule === sourceModule && f.sourceId === sourceId,
    )

    if (existing) {
      // Update existing favorite with fresh metadata
      const tx = favoriteCollection.update(existing.id, (draft: any) => {
        if (metadata?.title) draft.title = metadata.title
        if (metadata?.searchText) draft.searchText = metadata.searchText
        if (metadata?.snapshotContent) draft.snapshotContent = metadata.snapshotContent
        if (metadata?.snapshotAuthor) draft.snapshotAuthor = metadata.snapshotAuthor
        if (metadata?.snapshotMeta) draft.snapshotMeta = metadata.snapshotMeta
        draft.updatedAt = new Date()
      })
      await tx.isPersisted.promise
    } else {
      // Insert new favorite
      const data: FavoriteInsert = {
        id: crypto.randomUUID(),
        targetType: sourceModule,
        targetUri: sourceId,
        title: metadata?.title ?? sourceId,
        sourceModule,
        sourceId,
        searchText: metadata?.searchText ?? metadata?.title ?? sourceId,
        snapshotContent: metadata?.snapshotContent,
        snapshotAuthor: metadata?.snapshotAuthor,
        snapshotMeta: metadata?.snapshotMeta,
        favoredAt: new Date(),
        updatedAt: new Date(),
      }
      const tx = favoriteCollection.insert(data as FavoriteRow)
      await tx.isPersisted.promise
    }

    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.favorites })
  } else {
    // Find and delete by sourceModule + sourceId
    const target = Array.from(favoriteCollection.state.values()).find(
      (f: FavoriteRow) => f.sourceModule === sourceModule && f.sourceId === sourceId,
    )
    if (target) {
      const tx = favoriteCollection.delete(target.id)
      await tx.isPersisted.promise
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.favorites })
    }
  }
}

/** Exported hooks object for other modules to call */
export const favoriteHooks = {
  onStarredChange,
}

// ============================================================================
// Initialization
// ============================================================================

export function initializeFavoriteCollections(db: SolidDatabase | null) {
  setFavoritesDatabaseGetter(() => db)
}

// ============================================================================
// React Query Hooks
// ============================================================================

const QUERY_KEYS = {
  favorites: ['favorites'] as const,
}

export function useFavoriteInit() {
  const { db } = useSolidDatabase()
  return { db, isReady: !!db }
}

export function useFavoriteList(filters?: {
  search?: string
  sourceModule?: SourceModule
}) {
  const db = getDb()
  return useQuery({
    queryKey: [
      ...QUERY_KEYS.favorites,
      filters?.search || '',
      filters?.sourceModule || '',
    ],
    queryFn: async () => {
      if (!db) return []
      let rows = await favoriteOps.fetchFavorites()

      // Client-side filter by sourceModule
      if (filters?.sourceModule) {
        rows = rows.filter((r) => r.sourceModule === filters.sourceModule)
      }

      // Client-side fuzzy search on searchText / title
      if (filters?.search?.trim()) {
        const q = filters.search.trim().toLowerCase()
        rows = rows.filter(
          (r) =>
            r.searchText?.toLowerCase().includes(q) ||
            r.title?.toLowerCase().includes(q) ||
            r.snapshotContent?.toLowerCase().includes(q) ||
            r.snapshotAuthor?.toLowerCase().includes(q)
        )
      }

      return rows
    },
    enabled: !!db,
  })
}

export function useFavoriteMutations() {
  const qc = useQueryClient()

  const removeFavorite = useMutation({
    mutationFn: (id: string) => favoriteOps.removeFavorite(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.favorites })
    },
  })

  return { removeFavorite }
}
