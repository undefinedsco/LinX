import { create } from 'zustand'

export type ContactViewMode = 'view' | 'edit' | 'new-friends'
export type CreateContactType = 'agent' | 'friend'

interface ContactStore {
  // List State
  search: string
  setSearch: (val: string) => void
  
  // Selection & View State
  selectedId: string | null
  viewMode: ContactViewMode
  
  // Create Dialog State
  createDialogOpen: boolean
  createType: CreateContactType | null
  
  // New Friends badge count (mock)
  newFriendsCount: number
  
  // Actions
  select: (id: string | null) => void
  openCreateDialog: (type: CreateContactType) => void
  closeCreateDialog: () => void
  startEdit: () => void
  cancelEdit: () => void
  showNewFriends: () => void
  clearNewFriends: () => void
}

export const useContactStore = create<ContactStore>((set) => ({
  search: '',
  setSearch: (search) => set({ search }),
  
  selectedId: null,
  viewMode: 'view',
  createDialogOpen: false,
  createType: null,
  newFriendsCount: 2, // Mock: 2 new friend requests
  
  select: (id) => set({ selectedId: id, viewMode: 'view' }),
  openCreateDialog: (type) => set({ createDialogOpen: true, createType: type }),
  closeCreateDialog: () => set({ createDialogOpen: false, createType: null }),
  startEdit: () => set((state) => state.selectedId ? { viewMode: 'edit' } : {}),
  cancelEdit: () => set({ viewMode: 'view' }),
  showNewFriends: () => set({ viewMode: 'new-friends', selectedId: null }),
  clearNewFriends: () => set({ newFriendsCount: 0 }),
}))



