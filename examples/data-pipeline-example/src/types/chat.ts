// 聊天数据类型（简化版的 @linx/models）
export interface ChatRow {
  id: string
  title: string
  description: string | null
  conversationType: 'direct' | 'group' | 'ai'
  status: 'active' | 'archived' | 'deleted'
  participants: string[]
  creator: string
  createdAt: Date
  modifiedAt: Date
  lastMessage: string | null
  lastMessageAt: Date | null
  archivedAt: Date | null
  pinnedAt: Date | null
}

export interface ChatInsert {
  title: string
  description?: string | null
  conversationType: 'direct' | 'group' | 'ai'
  status?: 'active' | 'archived' | 'deleted'
  participants: string[]
  creator: string
}