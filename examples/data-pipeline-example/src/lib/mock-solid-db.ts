// Mock Solid Pod 数据库
import { ChatRow, ChatInsert } from '@/types/chat'

class MockSolidDatabase {
  private mockChats: ChatRow[] = [
    {
      id: 'chat-1',
      title: 'AI Assistant Chat',
      description: 'Chat with Claude AI',
      conversationType: 'ai',
      status: 'active',
      participants: ['https://alice.pod.com/profile/card#me'],
      creator: 'https://alice.pod.com/profile/card#me',
      createdAt: new Date('2024-01-15T10:00:00Z'),
      modifiedAt: new Date('2024-01-15T10:00:00Z'),
      lastMessage: 'chat-1-message-5',
      lastMessageAt: new Date('2024-01-15T15:30:00Z'),
      archivedAt: null,
      pinnedAt: null,
    },
    {
      id: 'chat-2', 
      title: 'Project Discussion',
      description: 'LinX project planning',
      conversationType: 'group',
      status: 'active',
      participants: [
        'https://alice.pod.com/profile/card#me',
        'https://bob.pod.com/profile/card#me'
      ],
      creator: 'https://alice.pod.com/profile/card#me',
      createdAt: new Date('2024-01-14T09:00:00Z'),
      modifiedAt: new Date('2024-01-14T09:00:00Z'),
      lastMessage: 'chat-2-message-8',
      lastMessageAt: new Date('2024-01-15T14:20:00Z'),
      archivedAt: null,
      pinnedAt: new Date('2024-01-15T12:00:00Z'),
    },
    {
      id: 'chat-3',
      title: 'Quick Chat with Bob',
      description: null,
      conversationType: 'direct',
      status: 'active',
      participants: [
        'https://alice.pod.com/profile/card#me',
        'https://bob.pod.com/profile/card#me'
      ],
      creator: 'https://alice.pod.com/profile/card#me',
      createdAt: new Date('2024-01-13T16:30:00Z'),
      modifiedAt: new Date('2024-01-13T16:30:00Z'),
      lastMessage: 'chat-3-message-3',
      lastMessageAt: new Date('2024-01-15T11:45:00Z'),
      archivedAt: null,
      pinnedAt: null,
    },
    {
      id: 'chat-4',
      title: 'Old Discussion',
      description: 'Archived conversation',
      conversationType: 'group',
      status: 'archived',
      participants: ['https://alice.pod.com/profile/card#me'],
      creator: 'https://alice.pod.com/profile/card#me',
      createdAt: new Date('2024-01-10T08:00:00Z'),
      modifiedAt: new Date('2024-01-10T08:00:00Z'),
      lastMessage: 'chat-4-message-1',
      lastMessageAt: new Date('2024-01-10T08:30:00Z'),
      archivedAt: new Date('2024-01-12T10:00:00Z'),
      pinnedAt: null,
    },
    {
      id: 'chat-5',
      title: 'Design Review',
      description: 'UI/UX feedback session',
      conversationType: 'group',
      status: 'active',
      participants: [
        'https://alice.pod.com/profile/card#me',
        'https://charlie.pod.com/profile/card#me'
      ],
      creator: 'https://charlie.pod.com/profile/card#me',
      createdAt: new Date('2024-01-12T14:00:00Z'),
      modifiedAt: new Date('2024-01-12T14:00:00Z'),
      lastMessage: 'chat-5-message-12',
      lastMessageAt: new Date('2024-01-15T13:15:00Z'),
      archivedAt: null,
      pinnedAt: null,
    }
  ]

  // 模拟网络延迟
  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // 获取所有聊天
  async getAllChats(): Promise<ChatRow[]> {
    await this.delay(300) // 模拟网络请求
    return [...this.mockChats].sort((a, b) => {
      // 置顶的排在前面
      if (a.pinnedAt && !b.pinnedAt) return -1
      if (!a.pinnedAt && b.pinnedAt) return 1
      // 然后按最后消息时间排序
      const aTime = a.lastMessageAt?.getTime() || 0
      const bTime = b.lastMessageAt?.getTime() || 0
      return bTime - aTime
    })
  }

  // 根据ID获取聊天
  async getChatById(id: string): Promise<ChatRow | null> {
    await this.delay(150)
    return this.mockChats.find(chat => chat.id === id) || null
  }

  // 创建新聊天
  async createChat(data: ChatInsert): Promise<ChatRow> {
    await this.delay(400)
    
    const newChat: ChatRow = {
      id: `chat-${Date.now()}`,
      createdAt: new Date(),
      modifiedAt: new Date(),
      archivedAt: null,
      pinnedAt: null,
      lastMessage: null,
      lastMessageAt: null,
      status: 'active',
      ...data,
    }

    this.mockChats.unshift(newChat)
    return newChat
  }

  // 更新聊天
  async updateChat(id: string, updates: Partial<ChatRow>): Promise<ChatRow | null> {
    await this.delay(250)
    
    const chatIndex = this.mockChats.findIndex(chat => chat.id === id)
    if (chatIndex >= 0) {
      this.mockChats[chatIndex] = {
        ...this.mockChats[chatIndex],
        ...updates,
        modifiedAt: new Date(),
      }
      return this.mockChats[chatIndex]
    }
    return null
  }

  // 删除聊天
  async deleteChat(id: string): Promise<boolean> {
    await this.delay(200)
    
    const chatIndex = this.mockChats.findIndex(chat => chat.id === id)
    if (chatIndex >= 0) {
      this.mockChats.splice(chatIndex, 1)
      return true
    }
    return false
  }
}

export const mockDb = new MockSolidDatabase()