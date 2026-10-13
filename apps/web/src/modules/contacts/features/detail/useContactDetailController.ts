import { useMemo, useState } from 'react'
import { useSession } from '@/providers/solid-session-context'
import { useLiveQuery } from '@tanstack/react-db'
import { isGroupContact } from '@undefineds.co/models'
import { useToast } from '@/components/ui/use-toast'
import type { ModelOption } from '@/components/ui/model-selector'
import { useModelServices } from '@/modules/model-services/data/use-model-services'
import { useContactStore } from '../../app/store'
import { agentCollection, contactCollection, contactOps, getContactsChatCollection } from '../../data/collections'
import { buildContactListProjection, buildRecentFriends, projectContactDetail } from '../../domain/contact-projection'
import { formatAccountAddress } from '../../domain/account-address'
import { useAgentEditingController } from './useAgentEditingController'
import { useContactCreationController } from './useContactCreationController'
import { useContactDeletionNavigationController } from './useContactDeletionNavigationController'
import { useContactGroupMembershipController } from './useContactGroupMembershipController'
import { useContactProfileActionsController } from './useContactProfileActionsController'
import { useContactSpaceController } from './useContactSpaceController'
import { useContactProfileSyncController } from './useContactProfileSyncController'

export function useContactDetailController() {
  const { session } = useSession()
  const { toast } = useToast()
  const selectedId = useContactStore((state) => state.selectedId)
  const selectContact = useContactStore((state) => state.select)
  const entry = useContactStore((state) => state.entry)
  const openCreateDialog = useContactStore((state) => state.openCreateDialog)
  const createDialogOpen = useContactStore((state) => state.createDialogOpen)
  const createType = useContactStore((state) => state.createType)
  const closeCreateDialog = useContactStore((state) => state.closeCreateDialog)
  const inviteMemberDialogOpen = useContactStore((state) => state.inviteMemberDialogOpen)
  const inviteTargetGroupId = useContactStore((state) => state.inviteTargetGroupId)
  const openInviteMemberDialog = useContactStore((state) => state.openInviteMemberDialog)
  const closeInviteMemberDialog = useContactStore((state) => state.closeInviteMemberDialog)
  const chatCollection = getContactsChatCollection()
  const { providers: modelProviders } = useModelServices()
  const contactQuery = useLiveQuery(contactCollection)
  const chatQuery = useLiveQuery(chatCollection)
  const contacts = useMemo(() => contactQuery.data ?? [], [contactQuery.data])
  // An assistant is "mine" when it lives in my own agent collection; only then
  // can its method and tools be changed from here.
  const agentQuery = useLiveQuery(agentCollection)
  const chats = useMemo(() => chatQuery.data ?? [], [chatQuery.data])
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
      contactCollection.fetch({ refetch: true }),
      chatCollection.fetch({ refetch: true }),
    ]).catch(() => {
      notify.error('联系人详情加载失败，请重试。')
    })
  }

  const [revokeOnDelete, setRevokeOnDelete] = useState(true)
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
  const rawAddress = persistedContact && !isGroup && /^https?:\/\//i.test(persistedContact.about ?? '')
    ? persistedContact.about as string
    : null
  const isAgentContact = contact?.sourceType === 'agent'
  const space = useContactSpaceController({
    contactWebId: rawAddress && !isAgentContact ? rawAddress : null,
    contactId: selectedId,
    storedShowInProfile: !!persistedContact?.isPublic,
    notify,
  })
  const groups = useMemo(
    () => buildContactListProjection(contacts).groups,
    [contacts],
  )
  const recentFriends = useMemo(() => buildRecentFriends(contacts), [contacts])
  const commonGroups = useMemo(() => (
    persistedContact && !isGroup
      ? contactOps.getCommonGroups(persistedContact.id, contacts, chats).map((group) => ({
        id: group.id,
        name: group.alias?.trim() || group.name || '群聊',
      }))
      : []
  ), [chats, contacts, isGroup, persistedContact])
  const currentUserRef = session.info.webId ?? undefined
  const group = useContactGroupMembershipController({
    groupContactId: isGroup ? persistedContact.id : null,
    currentUserRef,
    inviteTargetGroupId,
    closeInviteMemberDialog,
    notify,
    contacts,
    chats,
  })
  // "从哪个方法开始": start a new assistant from an existing assistant's method, or blank.
  const methodTemplates = useMemo(() => ((agentQuery.data ?? []) as Array<{ id?: string; name?: string; instructions?: string }>)
    .filter((row) => typeof row.id === 'string' && typeof row.instructions === 'string' && row.instructions.trim())
    .map((row) => ({
      id: row.id as string,
      label: `${row.name?.trim() || '助手'}的方法`,
      instructions: (row.instructions as string).trim(),
    })), [agentQuery.data])
  const ownAgentId = contact?.agentConfig?.id
  const isOwnAgent = typeof ownAgentId === 'string'
    && (agentQuery.data ?? []).some((row) => row.id === ownAgentId)
  const contactRecord = contact as Record<string, unknown> | null
  const contactInbox = typeof contactRecord?.inbox === 'string' && contactRecord.inbox.length > 0
    ? contactRecord.inbox
    : null
  const availableAgentModels = useMemo<ModelOption[]>(() => (
    Object.values(modelProviders)
      .filter((provider) => provider.enabled || provider.id === 'undefineds')
      .flatMap((provider) => provider.models
        .filter((model) => model.enabled !== false)
        .map((model) => ({
          id: `${provider.id}/${model.id}`,
          name: model.name || model.id,
          providerId: provider.id,
          providerName: provider.name,
          capabilities: [],
        })))
  ), [modelProviders])

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
      isOwnAgent,
      entry,
      groups,
      recentFriends,
      commonGroups,
      address: formatAccountAddress(rawAddress),
      fullAddress: rawAddress,
    },
    space,
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
      model: agent.editingModel,
      revokeOnDelete,
      onAliasChange: profile.setEditingAlias,
      onModelChange: agent.setEditingModel,
      onRevokeOnDeleteChange: setRevokeOnDelete,
      onClose: profile.closeEditor,
      onOpen: profile.openEditor,
      onOpenDelete: () => {
        setRevokeOnDelete(true)
        profile.openEditor('delete')
      },
      onSaveAlias: profile.handleSaveAlias,
      onSaveModel: agent.handleSaveModel,
      onDelete: () => navigation.handleDelete(
        revokeOnDelete && space.summary.sharedWithThem.length > 0 ? space.onRevokeAll : undefined,
      ),
    },
    creation: {
      open: createDialogOpen,
      type: createType,
      form: creation.createForm,
      availableAgentModels,
      methodTemplates,
      onUpdateForm: (patch: Partial<typeof creation.createForm>) => {
        creation.setCreateForm((current) => ({ ...current, ...patch }))
      },
      onClose: closeCreateDialog,
      onFriendAdded: ({ contactId }: { contactId: string }) => {
        closeCreateDialog()
        selectContact(contactId)
      },
      onCreateAgent: creation.handleCreateAgent,
      onGroupCreated: navigation.handleGroupCreated,
    },
    actions: {
      onOpenAliasEdit: profile.handleOpenAliasEdit,
      onCopyAddress: profile.handleCopyAddress,
      onStartChat: navigation.handleStartChat,
      onVoiceCall: profile.handleVoiceCall,
      onVideoCall: profile.handleVideoCall,
      onOpenMethod: agent.handleOpenMethod,
      onOpenCondition: agent.handleOpenCondition,
      onSelectContact: selectContact,
      onAddFriend: () => openCreateDialog('friend'),
    },
  }
}
