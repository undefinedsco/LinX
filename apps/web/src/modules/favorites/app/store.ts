import { create } from 'zustand'
import type { SourceModule } from '@undefineds.co/models'
import type { FavoriteGroupFilter } from '../domain/groups'

export type SourceFilter = 'all' | SourceModule

interface FavoriteStore {
  selectedFavoriteId: string | null
  searchText: string
  sourceFilter: SourceFilter
  group: FavoriteGroupFilter
  /** Right-hand preview column open (desktop widths). */
  previewOpen: boolean

  select: (id: string | null) => void
  setSearchText: (val: string) => void
  setSourceFilter: (filter: SourceFilter) => void
  setGroup: (group: FavoriteGroupFilter) => void
  setPreviewOpen: (open: boolean) => void
}

export const useFavoriteStore = create<FavoriteStore>((set) => ({
  selectedFavoriteId: null,
  searchText: '',
  sourceFilter: 'all',
  group: 'all',
  previewOpen: true,

  select: (id) => set({ selectedFavoriteId: id }),
  setSearchText: (searchText) => set({ searchText }),
  setSourceFilter: (sourceFilter) => set({ sourceFilter }),
  setGroup: (group) => set({ group }),
  setPreviewOpen: (previewOpen) => set({ previewOpen }),
}))
