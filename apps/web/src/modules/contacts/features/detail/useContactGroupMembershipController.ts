import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ContactType, isGroupContact, type ChatRow, type ContactRow } from '@undefineds.co/models'
import { contactOps } from '../../data/collections'
import { getShortContactId } from '../../domain/contact-projection'
import type { GroupMember } from '../../ui/MemberList'
import type { ContactDetailNotifier } from './controller-types'

interface ContactGroupMembershipControllerOptions {
  groupContactId: string | null
  currentUserRef?: string
  inviteMemberDialogOpen: boolean
  inviteTargetGroupId: string | null
  closeInviteMemberDialog(): void
  notify: ContactDetailNotifier
  contacts: ContactRow[]
  chats: ChatRow[]
}

export function useContactGroupMembershipController({
  groupContactId,
  currentUserRef,
  inviteMemberDialogOpen,
  inviteTargetGroupId,
  closeInviteMemberDialog,
  notify,
  contacts,
  chats,
}: ContactGroupMembershipControllerOptions) {
  const [inviteSearch, setInviteSearch] = useState('')
  const [selectedInvitees, setSelectedInvitees] = useState<Set<string>>(new Set())
  const [isInviting, setIsInviting] = useState(false)
  const roleMap = groupContactId ? contactOps.getGroupMemberRoles(groupContactId, contacts, chats) : {}
  const memberRefs = groupContactId ? contactOps.getGroupMembers(groupContactId, contacts, chats) : []
  const resolvedMembers = groupContactId ? contactOps.resolveMembers(memberRefs, contacts) : []
  const resolvedByRef = new Map(
    resolvedMembers.flatMap((member) => {
      const refs = new Set<string>([member.id])
      if (member.about) refs.add(member.about)
      return [...refs].map((ref) => [ref, member] as const)
    }),
  )
  const groupMembers: GroupMember[] = memberRefs.map((memberRef) => ({
    memberRef,
    contact: resolvedByRef.get(memberRef) ?? {
      id: memberRef,
      name: getShortContactId(memberRef),
      contactType: ContactType.SOLID,
      about: memberRef,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    } as ContactRow,
    role: (roleMap[memberRef] as GroupMember['role'] | undefined) ?? 'member',
  }))
  const currentUserRole = currentUserRef ? roleMap[currentUserRef] : undefined

  const { data: fetchedInviteContacts = [] } = useQuery({
    queryKey: ['contacts', 'group-invite', inviteTargetGroupId],
    queryFn: () => contactOps.getAll(),
    enabled: inviteMemberDialogOpen && !!inviteTargetGroupId,
  })
  const inviteContacts = contacts.length > 0 ? contacts : fetchedInviteContacts
  const existingMembers = new Set(
    inviteTargetGroupId ? contactOps.getGroupMembers(inviteTargetGroupId, contacts, chats) : [],
  )
  const query = inviteSearch.trim().toLowerCase()
  const inviteCandidates = inviteTargetGroupId
    ? inviteContacts
      .filter((candidate) => !isGroupContact(candidate) && !candidate.deletedAt)
      .filter((candidate) => {
        const memberRef = candidate.about || candidate.id
        return !!memberRef && !existingMembers.has(memberRef)
      })
      .filter((candidate) => !query
        || candidate.name?.toLowerCase().includes(query)
        || candidate.alias?.toLowerCase().includes(query))
    : []

  const handleMentionMember = useCallback((contactName: string) => {
    navigator.clipboard.writeText(`@${contactName} `)
    notify.info(`已复制 @${contactName}`)
  }, [notify])

  const handleRemoveGroupMember = useCallback(async (memberRef: string) => {
    if (!groupContactId) return
    try {
      await contactOps.removeMemberFromGroup(groupContactId, memberRef)
      notify.success('成员已移除')
    } catch {
      notify.error('移除成员失败')
    }
  }, [groupContactId, notify])

  const handleUpdateGroupMemberRole = useCallback(async (
    memberRef: string,
    role: 'admin' | 'member',
  ) => {
    if (!groupContactId) return
    try {
      await contactOps.updateMemberRole(groupContactId, memberRef, role)
      notify.success(role === 'admin' ? '已设为管理员' : '已取消管理员')
    } catch {
      notify.error('更新成员角色失败')
    }
  }, [groupContactId, notify])

  const toggleInvitee = useCallback((contactId: string) => {
    setSelectedInvitees((current) => {
      const next = new Set(current)
      next.has(contactId) ? next.delete(contactId) : next.add(contactId)
      return next
    })
  }, [])

  const closeInvite = useCallback(() => {
    setInviteSearch('')
    setSelectedInvitees(new Set())
    closeInviteMemberDialog()
  }, [closeInviteMemberDialog])

  const handleInviteMembers = useCallback(async () => {
    if (!inviteTargetGroupId || selectedInvitees.size === 0) return
    setIsInviting(true)
    try {
      const candidatesById = new Map(inviteContacts.map((candidate) => [candidate.id, candidate]))
      for (const inviteeId of selectedInvitees) {
        const candidate = candidatesById.get(inviteeId)
        const memberRef = candidate?.about || candidate?.id
        if (memberRef) await contactOps.addMemberToGroup(inviteTargetGroupId, memberRef)
      }
      notify.success('已邀请成员')
      closeInvite()
    } catch {
      notify.error('邀请成员失败')
    } finally {
      setIsInviting(false)
    }
  }, [closeInvite, inviteContacts, inviteTargetGroupId, notify, selectedInvitees])

  return {
    groupMembers,
    currentUserRole,
    isGroupOwner: currentUserRole === 'owner',
    isGroupAdmin: currentUserRole === 'owner' || currentUserRole === 'admin',
    inviteSearch,
    setInviteSearch,
    selectedInvitees,
    isInviting,
    inviteCandidates,
    toggleInvitee,
    closeInvite,
    handleInviteMembers,
    handleMentionMember,
    handleRemoveGroupMember,
    handleUpdateGroupMemberRole,
  }
}
