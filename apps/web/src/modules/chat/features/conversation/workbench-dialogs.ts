import { create } from 'zustand'

/** Chat-scoped dialogs opened from 聊天信息 or the composer, hosted by the conversation. */
export type WorkbenchDialog =
  | 'project-context'
  | 'attachments'
  | 'artifacts'
  | 'assets'
  | 'share'
  | 'capture'
  | 'voice'

interface WorkbenchDialogState {
  active: WorkbenchDialog | null
  open: (dialog: WorkbenchDialog) => void
  close: () => void
}

export const useWorkbenchDialogs = create<WorkbenchDialogState>((set) => ({
  active: null,
  open: (dialog) => set({ active: dialog }),
  close: () => set({ active: null }),
}))
