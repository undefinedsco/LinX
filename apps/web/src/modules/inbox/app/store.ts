import { create } from 'zustand'
import type { InboxFilter } from '../domain/utils'

export type { InboxFilter }

interface InboxStoreState {
  selectedItemId: string | null
  filter: InboxFilter
  selectItem: (id: string | null) => void
  setFilter: (filter: InboxFilter) => void
}

export const useInboxStore = create<InboxStoreState>((set) => ({
  selectedItemId: null,
  filter: 'all',
  selectItem: (selectedItemId) => set({ selectedItemId }),
  setFilter: (filter) => set({ filter }),
}))
