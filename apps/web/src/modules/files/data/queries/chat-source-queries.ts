import { useEffect, useMemo } from 'react'

import { extractChatIdFromChatRef } from '@undefineds.co/models'
import { useChatInit, useChatList, useMessageIndex, useMessageList, useThreadList } from '@/modules/chat/collections'
import { useChatStore } from '@/modules/chat/store'
import { projectCitingMessages, projectWorkUses, type CardWorkUse } from '../../domain/card/card-backlinks'

export interface ActiveFilesWorkspaceContext {
  chatId: string | null
  threadId: string | null
  workspaceUri: string | null
  threadTitle: string | null
}

export function useActiveFilesWorkspaceContext(): ActiveFilesWorkspaceContext {
  const selectedChatId = useChatStore((state) => state.selectedChatId)
  const selectedThreadId = useChatStore((state) => state.selectedThreadId)
  const { data: threads = [] } = useThreadList(selectedChatId ?? '', { enabled: !!selectedChatId })

  return useMemo(() => {
    if (!selectedThreadId) {
      return { chatId: selectedChatId, threadId: null, workspaceUri: null, threadTitle: null }
    }

    const activeThread = threads.find((thread) => thread.id === selectedThreadId) ?? null
    return {
      chatId: selectedChatId,
      threadId: selectedThreadId,
      workspaceUri: activeThread?.workspace ?? null,
      threadTitle: activeThread?.title ?? null,
    }
  }, [selectedChatId, selectedThreadId, threads])
}

export function useFilesChatMessages(
  chatId: string | null,
  threadId: string | null,
  enabled = true,
) {
  return useMessageList(enabled ? chatId : null, enabled ? threadId : null)
}

let lastMessageRefetchAt = 0
const MESSAGE_REFETCH_MS = 3_000

export interface FilesCitingWork extends CardWorkUse {
  chatId: string
  title: string
}

/** 用过它的工作: chats whose messages cited the card through 问 LinX (read lazily, only while `enabled`). */
export function useFilesCitingWork(uri: string, enabled: boolean): FilesCitingWork[] {
  // The chat collections read through the chat module's database getter; set it even when no chat is open.
  useChatInit()
  const messages = useMessageIndex({ enabled })
  const chats = useChatList()
  const refetchMessages = messages.refetch
  useEffect(() => {
    if (!enabled) return
    // The live message list only holds what the chat has read so far: read it when a card opens (not again within a few seconds).
    const now = Date.now()
    if (now - lastMessageRefetchAt < MESSAGE_REFETCH_MS) return
    lastMessageRefetchAt = now
    void Promise.resolve(refetchMessages()).catch(() => { lastMessageRefetchAt = 0 })
  }, [enabled, refetchMessages])
  return useMemo(() => {
    if (!enabled) return []
    // Messages name their chat by address; the chat list is keyed by its own resource id.
    const rows = new Map(chats.data.map((chat) => [extractChatIdFromChatRef(chat.id as string) ?? (chat.id as string), chat]))
    return projectWorkUses(projectCitingMessages(messages.data, uri)).map((use) => {
      const row = rows.get(extractChatIdFromChatRef(use.chatRef) ?? use.chatRef)
      return { ...use, chatId: (row?.id as string | undefined) ?? use.chatRef, title: row?.title || '未命名会话' }
    })
  }, [chats.data, enabled, messages.data, uri])
}

/** Opens a chat from the files module (selection lives in the chat store). */
export function useFilesSelectChat() {
  return useChatStore((state) => state.selectChat)
}
