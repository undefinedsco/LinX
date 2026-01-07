import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type SolidLoginMode = 'auto' | 'loading' | 'switch'

export interface CustomIssuerDraft {
  value: string
  isValid: boolean
  error?: string
}

export interface SolidAccountPreview {
  displayName?: string
  handle?: string
  issuerDomain?: string
  issuerLabel?: string
  avatarUrl?: string
  isRecent?: boolean
  issuerLogoUrl?: string
}

export interface SolidLoginState {
  mode: SolidLoginMode
  showModal: boolean
  isRestoringSession: boolean
  hasCachedSession: boolean
  selectedIssuer?: string
  customIssuer: CustomIssuerDraft
  errorMessage: string | null
  accountPreview?: SolidAccountPreview
  storedAccount?: SolidAccountPreview
  setMode: (mode: SolidLoginMode) => void
  setShowModal: (value: boolean) => void
  setRestoringSession: (value: boolean) => void
  setHasCachedSession: (value: boolean) => void
  setSelectedIssuer: (value: string | undefined) => void
  setCustomIssuer: (draft: CustomIssuerDraft) => void
  resetCustomIssuer: (value?: string) => void
  setErrorMessage: (message: string | null) => void
  setAccountPreview: (preview: SolidAccountPreview | undefined) => void
  setStoredAccount: (preview: SolidAccountPreview | undefined) => void
}

const createEmptyDraft = (value = ''): CustomIssuerDraft => ({
  value,
  isValid: false,
})

export const useSolidLoginStore = create<SolidLoginState>()(
  persist(
    (set) => ({
      mode: 'switch',
      showModal: false,
      isRestoringSession: false,
      hasCachedSession: false,
      selectedIssuer: undefined,
      customIssuer: createEmptyDraft(),
      errorMessage: null,
      accountPreview: undefined,
      storedAccount: undefined,
      setMode: (mode) => set({ mode }),
      setShowModal: (value) => set({ showModal: value }),
      setRestoringSession: (value) => set({ isRestoringSession: value }),
      setHasCachedSession: (value) => set({ hasCachedSession: value }),
      setSelectedIssuer: (value) => set({ selectedIssuer: value }),
      setCustomIssuer: (draft) => set({ customIssuer: draft }),
      resetCustomIssuer: (value) => set({ customIssuer: createEmptyDraft(value) }),
      setErrorMessage: (message) => set({ errorMessage: message }),
      setAccountPreview: (preview) => set({ accountPreview: preview }),
      setStoredAccount: (preview) => set({ storedAccount: preview }),
    }),
    {
      name: 'linx-solid-login',
      storage: createJSONStorage(createSafeStorage),
      partialize: (state) => ({ storedAccount: state.storedAccount }),
    },
  ),
)

function createSafeStorage(): Storage {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }

  const memory: Record<string, string> = {}
  return {
    getItem: (key: string) => (key in memory ? memory[key] : null),
    setItem: (key: string, value: string) => {
      memory[key] = value
    },
    removeItem: (key: string) => {
      delete memory[key]
    },
    clear: () => {
      Object.keys(memory).forEach((key) => delete memory[key])
    },
    key: (index: number) => Object.keys(memory)[index] ?? null,
    get length() {
      return Object.keys(memory).length
    },
  } as Storage
}
