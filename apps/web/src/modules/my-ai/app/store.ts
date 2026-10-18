import { create } from 'zustand'

export type MyAISelection =
  | { kind: 'overview' }
  | { kind: 'method'; agentId: string }

interface MyAIStore {
  /**
   * Last assistant whose method was opened. Kept for callers that still read
   * it (contacts tests); the dialog itself is driven by `methodDialogAgentId`.
   */
  selection: MyAISelection
  /** Assistant whose working method is open in the shell dialog, if any. */
  methodDialogAgentId: string | null
  openMethodDialog: (agentId: string) => void
  closeMethodDialog: () => void
}

export const useMyAIStore = create<MyAIStore>((set) => ({
  selection: { kind: 'overview' },
  methodDialogAgentId: null,
  openMethodDialog: (agentId) => set({ methodDialogAgentId: agentId, selection: { kind: 'method', agentId } }),
  closeMethodDialog: () => set({ methodDialogAgentId: null }),
}))
