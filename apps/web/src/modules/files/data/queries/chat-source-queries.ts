import { useMemo } from 'react'

import { useMessageList, useThreadList } from '@/modules/chat/collections'
import { useChatStore } from '@/modules/chat/store'

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
