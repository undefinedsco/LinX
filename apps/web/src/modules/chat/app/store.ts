import { create } from 'zustand'
import { useAskLinx } from '@/lib/ask-linx'

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

/** 聊天信息 is closed by default and remembers the last open/closed choice. */
const CHAT_INFO_OPEN_STORAGE_KEY = 'linx:chat-info-open:v1'

function readStoredChatInfoOpen(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(CHAT_INFO_OPEN_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function writeStoredChatInfoOpen(open: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CHAT_INFO_OPEN_STORAGE_KEY, open ? 'true' : 'false')
  } catch {
    // Remembering the panel is a convenience; it must never block chat.
  }
}

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
  /** Bumped to ask the header to open 执行条件 (e.g. from the right sidebar). */
  executionConditionsRequest: number
  /** Bumped by ⌘K (or anyone) to open the search panel in the list column. */
  searchRequest: number

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
  setRightSidebarOpen: (open: boolean) => void
  requestExecutionConditions: () => void
  requestSearch: () => void

  // List view navigation
  enterChat: (chatId: string) => void  // 点击 Chat 进入 Topic 列表
  goBackToChats: () => void            // 返回 Chat 列表
  setListViewMode: (mode: ListViewMode) => void
}

function isCompactViewport() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 699px)').matches
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
  // Compact windows show 聊天信息 as a full-screen task view, so a remembered
  // desktop "open" must not cover the chat on entry.
  showRightSidebar: readStoredChatInfoOpen() && !isCompactViewport(),
  executionConditionsRequest: 0,
  searchRequest: 0,

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
  toggleRightSidebar: () => set((state) => {
    writeStoredChatInfoOpen(!state.showRightSidebar)
    return { showRightSidebar: !state.showRightSidebar }
  }),
  setRightSidebarOpen: (open) => set(() => {
    writeStoredChatInfoOpen(open)
    return { showRightSidebar: open }
  }),
  requestExecutionConditions: () => set((state) => ({ executionConditionsRequest: state.executionConditionsRequest + 1 })),
  requestSearch: () => set((state) => ({ searchRequest: state.searchRequest + 1 })),

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

// 问 LinX (`@/lib/ask-linx`): the chat module takes these requests for as long as
// the app lives. The chat pane selects the LinX 助手 chat and its composer takes
// the quoted prompt (ChatContentPane, useAskLinxIntoComposer).
useAskLinx.getState().listen()
