import { agentResource, threadRepository } from '@undefineds.co/models'

export {
  agentHomeDirFromResourceId,
  agentKeyFromResourceId,
  agentResourceId,
  asBaseRelativeResourceId,
  asResourceIri,
  requireRowResourceId,
  type BaseRelativeResourceId,
  type ResourceIri,
} from '@linx/agent-runtime/pod-resource-identity'

import { agentHomeDirFromResourceId, asBaseRelativeResourceId } from '@linx/agent-runtime/pod-resource-identity'

const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z\d+.-]*:/

export function agentHomePathFromResourceId(resourceId: string): string {
  return agentResource.resolveUri(agentHomeDirFromResourceId(resourceId))
}

export function resolveThreadChatId(
  thread: (Pick<Record<string, unknown>, 'parent'> & { chat?: unknown }) | null | undefined,
): string | null {
  const fromParent = threadRepository.chatId(thread as any)
  if (fromParent) {
    return fromParent
  }

  const chat = thread?.chat
  if (typeof chat !== 'string' || chat.trim().length === 0) {
    return null
  }

  const fromChatRef = threadRepository.chatId({ parent: chat } as any)
  if (fromChatRef) {
    return fromChatRef
  }

  return ABSOLUTE_IRI.test(chat) || chat.includes('#')
    ? null
    : asBaseRelativeResourceId(chat, 'Thread chat id')
}
