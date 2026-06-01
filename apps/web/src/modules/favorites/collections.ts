/**
 * Favorites Module Collections
 *
 * TanStack DB collection for Favorite entities.
 * Provides reactive data management with Solid Pod persistence.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createPodCollection } from '@/lib/data/pod-collection'
import { createLinxPodSyncScope, type LinxSyncOperationKind, type LinxSyncRunResult } from '@linx/agent-runtime/sync'
import {
  favoriteTable,
  MEETING,
  SCHEMA,
  SIOC,
  type FavoriteRow,
  type FavoriteInsert,
  type SourceModule,
  VCARD,
} from '@undefineds.co/models'
import type { SolidDatabase } from '@undefineds.co/models'
import { queryClient } from '@/providers/query-provider'
import { useSolidDatabase } from '@/providers/solid-database-provider'

// ============================================================================
// Database Getter
// ============================================================================

let dbGetter: (() => SolidDatabase | null) | null = null
const favoriteOpsSync = createLinxPodSyncScope({ source: 'app-favorites' })

export function setFavoritesDatabaseGetter(getter: () => SolidDatabase | null) {
  dbGetter = getter
}

export function getFavoriteOpsSyncResults(): LinxSyncRunResult[] {
  return favoriteOpsSync.getResults()
}

export function clearFavoriteOpsSyncResults(): void {
  favoriteOpsSync.clearResults()
}

function getDb(): SolidDatabase | null {
  return dbGetter?.() ?? null
}

async function runFavoriteDomainSync<T>(
  input: {
    action: string
    kind: LinxSyncOperationKind
    favoriteId?: string
    sourceModule?: SourceModule
    localTarget?: string
    target?: string
    targetType?: string
    starred?: boolean
  },
  operation: () => T | Promise<T>,
): Promise<T> {
  return favoriteOpsSync.run({
    action: input.action,
    kind: input.kind,
    description: `favorite-ops:${input.action}`,
    subject: input.favoriteId ?? input.localTarget ?? input.target,
    resourceBindings: (value) => ({
      favorite: {
        uri: readResultString(value, 'favoriteUri'),
        local: input.favoriteId ?? readResultString(value, 'favoriteId') ?? readResultString(value, 'id') ?? readResultString(value, 'localFavorite'),
      },
      target: {
        uri: input.target ?? readResultString(value, 'target'),
        local: input.localTarget
          ?? readResultString(value, 'targetLocal')
      },
    }),
    metadata: (value) => ({
      sourceModule: input.sourceModule ?? readResultString(value, 'sourceModule'),
      targetType: input.targetType ?? readResultString(value, 'targetType'),
      starred: input.starred,
    }),
    task: operation,
  })
}

function readResultString(value: unknown, key: string): string | undefined {
  return isRecord(value) && typeof value[key] === 'string' ? value[key] : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUri(value: string): boolean {
  return /^(https?:|urn:|\/)/.test(value)
}

function legacyFavoriteSource(favorite: FavoriteRow): string | undefined {
  return readResultString(favorite, 'sourceId')
}

function favoriteTargetMatches(favorite: FavoriteRow, sourceModule: SourceModule, target: string, localTarget: string): boolean {
  return favorite.sourceModule === sourceModule
    && (favorite.target === target || legacyFavoriteSource(favorite) === localTarget)
}

function resolveFavoriteTargetUri(sourceModule: SourceModule, target: string): string | null {
  if (isUri(target)) return target
  if (sourceModule === 'chat') return `/.data/chat/${encodeURIComponent(target)}/index.ttl#this`
  if (sourceModule === 'contacts') return `/.data/contacts/${encodeURIComponent(target)}.ttl`
  return null
}

function resolveFavoriteTargetType(sourceModule: SourceModule, metadata?: StarredChangeMetadata): string {
  if (metadata?.targetType) return metadata.targetType
  if (sourceModule === 'chat') return MEETING.LongChat
  if (sourceModule === 'thread') return SIOC.Thread
  if (sourceModule === 'messages') return MEETING.Message
  if (sourceModule === 'contacts') return VCARD.Individual
  if (sourceModule === 'files') return SCHEMA.MediaObject
  return SCHEMA.CreativeWork
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
    await runFavoriteDomainSync({
      action: 'favorite.remove',
      kind: 'delete',
      favoriteId: id,
    }, async () => {
      const tx = favoriteCollection.delete(id)
      await tx.isPersisted.promise
      return { favoriteId: id }
    })
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
  targetType?: string
  searchText?: string
  snapshotContent?: string
  snapshotAuthor?: string
  snapshotMeta?: string
}

/**
 * Called by other modules when an entity's starred status changes.
 * starred=true  → upsert into favoriteCollection
 * starred=false → delete from favoriteCollection by sourceModule+target
 */
async function onStarredChange(
  sourceModule: SourceModule,
  targetRef: string,
  starred: boolean,
  metadata?: StarredChangeMetadata,
): Promise<void> {
  const target = resolveFavoriteTargetUri(sourceModule, targetRef)
  const targetType = resolveFavoriteTargetType(sourceModule, metadata)
  await runFavoriteDomainSync({
    action: starred ? 'favorite.star' : 'favorite.unstar',
    kind: starred ? 'upsert' : 'delete',
    sourceModule,
    localTarget: targetRef,
    target: target ?? undefined,
    targetType,
    starred,
  }, async () => {
    if (starred) {
      if (!target) {
        throw new Error(`Cannot resolve favorite target URI for ${sourceModule}:${targetRef}`)
      }

      // Legacy sourceId is read-only compatibility for rows written before Favorite.target became canonical.
      const existing = Array.from(favoriteCollection.state.values()).find(
        (f: FavoriteRow) => favoriteTargetMatches(f, sourceModule, target, targetRef),
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
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.favorites })
        return {
          favoriteId: existing.id,
          favoriteUri: readResultString(existing, '@id') ?? readResultString(existing, 'subject'),
          target: existing.target,
          sourceModule,
          targetLocal: targetRef,
        }
      } else {
        // Insert new favorite
        const data: FavoriteInsert = {
          id: crypto.randomUUID(),
          targetType,
          target,
          title: metadata?.title ?? targetRef,
          sourceModule,
          searchText: metadata?.searchText ?? metadata?.title ?? targetRef,
          snapshotContent: metadata?.snapshotContent,
          snapshotAuthor: metadata?.snapshotAuthor,
          snapshotMeta: metadata?.snapshotMeta,
          favoredAt: new Date(),
          updatedAt: new Date(),
        }
        const tx = favoriteCollection.insert(data as FavoriteRow)
        await tx.isPersisted.promise
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.favorites })
        return { favoriteId: data.id, target, sourceModule, targetLocal: targetRef }
      }
    } else {
      // Legacy sourceId is read-only compatibility for old rows; new rows match by target.
      const target = Array.from(favoriteCollection.state.values()).find(
        (f: FavoriteRow) => favoriteTargetMatches(f, sourceModule, resolveFavoriteTargetUri(sourceModule, targetRef) ?? targetRef, targetRef),
      )
      if (target) {
        const tx = favoriteCollection.delete(target.id)
        await tx.isPersisted.promise
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.favorites })
        return {
          favoriteId: target.id,
          favoriteUri: readResultString(target, '@id') ?? readResultString(target, 'subject'),
          target: target.target,
          sourceModule,
          targetLocal: targetRef,
        }
      }
      return { sourceModule, targetLocal: targetRef }
    }
  })
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
