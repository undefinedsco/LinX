import { toStringArray } from '@/lib/utils'
import { displayAssistantName, type ChatIdentityKind } from './chat-list-model'

/**
 * Who a conversation is with. One identity = one chat row: an assistant, a
 * person, or a group. Contacts are looked up by the participant IRI stored on
 * the chat; nothing here parses ids out of IRIs.
 */
export interface ChatIdentityContact {
  id: string
  name: string
  avatarUrl?: string | null
  isAssistant: boolean
  isGroup: boolean
  /** Agent resource IRI for assistants (contact `about`). */
  about?: string | null
}

export interface ChatIdentityChat {
  id: string
  title?: string | null
  avatarUrl?: string | null
  participants?: unknown
  metadata?: unknown
}

export interface ChatIdentity {
  kind: ChatIdentityKind
  name: string
  avatarUrl: string | null
  contact: ChatIdentityContact | null
  /** Everyone in the conversation except you. */
  counterparts: string[]
  memberCount: number
}

function hasMemberRoles(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false
  const roles = (metadata as Record<string, unknown>).memberRoles
  return Boolean(roles && typeof roles === 'object' && Object.keys(roles).length > 0)
}

export function resolveChatIdentity(input: {
  chat: ChatIdentityChat
  selfWebId?: string | null
  isSecretary: boolean
  secretaryName?: string | null
  findContact: (participantIri: string) => ChatIdentityContact | null
}): ChatIdentity {
  const { chat, selfWebId } = input
  const participants = Array.from(new Set(toStringArray(chat.participants)))
  const counterparts = participants.filter((participant) => participant && participant !== selfWebId)
  const fallbackTitle = chat.title?.trim() || '未命名会话'

  if (input.isSecretary) {
    return {
      kind: 'assistant',
      name: displayAssistantName(input.secretaryName),
      avatarUrl: null,
      contact: null,
      counterparts,
      memberCount: 1,
    }
  }

  if (counterparts.length > 1 || hasMemberRoles(chat.metadata)) {
    return {
      kind: 'group',
      name: fallbackTitle,
      avatarUrl: chat.avatarUrl ?? null,
      contact: null,
      counterparts,
      memberCount: Math.max(participants.length, counterparts.length + 1),
    }
  }

  const contact = counterparts[0] ? input.findContact(counterparts[0]) : null
  if (contact?.isGroup) {
    return { kind: 'group', name: contact.name || fallbackTitle, avatarUrl: contact.avatarUrl ?? null, contact, counterparts, memberCount: participants.length }
  }
  return {
    kind: contact?.isAssistant ? 'assistant' : 'person',
    name: contact?.name || fallbackTitle,
    // Assistant chats used to copy the provider logo onto the chat; changing the
    // model must not change the face, so only the contact's own picture counts.
    avatarUrl: contact?.avatarUrl ?? null,
    contact,
    counterparts,
    memberCount: 2,
  }
}
