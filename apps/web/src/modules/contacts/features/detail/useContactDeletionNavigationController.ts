import { useCallback, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { isGroupContact, type ContactRow } from '@undefineds.co/models'
import { contactOps, useContactsChatSelection } from '../../data/collections'
import type { UnifiedContact } from '../../domain/types'
import type { ContactDetailNotifier } from './controller-types'

interface ContactDeletionNavigationControllerOptions {
  contact: UnifiedContact | null
  persistedContact: ContactRow | null
  selectedId: string | null
  contacts: ContactRow[]
  selectContact(contactId: string | null): void
  closeEditor(): void
  closeCreateDialog(): void
  notify: ContactDetailNotifier
}

export function useContactDeletionNavigationController({
  contact,
  persistedContact,
  selectedId,
  contacts,
  selectContact,
  closeEditor,
  closeCreateDialog,
  notify,
}: ContactDeletionNavigationControllerOptions) {
  const navigate = useNavigate()
  const selectChat = useContactsChatSelection()
  const [isDeleting, setIsDeleting] = useState(false)

  const navigateToChat = useCallback((chatId: string) => {
    selectChat(chatId)
    navigate({ to: '/$microAppId', params: { microAppId: 'chat' } })
  }, [navigate, selectChat])

  const handleStartChat = useCallback(async () => {
    if (!contact || !selectedId) return
    try {
      if (persistedContact && isGroupContact(persistedContact)) {
        const chat = contactOps.getGroupChat(persistedContact.id)
        if (!chat) throw new Error('群聊不存在')
        navigateToChat(chat.id)
        return
      }
      navigateToChat(await contactOps.findOrCreateChat(selectedId))
    } catch {
      notify.error('无法启动聊天')
    }
  }, [contact, navigateToChat, notify, persistedContact, selectedId])

  const handleDelete = useCallback(async () => {
    if (!contact || !selectedId) return
    setIsDeleting(true)
    try {
      await contactOps.deleteContact(selectedId)
      notify.success('联系人已删除')
      selectContact(null)
      closeEditor()
    } catch {
      notify.error('删除失败')
    } finally {
      setIsDeleting(false)
    }
  }, [closeEditor, contact, notify, selectContact, selectedId])

  const handleViewGroupMemberProfile = useCallback((contactId: string) => {
    const nextContact = contacts.find((entry) => entry.id === contactId)
    if (nextContact) selectContact(nextContact.id)
  }, [contacts, selectContact])

  const handleGroupCreated = useCallback((contactId: string, chatId: string) => {
    closeCreateDialog()
    selectContact(contactId)
    navigateToChat(chatId)
  }, [closeCreateDialog, navigateToChat, selectContact])

  return {
    isDeleting,
    handleStartChat,
    handleDelete,
    handleViewGroupMemberProfile,
    handleGroupCreated,
  }
}
