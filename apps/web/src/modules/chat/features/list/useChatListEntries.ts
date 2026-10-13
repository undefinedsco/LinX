import { useMemo } from 'react'
import type { ChatRow, ThreadRow } from '@undefineds.co/models'
import { resolveThreadChatId } from '@/lib/data/resource-identity'
import { useSession } from '@/providers/solid-session-context'
import {
  LINX_DEFAULT_SECRETARY,
  useChatList,
  useThreadIndex,
} from '../../collections'
import {
  displayAssistantName,
  orderChatListEntries,
  projectChatListEntry,
  type ChatListEntry,
} from '../../domain/chat-list-model'
import { listTimeValue } from '../../domain/list-time'
import { pickHeadlineTopic, type TopicStatus } from '../../domain/topic-status'
import { identityOf, isSecretaryChat, useContactLookup } from '../identity/useChatIdentity'
import { useTopicStatuses } from '../threads/useTopicStatuses'

export interface ChatListEntriesResult {
  entries: ChatListEntry[]
  isLoading: boolean
  isError: boolean
  /** The Pod refused to list conversations (no permission), as opposed to a failed refresh. */
  isForbidden: boolean
  refetch: () => void
}

function isForbiddenError(error: unknown): boolean {
  if (!error) return false
  const status = (error as { status?: number; statusCode?: number }).status ?? (error as { statusCode?: number }).statusCode
  if (status === 401 || status === 403) return true
  return /\b(401|403)\b|forbidden|unauthori[sz]ed/iu.test(error instanceof Error ? error.message : String(error))
}

/** The chat list: one row per assistant, person or group, LinX 助手 first, then 标星. */
export function useChatListEntries(): ChatListEntriesResult {
  const { session } = useSession()
  const chatQuery = useChatList()
  const { data: threads = [] } = useThreadIndex()
  const lookup = useContactLookup()
  const topicStatuses = useTopicStatuses()
  const selfWebId = session.info.webId

  const entries = useMemo(() => {
    const rows = (chatQuery.data ?? []) as ChatRow[]
    const threadsByChat = new Map<string, ThreadRow[]>()
    for (const thread of threads as ThreadRow[]) {
      const chatId = resolveThreadChatId(thread as never)
      if (!thread.id || !chatId) continue
      const list = threadsByChat.get(chatId) ?? []
      list.push(thread)
      threadsByChat.set(chatId, list)
    }

    const projected = rows
      .filter((chat) => typeof chat.id === 'string' && chat.status !== 'deleted')
      .map((chat) => {
        const identity = identityOf(chat, lookup, selfWebId)
        const topics = (threadsByChat.get(chat.id) ?? []).map((thread) => ({
          title: thread.title?.trim() || '新话题',
          status: topicStatuses.byThread.get(thread.id) ?? null,
          updatedAt: listTimeValue(thread.updatedAt ?? thread.createdAt),
        }))
        const headline = identity.kind === 'assistant' ? pickHeadlineTopic(topics) : null
        const chatStatus: TopicStatus | null = topicStatuses.byChat.get(chat.id) ?? null
        const isProtected = isSecretaryChat(chat)
        return projectChatListEntry({
          id: chat.id,
          title: identity.name,
          kind: identity.kind,
          avatarUrl: identity.avatarUrl,
          preview: chatStatus && !headline ? chatStatus.label : chat.lastMessagePreview,
          lastActiveAt: chat.lastActiveAt ?? chat.updatedAt,
          starred: isProtected || Boolean(chat.starred),
          muted: Boolean(chat.muted),
          unreadCount: Number(chat.unreadCount ?? 0),
          isProtected,
          headlineTopic: headline?.status ? { title: headline.title, status: headline.status } : null,
        })
      })

    // LinX 助手 is always there, even before its Pod record finishes loading.
    if (!projected.some((entry) => entry.isProtected)) {
      projected.push(projectChatListEntry({
        id: LINX_DEFAULT_SECRETARY.chatId,
        title: displayAssistantName(lookup.secretaryName),
        kind: 'assistant',
        preview: '你好，我是你的助手',
        starred: true,
        muted: false,
        unreadCount: 0,
        isProtected: true,
      }))
    }

    return orderChatListEntries(projected)
  }, [chatQuery.data, lookup, selfWebId, threads, topicStatuses])

  return {
    entries,
    isLoading: Boolean(chatQuery.isLoading),
    isError: Boolean(chatQuery.isError),
    isForbidden: isForbiddenError((chatQuery as { error?: unknown }).error),
    refetch: () => { void chatQuery.refetch() },
  }
}
