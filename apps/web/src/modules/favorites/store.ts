import { create } from 'zustand'
import type { SourceModule } from '@undefineds.co/models'

export type SourceFilter = 'all' | SourceModule

interface FavoriteStore {
  selectedFavoriteId: string | null
  searchText: string
  sourceFilter: SourceFilter

  select: (id: string | null) => void
  setSearchText: (val: string) => void
  setSourceFilter: (filter: SourceFilter) => void
}

export const useFavoriteStore = create<FavoriteStore>((set) => ({
  selectedFavoriteId: null,
  searchText: '',
  sourceFilter: 'all',

  select: (id) => set({ selectedFavoriteId: id }),
  setSearchText: (searchText) => set({ searchText }),
  setSourceFilter: (sourceFilter) => set({ sourceFilter }),
}))
