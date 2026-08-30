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
import { ChatRightSidebar } from '../components/ChatRightSidebar'
import { ChatHeader } from '../components/ChatHeader'

export const useChatLayoutConfig = () => {
  const selectedChatId = useChatStore((state) => state.selectedChatId)
  const showRightSidebar = useChatStore((state) => state.showRightSidebar)
  const toggleRightSidebar = useChatStore((state) => state.toggleRightSidebar)

  // Use new collection-based hook
  const { data: chats } = useChatList()

  const activeChat = useMemo(() => {
    if (!chats || !selectedChatId) return null
    return chats.find((chat) => chat.id === selectedChatId)
  }, [chats, selectedChatId])

  return useMemo(
    () => ({
      header: <ChatHeader />,
      mainTitle: activeChat?.title ?? '聊天',
      subtitle: activeChat?.description ?? '与 AI 助手协作',
      rightSidebar: activeChat && showRightSidebar ? <ChatRightSidebar /> : null,
      rightSidebarWidth: 320,
      rightSidebarToggle: activeChat
        ? {
            label: '会话详情',
            open: showRightSidebar,
            onToggle: toggleRightSidebar,
          }
        : undefined,
    }),
    [activeChat, showRightSidebar, toggleRightSidebar],
  )
}
