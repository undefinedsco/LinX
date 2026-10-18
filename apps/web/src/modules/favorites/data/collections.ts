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

  /** Puts a just-removed favorite back (撤销). Only the bookmark; never touches the original. */
  async restoreFavorite(row: FavoriteRow): Promise<void> {
    if (favoriteCollection.state.has(row.id)) return
    const tx = favoriteCollection.insert({ ...row, updatedAt: new Date() } as FavoriteRow)
    await tx.isPersisted.promise
  },
}

// ============================================================================
// Favorite Hooks — cross-module starred change reporting
// ============================================================================

export interface StarredChangeMetadata {
  /** Optional for messages: falls back to the text snippet. */
  title?: string
  searchText?: string
  snapshotContent?: string
  snapshotAuthor?: string
  /** Pre-serialised scene meta (JSON string) or an object; merged with chatId/threadId below. */
  snapshotMeta?: string | Record<string, unknown>
  /** Where a single message lives, so 「在会话中查看」 can jump back. All optional. */
  chatId?: string
  chatTitle?: string
  threadId?: string
  /** Aliases accepted from the message toolbar. */
  snippet?: string
  authorName?: string
}

function serializeSnapshotMeta(metadata?: StarredChangeMetadata): string | undefined {
  if (!metadata) return undefined
  let base: Record<string, unknown> = {}
  if (typeof metadata.snapshotMeta === 'string') {
    try {
      const parsed = JSON.parse(metadata.snapshotMeta)
      if (parsed && typeof parsed === 'object') base = parsed as Record<string, unknown>
    } catch {
      return metadata.snapshotMeta
    }
  } else if (metadata.snapshotMeta) {
    base = { ...metadata.snapshotMeta }
  }
  if (metadata.chatId) base.chatId = metadata.chatId
  if (metadata.chatTitle) base.chatTitle = metadata.chatTitle
  if (metadata.threadId) base.threadId = metadata.threadId
  return Object.keys(base).length > 0 ? JSON.stringify(base) : undefined
}

function snippetTitle(text?: string): string | undefined {
  const t = text?.replace(/\s+/gu, ' ').trim()
  return t ? t.slice(0, 40) : undefined
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
    const content = metadata?.snapshotContent ?? metadata?.snippet
    const author = metadata?.snapshotAuthor ?? metadata?.authorName
    const title = metadata?.title ?? snippetTitle(content)
    const snapshotMeta = serializeSnapshotMeta(metadata)
    // Check if already exists (by sourceModule + sourceId)
    const existing = Array.from(favoriteCollection.state.values()).map(normalizeFavoriteRow).find(
      (f: FavoriteRow) => f.sourceModule === sourceModule && f.sourceId === sourceId,
    )

    if (existing) {
      // Update existing favorite with fresh metadata
      const tx = favoriteCollection.update(existing.id, (draft: any) => {
        if (title) draft.title = title
        if (metadata?.searchText) draft.searchText = metadata.searchText
        if (content) draft.snapshotContent = content
        if (author) draft.snapshotAuthor = author
        if (snapshotMeta) draft.snapshotMeta = snapshotMeta
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
        title: title ?? (sourceModule === 'messages' ? '消息' : sourceId),
        sourceModule,
        sourceId,
        searchText: metadata?.searchText ?? content ?? title ?? sourceId,
        snapshotContent: content,
        snapshotAuthor: author,
        snapshotMeta,
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

  return { ...query, data }
}

export function useFavoriteMutations() {
  const removeFavorite = useMutation({
    mutationFn: (id: string) => favoriteOps.removeFavorite(id),
  })
  const restoreFavorite = useMutation({
    mutationFn: (row: FavoriteRow) => favoriteOps.restoreFavorite(row),
  })
  return { removeFavorite, restoreFavorite }
}

export { useFavoriteSourceStatus } from './source-status'
