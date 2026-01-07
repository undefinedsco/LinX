/**
 * Chat Layout Configuration Hook
 * 
 * 提供 Chat 模块的布局配置，用于 PrimaryLayout:
 * - 主标题和副标题
 * - 顶部操作按钮
 * - 右侧边栏
 */

import { useMemo } from 'react'
import { useChatStore } from '../store'
import { useChatList } from '../collections'
import { resolveRowId } from '@linx/models'
import { ChatRightSidebar } from '../components/ChatRightSidebar'
import { ChatHeader } from '../components/ChatHeader'

export const useChatLayoutConfig = () => {
  const selectedChatId = useChatStore((state) => state.selectedChatId)
  const showRightSidebar = useChatStore((state) => state.showRightSidebar)
  
  // Use new collection-based hook
  const { data: chats } = useChatList()

  const activeChat = useMemo(() => {
    if (!chats || !selectedChatId) return null
    return chats.find((chat) => resolveRowId(chat) === selectedChatId)
  }, [chats, selectedChatId])

  return {
    header: <ChatHeader />,
    mainTitle: activeChat?.title ?? '聊天',
    subtitle: activeChat?.description ?? '与 AI 助手协作',
    rightSidebar: showRightSidebar ? <ChatRightSidebar /> : null,
    rightSidebarWidth: 320,
  }
}
