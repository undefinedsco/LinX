import { useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import type { FavoriteRow, SourceModule } from '@undefineds.co/models'

import {
  favoriteCollection,
  favoriteHooks,
  normalizeFavoriteRow,
} from '@/modules/favorites/collections'

export function useFilesFavoriteList(filters?: {
  sourceModule?: SourceModule
}) {
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
