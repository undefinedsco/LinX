import { create } from 'zustand'

interface ModelServicesUIState {
  selectedProviderId: string | null
  search: string
  setSelectedProviderId: (id: string | null) => void
  setSearch: (value: string) => void
}

export const useModelServicesStore = create<ModelServicesUIState>((set) => ({
  selectedProviderId: 'openai',
  search: '',
  setSelectedProviderId: (id) => set({ selectedProviderId: id }),
  setSearch: (value) => set({ search: value }),
}))
