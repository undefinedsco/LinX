import { create } from 'zustand'

export type SettingsSectionId = 'general' | 'updates' | 'runtime' | 'network'

interface SettingsStore {
  selectedSection: SettingsSectionId
  selectSection: (section: SettingsSectionId) => void
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  selectedSection: 'general',
  selectSection: (selectedSection) => set({ selectedSection }),
}))
