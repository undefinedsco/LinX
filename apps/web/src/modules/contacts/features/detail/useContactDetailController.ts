import { useMemo } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import { useLiveQuery } from '@tanstack/react-db'
import { isGroupContact } from '@undefineds.co/models'
import { useToast } from '@/components/ui/use-toast'
import { useContactStore } from '../../app/store'
import { contactCollection, getContactsChatCollection } from '../../data/collections'
import { projectContactDetail } from '../../domain/contact-projection'
import { useAgentEditingController } from './useAgentEditingController'
import { useContactCreationController } from './useContactCreationController'
import { useContactDeletionNavigationController } from './useContactDeletionNavigationController'
import { useContactGroupMembershipController } from './useContactGroupMembershipController'
import { useContactProfileActionsController } from './useContactProfileActionsController'
import { useContactProfileSyncController } from './useContactProfileSyncController'

export function useContactDetailController() {
  const { session } = useSession()
  const { toast } = useToast()
  const selectedId = useContactStore((state) => state.selectedId)
  const selectContact = useContactStore((state) => state.select)
  const createDialogOpen = useContactStore((state) => state.createDialogOpen)
  const createType = useContactStore((state) => state.createType)
  const closeCreateDialog = useContactStore((state) => state.closeCreateDialog)
  const inviteMemberDialogOpen = useContactStore((state) => state.inviteMemberDialogOpen)
  const inviteTargetGroupId = useContactStore((state) => state.inviteTargetGroupId)
  const openInviteMemberDialog = useContactStore((state) => state.openInviteMemberDialog)
  const closeInviteMemberDialog = useContactStore((state) => state.closeInviteMemberDialog)
  const chatCollection = getContactsChatCollection()
  const contactQuery = useLiveQuery(contactCollection)
  const chatQuery = useLiveQuery(chatCollection)
  const contacts = contactQuery.data ?? []
  const chats = chatQuery.data ?? []
  const persistedContact = selectedId
    ? contacts.find((candidate) => candidate.id === selectedId) ?? null
    : null
  const notify = useMemo(() => ({
    success: (description: string) => toast({ description }),
    info: (description: string) => toast({ description }),
    error: (description: string) => toast({ description, variant: 'destructive' }),
  }), [toast])
  const detailQueryError = contactQuery.isError
    ? '联系人详情加载失败，请重试。'
    : chatQuery.isError
      ? '关联会话加载失败，请重试。'
      : null
  const retryDetailQueries = () => {
    void Promise.all([
      contactCollection.fetch(),
      chatCollection.fetch(),
    ]).catch(() => {
      notify.error('联系人详情加载失败，请重试。')
    })
  }

  const sync = useContactProfileSyncController(persistedContact)
  const contact = useMemo(() => (
    selectedId && persistedContact
      ? projectContactDetail(persistedContact, sync.sourceData)
      : null
  ), [persistedContact, selectedId, sync.sourceData])
  const profile = useContactProfileActionsController({ contact, selectedId, notify })
  const agent = useAgentEditingController({
    contact,
    notify,
    openEditor: profile.openEditor,
    closeEditor: profile.closeEditor,
  })
  const creation = useContactCreationController({
    createDialogOpen,
    closeCreateDialog,
    selectContact,
    notify,
  })
  const navigation = useContactDeletionNavigationController({
    contact,
    persistedContact,
    selectedId,
    contacts,
    selectContact,
    closeEditor: profile.closeEditor,
    closeCreateDialog,
    notify,
  })
  const isGroup = !!persistedContact && isGroupContact(persistedContact)
  const currentUserRef = session.info.webId ?? undefined
  const group = useContactGroupMembershipController({
    groupContactId: isGroup ? persistedContact.id : null,
    currentUserRef,
    inviteMemberDialogOpen,
    inviteTargetGroupId,
    closeInviteMemberDialog,
    notify,
    contacts,
    chats,
  })
  const contactRecord = contact as Record<string, unknown> | null
  const contactInbox = typeof contactRecord?.inbox === 'string' && contactRecord.inbox.length > 0
    ? contactRecord.inbox
    : null

  return {
    detail: {
      selectedId,
      isContactLoading: contactQuery.isLoading,
      error: detailQueryError,
      onRetry: retryDetailQueries,
      contact,
      persistedContact,
      contactInbox,
      isGroup,
    },
    sync: {
      isSyncing: sync.isSyncing,
      errorMessage: sync.syncErrorMessage,
      lastSyncedText: sync.lastSyncedText,
      onRefresh: sync.handleManualSync,
    },
    group: {
      members: group.groupMembers,
      currentUserRef,
      currentUserRole: group.currentUserRole,
      isOwner: group.isGroupOwner,
      isAdmin: group.isGroupAdmin,
      onViewProfile: navigation.handleViewGroupMemberProfile,
      onMention: group.handleMentionMember,
      onRemoveMember: group.handleRemoveGroupMember,
      onUpdateRole: group.handleUpdateGroupMemberRole,
      onOpenInvite: () => persistedContact && openInviteMemberDialog(persistedContact.id),
      invite: {
        open: inviteMemberDialogOpen,
        candidates: group.inviteCandidates,
        selected: group.selectedInvitees,
        search: group.inviteSearch,
        isInviting: group.isInviting,
        onToggle: group.toggleInvitee,
        onSearchChange: group.setInviteSearch,
        onClose: group.closeInvite,
        onSubmit: group.handleInviteMembers,
      },
    },
    editing: {
      mode: profile.editMode,
      isSaving: profile.isSavingProfile || agent.isSavingAgent || navigation.isDeleting || creation.isCreating,
      alias: profile.editingAlias,
      prompt: agent.editingPrompt,
      toolsText: agent.editingToolsText,
      onAliasChange: profile.setEditingAlias,
      onPromptChange: agent.setEditingPrompt,
      onToolsTextChange: agent.setEditingToolsText,
      onClose: profile.closeEditor,
      onOpenDelete: () => profile.openEditor('delete'),
      onSaveAlias: profile.handleSaveAlias,
      onSavePrompt: agent.handleSavePrompt,
      onSaveTools: agent.handleSaveTools,
      onDelete: navigation.handleDelete,
    },
    creation: {
      open: createDialogOpen,
      type: createType,
      form: creation.createForm,
      friendSearch: creation.friendSearch,
      onUpdateForm: (patch: Partial<typeof creation.createForm>) => {
        creation.setCreateForm((current) => ({ ...current, ...patch }))
      },
      onFriendWebIdChange: (webId: string) => {
        creation.setFriendSearch((current) => ({ ...current, webId, error: '' }))
      },
      onClose: closeCreateDialog,
      onSearchWebId: creation.handleSearchWebId,
      onAddFriend: creation.handleAddFriend,
      onCreateAgent: creation.handleCreateAgent,
      onGroupCreated: navigation.handleGroupCreated,
    },
    actions: {
      onShare: profile.handleShare,
      onToggleStar: profile.handleToggleStar,
      onOpenAliasEdit: profile.handleOpenAliasEdit,
      onCopyId: profile.handleCopyId,
      onStartChat: navigation.handleStartChat,
      onVoiceCall: profile.handleVoiceCall,
      onVideoCall: profile.handleVideoCall,
      onTogglePublic: profile.handleTogglePublic,
      onOpenPromptEdit: agent.handleOpenPromptEdit,
      onOpenToolsEdit: agent.handleOpenToolsEdit,
    },
  }
}
