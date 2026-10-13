import { useMemo, useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import type { ContactRow } from '@undefineds.co/models'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import { contactCollection, contactOps } from '../../data/collections'
import { projectContact } from '../../domain/contact-projection'
import { ContactPicker } from '../../ui/ContactPicker'

export interface ContactPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the conversation to open once it exists. */
  onChatReady: (chatId: string) => void
  onAddFriend: () => void
}

export function ContactPickerDialog({ open, onOpenChange, onChatReady, onAddFriend }: ContactPickerDialogProps) {
  const contactQuery = useLiveQuery(contactCollection)
  const [busyContactId, setBusyContactId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { people, assistants } = useMemo(() => {
    const projected = ((contactQuery.data ?? []) as ContactRow[])
      .map((row) => projectContact(row))
      .filter((contact) => !contact.isGroup)
      .sort((left, right) => left.displayName.localeCompare(right.displayName, 'zh-CN'))
    return {
      people: projected.filter((contact) => contact.sourceType !== 'agent'),
      assistants: projected.filter((contact) => contact.sourceType === 'agent'),
    }
  }, [contactQuery.data])

  const handlePick = async (contactId: string) => {
    setBusyContactId(contactId)
    setError(null)
    try {
      const chatId = await contactOps.findOrCreateChat(contactId)
      onOpenChange(false)
      onChatReady(chatId)
    } catch (pickError) {
      setError(formatLoginErrorForUser(pickError, '没能打开这个聊天，请稍后再试。'))
    } finally {
      setBusyContactId(null)
    }
  }

  return (
    <ContactPicker
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null)
        onOpenChange(next)
      }}
      people={people}
      assistants={assistants}
      busyContactId={busyContactId}
      error={error}
      onPick={(contactId) => { void handlePick(contactId) }}
      onAddFriend={() => {
        onOpenChange(false)
        onAddFriend()
      }}
    />
  )
}
