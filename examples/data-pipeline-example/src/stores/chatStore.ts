// Zustand store for chat UI state
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface ChatUIState {
  // 当前选中的聊天
  selectedChatId: string | null
  
  // 搜索和过滤
  searchQuery: string
  statusFilter: 'all' | 'active' | 'archived'
  typeFilter: 'all' | 'direct' | 'group' | 'ai'
  
  // UI 状态
  isCreateDialogOpen: boolean
  isSidebarCollapsed: boolean
  
  // Actions
  setSelectedChat: (chatId: string | null) => void
  setSearchQuery: (query: string) => void
  setStatusFilter: (filter: 'all' | 'active' | 'archived') => void
  setTypeFilter: (filter: 'all' | 'direct' | 'group' | 'ai') => void
  setCreateDialogOpen: (open: boolean) => void
  toggleSidebar: () => void
  clearFilters: () => void
}

export const useChatStore = create<ChatUIState>()(
  devtools((set, get) => ({
    // 初始状态
    selectedChatId: null,
    searchQuery: '',
    statusFilter: 'active',
    typeFilter: 'all',
    isCreateDialogOpen: false,
    isSidebarCollapsed: false,
    
    // Actions
    setSelectedChat: (chatId) => set({ selectedChatId: chatId }),
    
    setSearchQuery: (query) => set({ searchQuery: query }),
    
    setStatusFilter: (filter) => set({ statusFilter: filter }),
    
    setTypeFilter: (filter) => set({ typeFilter: filter }),
    
    setCreateDialogOpen: (open) => set({ isCreateDialogOpen: open }),
    
    toggleSidebar: () => set((state) => ({ 
      isSidebarCollapsed: !state.isSidebarCollapsed 
    })),
    
    clearFilters: () => set({
      searchQuery: '',
      statusFilter: 'active',
      typeFilter: 'all',
    }),
  }), {
    name: 'chat-ui-store'
  })
)