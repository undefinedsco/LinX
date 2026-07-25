export type ChatListFolderFilter = 'all' | 'unread'

export interface ChatListFolderItem {
  id: string
  starred: boolean
  unreadCount: number
}

export interface ChatListFolderSections<T extends ChatListFolderItem> {
  pinned: T[]
  unpinned: T[]
}

// 置顶段（starred，含 AI Secretary）恒显，不受 folder 过滤影响——否则切到“未读”会
// 把置顶会话也藏起来，置顶就失去意义。folder 过滤仅作用于非置顶段。
// 搜索与此正交：调用方先按搜索词过滤 items，再传入本函数。
export function projectChatListFolderSections<T extends ChatListFolderItem>(
  items: readonly T[],
  filter: ChatListFolderFilter,
): ChatListFolderSections<T> {
  const pinned: T[] = []
  const unpinned: T[] = []
  for (const item of items) {
    if (item.starred) {
      pinned.push(item)
    } else if (matchesChatListFolderFilter(item, filter)) {
      unpinned.push(item)
    }
  }
  return { pinned, unpinned }
}

function matchesChatListFolderFilter(item: ChatListFolderItem, filter: ChatListFolderFilter): boolean {
  if (filter === 'unread') return item.unreadCount > 0
  return true
}
