import { create } from 'zustand'

export type AddDialogMode = 'ai' | 'group' | 'friend'

/**
 * 列表视图模式
 * - 'chats': 显示 Chat 列表（默认）
 * - 'topics': 显示某个 Chat 下的 Topic 列表
 */
export type ListViewMode = 'chats' | 'topics'

interface ChatStore {
  // Selection state
  selectedChatId: string | null
  selectedThreadId: string | null
  search: string

  // List view mode (WeChat-style navigation)
  listViewMode: ListViewMode

  // Dialog state
  isAddDialogOpen: boolean
  addDialogMode: AddDialogMode
  showRightSidebar: boolean

  // Actions
  setSearch: (val: string) => void
  selectChat: (id: string | null) => void
  selectThread: (id: string | null) => void
  openAddDialog: (mode?: AddDialogMode) => void
  closeAddDialog: () => void
  toggleRightSidebar: () => void

  // List view navigation
  enterChat: (chatId: string) => void  // 点击 Chat 进入 Topic 列表
  goBackToChats: () => void            // 返回 Chat 列表
  setListViewMode: (mode: ListViewMode) => void
}

export const useChatStore = create<ChatStore>((set) => ({
  selectedChatId: null,
  selectedThreadId: null,
  search: '',
  listViewMode: 'chats',
  isAddDialogOpen: false,
  addDialogMode: 'ai',
  showRightSidebar: false,

  setSearch: (search) => set({ search }),
  selectChat: (id) => set({ selectedChatId: id, selectedThreadId: null }),
  selectThread: (id) => set({ selectedThreadId: id }),
  openAddDialog: (mode = 'ai') => set({ isAddDialogOpen: true, addDialogMode: mode }),
  closeAddDialog: () => set({ isAddDialogOpen: false }),
  toggleRightSidebar: () => set((state) => ({ showRightSidebar: !state.showRightSidebar })),

  // 进入某个 Chat，切换到 Topic 列表视图
  enterChat: (chatId) => set({ 
    selectedChatId: chatId, 
    selectedThreadId: null,
    listViewMode: 'topics',
    search: '' // 清空搜索
  }),

  // 返回 Chat 列表
  goBackToChats: () => set({ 
    listViewMode: 'chats',
    selectedThreadId: null,
    search: '' // 清空搜索
  }),

  setListViewMode: (mode) => set({ listViewMode: mode }),
}))



