import { create } from 'zustand'

interface AiConnectionsUIState {
  selectedProviderId: string | null
  search: string
  setSelectedProviderId: (id: string | null) => void
  setSearch: (value: string) => void
}

export const useAiConnectionsStore = create<AiConnectionsUIState>((set) => ({
  selectedProviderId: 'openai',
  search: '',
  setSelectedProviderId: (id) => set({ selectedProviderId: id }),
  setSearch: (value) => set({ search: value }),
}))
