import { useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import type { FavoriteRow, SourceModule } from '@undefineds.co/models'

import {
  favoriteCollection,
  favoriteHooks,
  normalizeFavoriteRow,
} from '@/modules/favorites/collections'
import { subscribeFavoritesToPod } from '@/modules/favorites/runtime'
import { usePodCollectionSubscription } from '@/lib/data/use-pod-collection-subscription'
import { useSolidDatabase } from '@/providers/solid-database-provider'

export function useFilesFavoriteList(filters?: {
  sourceModule?: SourceModule
}) {
  const { db } = useSolidDatabase()
  // Star state is shared data owned by the favorites module: acquire its
  // subscription while this pane is visible so cross-module updates stay
  // live even when the favorites micro-app is not active.
  usePodCollectionSubscription(!!db, db, subscribeFavoritesToPod)

  const liveQuery = useLiveQuery((query) => (
    query.from({ favorite: favoriteCollection }).select(({ favorite }) => favorite)
  ))
  const sourceModule = filters?.sourceModule
  const data = useMemo(() => {
    const rows = ((liveQuery.data ?? []) as FavoriteRow[]).map(normalizeFavoriteRow)
    return sourceModule
      ? rows.filter((row) => row.sourceModule === sourceModule)
      : rows
  }, [liveQuery.data, sourceModule])

  return { ...liveQuery, data }
}

export const filesFavoriteHooks = favoriteHooks
