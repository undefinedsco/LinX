import { create } from 'zustand'
import type { SettingsSectionId } from '../domain/section-model'

export type { SettingsSectionId } from '../domain/section-model'

interface SettingsStore {
  selectedSection: SettingsSectionId
  /** Narrow windows show one level at a time: the section list, or one section. */
  compactLevel: 'list' | 'section'
  selectSection: (section: SettingsSectionId) => void
  showSectionList: () => void
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  selectedSection: 'general',
  compactLevel: 'list',
  selectSection: (selectedSection) => set({ selectedSection, compactLevel: 'section' }),
  showSectionList: () => set({ compactLevel: 'list' }),
}))
