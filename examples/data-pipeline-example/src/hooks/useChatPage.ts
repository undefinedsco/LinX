// 组合业务数据和UI状态的 Hook
import { useMemo } from 'react'
import { useChats, useChat } from './useChats'
import { useChatStore } from '@/stores/chatStore'
import { ChatRow } from '@/types/chat'

export function useChatPage() {
  // 1. 业务数据（来自 TanStack Query）
  const { 
    data: allChats = [], 
    isLoading: chatsLoading, 
    error: chatsError 
  } = useChats()
  
  // 2. UI状态（来自 Zustand）
  const { 
    selectedChatId, 
    searchQuery, 
    statusFilter,
    typeFilter,
    setSelectedChat,
    setSearchQuery,
    setStatusFilter,
    setTypeFilter,
    clearFilters
  } = useChatStore()
  
  // 3. 当前选中的聊天数据
  const { 
    data: selectedChat, 
    isLoading: selectedChatLoading 
  } = useChat(selectedChatId)
  
  // 4. 计算过滤后的聊天列表
  const filteredChats = useMemo(() => {
    let filtered = allChats
    
    // 状态过滤
    if (statusFilter !== 'all') {
      filtered = filtered.filter(chat => chat.status === statusFilter)
    }
    
    // 类型过滤
    if (typeFilter !== 'all') {
      filtered = filtered.filter(chat => chat.conversationType === typeFilter)
    }
    
    // 搜索过滤
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(chat => 
        chat.title.toLowerCase().includes(query) ||
        chat.description?.toLowerCase().includes(query)
      )
    }
    
    return filtered
  }, [allChats, statusFilter, typeFilter, searchQuery])
  
  // 5. 搜索统计
  const searchStats = useMemo(() => {
    const total = allChats.length
    const filtered = filteredChats.length
    const hasFilters = statusFilter !== 'active' || typeFilter !== 'all' || searchQuery.trim() !== ''
    
    return { total, filtered, hasFilters }
  }, [allChats.length, filteredChats.length, statusFilter, typeFilter, searchQuery])
  
  return {
    // 数据
    chats: filteredChats,
    selectedChat,
    totalChats: allChats.length,
    searchStats,
    
    // 加载状态
    isLoading: chatsLoading,
    isSelectedChatLoading: selectedChatLoading,
    error: chatsError,
    
    // UI 状态
    searchQuery,
    statusFilter,
    typeFilter,
    selectedChatId,
    
    // Actions
    setSelectedChat,
    setSearchQuery,
    setStatusFilter,
    setTypeFilter,
    clearFilters,
  }
}