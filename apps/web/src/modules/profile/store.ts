import { create } from 'zustand'

export type ProfileViewMode = 'view' | 'edit'

interface ProfileStore {
  // View State
  viewMode: ProfileViewMode
  
  // Edit State
  editingField: string | null  // Which field is being edited
  isSaving: boolean
  error: string | null
  
  // Actions
  startEdit: (field: string) => void
  cancelEdit: () => void
  setSaving: (saving: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useProfileStore = create<ProfileStore>((set) => ({
  viewMode: 'view',
  editingField: null,
  isSaving: false,
  error: null,
  
  startEdit: (field) => set({ 
    viewMode: 'edit', 
    editingField: field,
    error: null,
  }),
  
  cancelEdit: () => set({ 
    viewMode: 'view', 
    editingField: null,
    error: null,
  }),
  
  setSaving: (isSaving) => set({ isSaving }),
  
  setError: (error) => set({ error }),
  
  reset: () => set({
    viewMode: 'view',
    editingField: null,
    isSaving: false,
    error: null,
  }),
}))
