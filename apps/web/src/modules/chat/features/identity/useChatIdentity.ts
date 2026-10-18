import { useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import {
  contactResource,
  isAgentContact,
  isGroupContact,
  type ChatRow,
  type ContactRow,
} from '@undefineds.co/models'
import { agentResource } from '@undefineds.co/models'
import { useEntity } from '@/lib/data/use-entity'
import { contactCollection } from '@/modules/contacts'
import { agentCollection } from '../../contacts-port'
import { getPrimaryParticipantUri } from '../../utils/chat-participants'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { useSession } from '@/providers/solid-session-context'
import {
  LINX_DEFAULT_SECRETARY,
  isLinxDefaultSecretaryChat,
  useChatList,
} from '../../collections'
import {
  resolveChatIdentity,
  type ChatIdentity,
  type ChatIdentityContact,
} from '../../domain/chat-identity'

export interface ContactLookup {
  find: (participantIri: string) => ChatIdentityContact | null
  contacts: ChatIdentityContact[]
  secretaryName: string | null
}

function toIdentityContact(row: ContactRow): ChatIdentityContact {
  return {
    id: row.id,
    name: row.alias?.trim() || row.name?.trim() || '',
    avatarUrl: row.avatarUrl ?? null,
    isAssistant: isAgentContact(row),
    isGroup: isGroupContact(row),
    about: row.about ?? null,
  }
}

/**
 * Contacts indexed by every IRI a chat may store as a participant: the
 * contact card itself (direct chats) and the person/agent it is about
 * (group members).
 */
export function useContactLookup(): ContactLookup {
  const { db } = useSolidDatabase()
  const query = useLiveQuery(contactCollection)

  return useMemo(() => {
    const byRef = new Map<string, ChatIdentityContact>()
    const contacts: ChatIdentityContact[] = []
    let secretaryName: string | null = null
    for (const row of (query.data ?? []) as ContactRow[]) {
      if (!row?.id || row.deletedAt) continue
      const contact = toIdentityContact(row)
      contacts.push(contact)
      if (row.id === LINX_DEFAULT_SECRETARY.contactId) secretaryName = contact.name || null
      byRef.set(row.id, contact)
      if (row.about) byRef.set(row.about, contact)
      try {
        const iri = db && typeof db.resolveRowIri === 'function'
          ? db.resolveRowIri(contactResource as never, { id: row.id })
          : null
        if (iri) byRef.set(iri, contact)
      } catch {
        // A row we can't address is still listed by its id.
      }
    }
    return {
      find: (participantIri: string) => byRef.get(participantIri) ?? null,
      contacts,
      secretaryName,
    }
  }, [db, query.data])
}

export function isSecretaryChat(chat: Pick<ChatRow, 'id' | 'title' | 'metadata'> | null | undefined): boolean {
  return Boolean(chat && (chat.id === LINX_DEFAULT_SECRETARY.chatId || isLinxDefaultSecretaryChat(chat)))
}

export function identityOf(
  chat: ChatRow,
  lookup: ContactLookup,
  selfWebId: string | null | undefined,
): ChatIdentity {
  return resolveChatIdentity({
    chat,
    selfWebId,
    isSecretary: isSecretaryChat(chat),
    secretaryName: lookup.secretaryName,
    findContact: lookup.find,
  })
}

/**
 * The selected conversation and who it is with: chat -> identity (name, face,
 * kind) -> contact card -> agent (for assistants).
 *
 * `useChatIdentity(chatId: string | null)` returns
 * `{ chat, identity, contact, agent, agentId, contactId, isSecretary, lookup }`.
 * `agent` is the staged LinX 助手 agent while the Pod row is still loading.
 */
export function useChatIdentity(chatId: string | null) {
  const { session } = useSession()
  const { data: chats = [] } = useChatList()
  const lookup = useContactLookup()
  const chat = useMemo(
    () => (chatId ? (chats as ChatRow[]).find((row) => row.id === chatId) ?? null : null),
    [chatId, chats],
  )
  const identity = useMemo(
    () => (chat ? identityOf(chat, lookup, session.info.webId) : null),
    [chat, lookup, session.info.webId],
  )
  const isSecretary = isSecretaryChat(chat)
  const contactUri = getPrimaryParticipantUri(chat, session.info.webId)
  const { data: contact } = useEntity(contactResource, contactUri)
  const agentUri = contact && isAgentContact(contact) ? contact.about : null
  const { data: loadedAgent } = useEntity(agentResource, agentUri)
  const agent = loadedAgent
    ?? (isSecretary ? agentCollection.get(LINX_DEFAULT_SECRETARY.agentId) ?? null : null)
  const agentId = typeof agent?.id === 'string' && agent.id.length > 0 ? agent.id : null
  const contactId = typeof contact?.id === 'string' && contact.id.length > 0
    ? contact.id
    : isSecretary ? LINX_DEFAULT_SECRETARY.contactId : null
  return { chat, identity, contact: contact ?? null, agent, agentId, contactId, lookup, isSecretary }
}
