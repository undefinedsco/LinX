import {
  LINX_DEFAULT_SECRETARY,
  isLinxDefaultSecretaryChat,
} from '../collections'

type SecretaryIdentityCandidate = NonNullable<Parameters<typeof isLinxDefaultSecretaryChat>[0]>

type OrderableChatItem = SecretaryIdentityCandidate & {
  id?: string | null
  starred?: boolean | null
}

export interface SecretaryListCapabilities {
  isPinned: boolean
  isProtected: boolean
  canTogglePin: boolean
  canDelete: boolean
}

function isSecretaryEntry(chat: OrderableChatItem): boolean {
  return chat.id === LINX_DEFAULT_SECRETARY.chatId || isLinxDefaultSecretaryChat(chat)
}

function getChatOrderPriority(chat: OrderableChatItem): number {
  if (isSecretaryEntry(chat)) return 0
  if (chat.starred) return 1
  return 2
}

export function orderChatItems<T extends OrderableChatItem>(chats: readonly T[]): T[] {
  return chats
    .map((chat, sourceIndex) => ({ chat, sourceIndex }))
    .sort((left, right) => (
      getChatOrderPriority(left.chat) - getChatOrderPriority(right.chat)
      || left.sourceIndex - right.sourceIndex
    ))
    .map(({ chat }) => chat)
}

export function projectSecretaryListCapabilities(
  chat: OrderableChatItem,
): SecretaryListCapabilities {
  if (isSecretaryEntry(chat)) {
    return {
      isPinned: true,
      isProtected: true,
      canTogglePin: false,
      canDelete: false,
    }
  }

  return {
    isPinned: Boolean(chat.starred),
    isProtected: false,
    canTogglePin: true,
    canDelete: true,
  }
}
