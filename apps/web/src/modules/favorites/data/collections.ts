/**
 * Favorites Module Collections
 *
 * TanStack DB collection for Favorite entities.
 * Provides reactive data management with Solid Pod persistence.
 */

import { useLiveQuery } from '@tanstack/react-db'
import { useMutation } from '@tanstack/react-query'
import { useMemo } from 'react'
import { createPodCollection } from '@/lib/data/pod-collection'
import { createPodCollectionSnapshot } from '@/lib/data/collection-snapshots'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import {
  favoriteResource,
  SCHEMA,
  type FavoriteRow,
  type FavoriteInsert,
  type SourceModule,
} from '@undefineds.co/models'
import type { SolidDatabase } from '@undefineds.co/models'
import { queryClient } from '@/providers/query-provider'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { useCollectionQueryError } from '@/lib/data/use-collection-query-error'

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
  typeof favoriteResource,
  FavoriteRow,
  FavoriteInsert
>({
  resource: favoriteResource,
  queryKey: ['favorites'],
  queryClient,
  getDb,
  orderBy: { column: 'favoredAt', direction: 'desc' },
  window: {
    limit: 100,
    orderBy: [{ column: 'favoredAt', direction: 'desc' }],
    maxResidentPages: 3,
  },
  snapshot: createPodCollectionSnapshot<FavoriteRow>(() => {
    const db = getDb()
    return db ? resolveCurrentPodBaseUrl(db) : null
  }, ['favoredAt', 'createdAt', 'updatedAt']),
  transformRows: (rows) => rows.map(normalizeFavoriteRow),
  getKey: (item) => {
    if (!item.id) throw new Error('Favorite item is missing id.')
    return item.id
  },
})

// ============================================================================
// Favorite Operations
// ============================================================================

export function normalizeFavoriteRow(row: FavoriteRow): FavoriteRow {
  const target = (row as any).targetUri ?? (row as any).target ?? null
  if (!target) return row

  return {
    ...row,
    targetUri: target,
    sourceId: row.sourceId ?? target,
  } as FavoriteRow
}

export const favoriteOps = {
  async subscribeToPod(): Promise<() => void> {
    const db = getDb()
    if (!db) return () => {}
    return favoriteCollection.subscribeToPod(db)
  },

  getAll(): FavoriteRow[] {
    return Array.from(favoriteCollection.state.values()).map(normalizeFavoriteRow)
  },

  getById(id: string): FavoriteRow | null {
    const items = Array.from(favoriteCollection.state.values()).map(normalizeFavoriteRow)
    return items.find((f: FavoriteRow) => f.id === id) || null
  },

  async removeFavorite(id: string): Promise<void> {
    const tx = favoriteCollection.delete(id)
    await tx.isPersisted.promise
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

const FAVORITE_TARGET_TYPE_BY_SOURCE: Record<SourceModule, string> = {
  chat: SCHEMA.CreativeWork,
  contacts: SCHEMA.CreativeWork,
  files: SCHEMA.CreativeWork,
  messages: SCHEMA.CreativeWork,
  thread: SCHEMA.CreativeWork,
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
    const existing = Array.from(favoriteCollection.state.values()).map(normalizeFavoriteRow).find(
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
        targetType: FAVORITE_TARGET_TYPE_BY_SOURCE[sourceModule],
        target: sourceId,
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

  } else {
    // Find and delete by sourceModule + sourceId
    const target = Array.from(favoriteCollection.state.values()).map(normalizeFavoriteRow).find(
      (f: FavoriteRow) => f.sourceModule === sourceModule && f.sourceId === sourceId,
    )
    if (target) {
      const tx = favoriteCollection.delete(target.id)
      await tx.isPersisted.promise
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

export function useFavoriteInit() {
  const { db } = useSolidDatabase()
  return { db, isReady: !!db }
}

export function useFavoriteList(filters?: {
  search?: string
  sourceModule?: SourceModule
}) {
  const query = useLiveQuery(favoriteCollection)
  const queryError = useCollectionQueryError(favoriteCollection)
  const data = useMemo(() => {
    let rows = ((query.data ?? []) as FavoriteRow[]).map(normalizeFavoriteRow)
    if (filters?.sourceModule) {
      rows = rows.filter((row) => row.sourceModule === filters.sourceModule)
    }
    const term = filters?.search?.trim().toLowerCase()
    if (term) {
      rows = rows.filter((row) => [
        row.searchText,
        row.title,
        row.snapshotContent,
        row.snapshotAuthor,
      ].some((value) => value?.toLowerCase().includes(term)))
    }
    return rows
  }, [filters?.search, filters?.sourceModule, query.data])

  return {
    ...query,
    ...queryError,
    data,
    refetch: () => favoriteCollection.fetch({ refetch: true }),
  }
}

export function useFavoriteMutations() {
  const removeFavorite = useMutation({
    mutationFn: (id: string) => favoriteOps.removeFavorite(id),
  })
  return { removeFavorite }
}
