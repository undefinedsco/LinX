import { create } from 'zustand'
import type { ContactEntry } from '../domain/types'

export type ContactViewMode = 'view' | 'edit'
export type CreateContactType = 'agent' | 'friend' | 'group'

interface ContactStore {
  // List State
  search: string
  setSearch: (val: string) => void

  // Selection & View State
  selectedId: string | null
  /** "新的朋友" / "群聊" above the A–Z list; mutually exclusive with selectedId. */
  entry: ContactEntry | null
  viewMode: ContactViewMode

  // Create Dialog State
  createDialogOpen: boolean
  createType: CreateContactType | null

  // Member List sidebar state
  memberListOpen: boolean

  // Invite-member dialog (reuses SelectableContactList)
  inviteMemberDialogOpen: boolean
  inviteTargetGroupId: string | null

  // Actions
  select: (id: string | null) => void
  openEntry: (entry: ContactEntry | null) => void
  openCreateDialog: (type: CreateContactType) => void
  closeCreateDialog: () => void
  startEdit: () => void
  cancelEdit: () => void
  toggleMemberList: () => void
  setMemberListOpen: (open: boolean) => void
  openInviteMemberDialog: (groupId: string) => void
  closeInviteMemberDialog: () => void
}

export const useContactStore = create<ContactStore>((set) => ({
  search: '',
  setSearch: (search) => set({ search }),

  selectedId: null,
  entry: null,
  viewMode: 'view',
  createDialogOpen: false,
  createType: null,
  memberListOpen: false,
  inviteMemberDialogOpen: false,
  inviteTargetGroupId: null,

  select: (id) => set({ selectedId: id, entry: null, viewMode: 'view' }),
  openEntry: (entry) => set({ entry, selectedId: null, viewMode: 'view' }),
  openCreateDialog: (type) => set({ createDialogOpen: true, createType: type }),
  closeCreateDialog: () => set({ createDialogOpen: false, createType: null }),
  startEdit: () => set((state) => state.selectedId ? { viewMode: 'edit' } : {}),
  cancelEdit: () => set({ viewMode: 'view' }),
  toggleMemberList: () => set((state) => ({ memberListOpen: !state.memberListOpen })),
  setMemberListOpen: (open) => set({ memberListOpen: open }),
  openInviteMemberDialog: (groupId) => set({ inviteMemberDialogOpen: true, inviteTargetGroupId: groupId }),
  closeInviteMemberDialog: () => set({ inviteMemberDialogOpen: false, inviteTargetGroupId: null }),
}))
