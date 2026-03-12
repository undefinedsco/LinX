import { create } from 'zustand'

export type InboxFilter = 'all' | 'pending' | 'audit'

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
