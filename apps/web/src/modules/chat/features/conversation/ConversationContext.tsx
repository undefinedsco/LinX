import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { displayAssistantName } from '@/lib/assistant-name'
import { agentResource, contactResource, isAgentContact } from '@undefineds.co/models'
import { useEntity } from '@/lib/data/use-entity'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { buildAgentHomePath } from '@/lib/data/agent-home'
import { useSession } from '@/providers/solid-session-context'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { displayNameOf } from '../../domain/display-name'
import { getPrimaryParticipantUri } from '../../utils/chat-participants'
import { LINX_DEFAULT_SECRETARY, isLinxDefaultSecretaryChat, useChatList } from '../../collections'

export interface ConversationIdentity {
  chatId: string
  /** ChatKit-store thread id of the topic. */
  threadId: string
  /** Topic resource URI (the AG-UI threadId), once known. */
  threadUri: string | null
  agentId: string | null
  /** The assistant's resource address (used to read and rename it). */
  agentUri: string | null
  agentName: string
  contactId: string | null
  isSecretary: boolean
  isGroup: boolean
  podBaseUrl: string | null
  /** `{agent home}/remembered.ttl`, or null while the agent is unknown. */
  rememberedUrl: string | null
  /** Name@provider of the person, never the raw address. */
  selfName: string
}

const ConversationContext = createContext<ConversationIdentity | null>(null)

export function useConversationIdentity(): ConversationIdentity {
  const value = useContext(ConversationContext)
  if (!value) throw new Error('ConversationContext is missing')
  return value
}

export function useOptionalConversationIdentity(): ConversationIdentity | null {
  return useContext(ConversationContext)
}

/** Who this conversation is with: the assistant, its home folder, the person. */
export function useResolveConversationIdentity(input: {
  chatId: string
  threadId: string
  threadUri: string | null
}): ConversationIdentity {
  const { session } = useSession()
  const { db } = useSolidDatabase()
  const { data: chats } = useChatList()
  const chat = useMemo(() => chats?.find((candidate) => candidate.id === input.chatId) ?? null, [chats, input.chatId])
  const webId = session.info.webId ?? null
  const contactUri = getPrimaryParticipantUri(chat, webId)
  const { data: contact } = useEntity(contactResource, contactUri)
  const agentUri = contact && isAgentContact(contact) ? contact.about : null
  const { data: agent } = useEntity(agentResource, agentUri)
  const isSecretary = isLinxDefaultSecretaryChat(chat)
  const agentId = typeof agent?.id === 'string' && agent.id ? agent.id : isSecretary ? LINX_DEFAULT_SECRETARY.agentId : null
  const podBaseUrl = db ? resolveCurrentPodBaseUrl(db) : null
  const agentResourceUri = useMemo(() => {
    if (agentUri) return agentUri
    if (!db || !agentId) return null
    try {
      return db.resolveRowIri(agentResource as never, { id: agentId } as never)
    } catch {
      return null
    }
  }, [agentId, agentUri, db])
  const participants = Array.isArray(chat?.participants) ? chat.participants.length : 0

  return useMemo<ConversationIdentity>(() => {
    const rememberedUrl = agentId && podBaseUrl
      ? new URL(`${buildAgentHomePath(agentId).replace(/^\/+/u, '').replace(/\/?$/u, '/')}remembered.ttl`, `${podBaseUrl.replace(/\/+$/u, '')}/`).toString()
      : null
    return {
      chatId: input.chatId,
      threadId: input.threadId,
      threadUri: input.threadUri,
      agentId,
      agentUri: agentResourceUri,
      agentName: displayAssistantName((typeof agent?.name === 'string' && agent.name) || chat?.title),
      contactId: typeof contact?.id === 'string' && contact.id ? contact.id : isSecretary ? LINX_DEFAULT_SECRETARY.contactId : null,
      isSecretary,
      isGroup: participants > 2,
      podBaseUrl,
      rememberedUrl,
      selfName: webId ? displayNameOf(webId) : '我',
    }
  }, [agent?.name, agentId, agentResourceUri, chat?.title, contact?.id, input.chatId, input.threadId, input.threadUri, isSecretary, participants, podBaseUrl, webId])
}

export { displayNameOf }

export function ConversationProvider({ value, children }: { value: ConversationIdentity; children: ReactNode }) {
  return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>
}
