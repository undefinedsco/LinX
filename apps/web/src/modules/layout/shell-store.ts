import { create } from 'zustand'

/**
 * Shell-owned dialogs that pages can ask for (e.g. 退出登录 from the narrow
 * 我 page). Pure UI state; nothing here is persisted.
 */
interface ShellStore {
  signOutOpen: boolean
  setSignOutOpen: (open: boolean) => void
}

export const useShellStore = create<ShellStore>((set) => ({
  signOutOpen: false,
  setSignOutOpen: (signOutOpen) => set({ signOutOpen }),
}))
