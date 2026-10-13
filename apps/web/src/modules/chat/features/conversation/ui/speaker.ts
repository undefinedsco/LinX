import { useAuiState } from '@assistant-ui/react'
import { useSession } from '@/providers/solid-session-context'
import { displayNameOf, useOptionalConversationIdentity } from '../ConversationContext'
import { useContactLookup } from '../../identity/useChatIdentity'

/**
 * Who said this message, as a person would read it (W8): a contact name, or
 * name@provider when the author is not a contact. Never a raw address.
 * Only group chats name speakers; elsewhere this is null.
 */
export function useSpeakerName(role: 'user' | 'assistant'): string | null {
  const identity = useOptionalConversationIdentity()
  const { session } = useSession()
  const lookup = useContactLookup()
  const custom = useAuiState((state) => state.message.metadata?.custom) as { senderName?: string; senderRef?: string } | undefined
  if (!identity?.isGroup) return null
  if (custom?.senderName) return custom.senderName
  const ref = custom?.senderRef
  if (ref) {
    if (ref === session.info.webId) return identity.selfName
    const contact = lookup.find(ref)
    if (contact?.name) return contact.name
    if (/^https?:\/\//u.test(ref)) return displayNameOf(ref)
  }
  return role === 'assistant' ? identity.agentName : identity.selfName
}
