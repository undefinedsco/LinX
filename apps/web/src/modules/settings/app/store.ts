import { create } from 'zustand'
import type { SettingsSectionId } from '../domain/section-model'

export type { SettingsSectionId } from '../domain/section-model'

interface SettingsStore {
  selectedSection: SettingsSectionId
  selectSection: (section: SettingsSectionId) => void
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  selectedSection: 'general',
  selectSection: (selectedSection) => set({ selectedSection }),
}))
