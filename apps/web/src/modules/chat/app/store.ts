import { create } from 'zustand'

const CHAT_SELECTION_STORAGE_KEY = 'linx:chat-selection:v1'

type StoredChatSelection = {
  selectedChatId: string | null
  selectedThreadId: string | null
  lastThreadByChat: Record<string, string>
}

function readStoredChatSelection(): StoredChatSelection {
  const empty = { selectedChatId: null, selectedThreadId: null, lastThreadByChat: {} }
  if (typeof window === 'undefined') return empty
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(CHAT_SELECTION_STORAGE_KEY) ?? '')
    if (!parsed || typeof parsed !== 'object') return empty
    return {
      selectedChatId: typeof parsed.selectedChatId === 'string' ? parsed.selectedChatId : null,
      selectedThreadId: typeof parsed.selectedThreadId === 'string' ? parsed.selectedThreadId : null,
      lastThreadByChat: parsed.lastThreadByChat && typeof parsed.lastThreadByChat === 'object'
        ? parsed.lastThreadByChat
        : {},
    }
  } catch {
    return empty
  }
}

function writeStoredChatSelection(selection: StoredChatSelection): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(CHAT_SELECTION_STORAGE_KEY, JSON.stringify(selection))
  } catch {
    // Selection persistence is best-effort and must not block chat navigation.
  }
}

const storedSelection = readStoredChatSelection()

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
  lastThreadByChat: Record<string, string>
  messageAnchorId: string | null
  activeBranchByParent: Record<string, string>
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
  setMessageAnchor: (id: string | null) => void
  clearMessageAnchor: () => void
  setActiveBranch: (parentId: string, messageId: string) => void
  clearActiveBranches: () => void
  openAddDialog: (mode?: AddDialogMode) => void
  closeAddDialog: () => void
  toggleRightSidebar: () => void

  // List view navigation
  enterChat: (chatId: string) => void  // 点击 Chat 进入 Topic 列表
  goBackToChats: () => void            // 返回 Chat 列表
  setListViewMode: (mode: ListViewMode) => void
}

export const useChatStore = create<ChatStore>((set) => ({
  selectedChatId: storedSelection.selectedChatId,
  selectedThreadId: storedSelection.selectedThreadId,
  lastThreadByChat: storedSelection.lastThreadByChat,
  messageAnchorId: null,
  activeBranchByParent: {},
  search: '',
  listViewMode: 'chats',
  isAddDialogOpen: false,
  addDialogMode: 'ai',
  showRightSidebar: false,

  setSearch: (search) => set({ search }),
  selectChat: (id) => set((state) => {
    const selectedThreadId = id ? state.lastThreadByChat[id] ?? null : null
    writeStoredChatSelection({ selectedChatId: id, selectedThreadId, lastThreadByChat: state.lastThreadByChat })
    return { selectedChatId: id, selectedThreadId, messageAnchorId: null, activeBranchByParent: {} }
  }),
  selectThread: (id) => set((state) => {
    const lastThreadByChat = id && state.selectedChatId
      ? { ...state.lastThreadByChat, [state.selectedChatId]: id }
      : state.lastThreadByChat
    writeStoredChatSelection({ selectedChatId: state.selectedChatId, selectedThreadId: id, lastThreadByChat })
    return { selectedThreadId: id, lastThreadByChat, messageAnchorId: null, activeBranchByParent: {} }
  }),
  setMessageAnchor: (messageAnchorId) => set({ messageAnchorId }),
  clearMessageAnchor: () => set({ messageAnchorId: null }),
  setActiveBranch: (parentId, messageId) => set((state) => ({ activeBranchByParent: { ...state.activeBranchByParent, [parentId]: messageId } })),
  clearActiveBranches: () => set({ activeBranchByParent: {} }),
  openAddDialog: (mode = 'ai') => set({ isAddDialogOpen: true, addDialogMode: mode }),
  closeAddDialog: () => set({ isAddDialogOpen: false }),
  toggleRightSidebar: () => set((state) => ({ showRightSidebar: !state.showRightSidebar })),

  // 进入某个 Chat，切换到 Topic 列表视图
  enterChat: (chatId) => set((state) => {
    const selectedThreadId = state.lastThreadByChat[chatId] ?? null
    writeStoredChatSelection({ selectedChatId: chatId, selectedThreadId, lastThreadByChat: state.lastThreadByChat })
    return {
      selectedChatId: chatId,
      selectedThreadId,
      messageAnchorId: null,
      activeBranchByParent: {},
      listViewMode: 'topics',
      search: '', // 清空搜索
    }
  }),

  // 返回 Chat 列表
  goBackToChats: () => set((state) => {
    writeStoredChatSelection({ selectedChatId: state.selectedChatId, selectedThreadId: null, lastThreadByChat: state.lastThreadByChat })
    return {
      listViewMode: 'chats',
      selectedThreadId: null,
      messageAnchorId: null,
      activeBranchByParent: {},
      search: '', // 清空搜索
    }
  }),

  setListViewMode: (mode) => set({ listViewMode: mode }),
}))
