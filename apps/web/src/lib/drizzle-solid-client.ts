// Mock drizzle-solid client for demo purposes
// TODO: Replace with actual drizzle-solid implementation

import { type ChatRow, type ChatInsert } from '@linx/models'

// Mock database implementation
class MockSolidDatabase {
  private mockChats: ChatRow[] = [
    {
      subject: 'chat-1',
      title: 'AI Assistant Chat',
      description: 'Chat with Claude AI',
      provider: 'anthropic',
      model: 'claude-3-sonnet',
      systemPrompt: 'You help coordinate schedules.',
      starred: false,
      participants: ['https://alice.pod.com/profile/card#me'],
      createdAt: new Date('2024-01-15T10:00:00Z'),
      updatedAt: new Date('2024-01-15T10:00:00Z'),
      lastMessagePreview: '最近一条消息预览',
      lastActiveAt: new Date('2024-01-15T15:30:00Z'),
    },
    {
      subject: 'chat-2',
      title: 'Project Discussion',
      description: 'LinX project planning',
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'You are a helpful scrum master.',
      starred: true,
      participants: [
        'https://alice.pod.com/profile/card#me',
        'https://bob.pod.com/profile/card#me'
      ],
      createdAt: new Date('2024-01-14T09:00:00Z'),
      updatedAt: new Date('2024-01-15T12:00:00Z'),
      lastMessagePreview: '讨论进展到任务分解。',
      lastActiveAt: new Date('2024-01-15T14:20:00Z'),
    },
    {
      subject: 'chat-3',
      title: 'Quick Chat with Bob',
      description: '',
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'Keep the tone casual.',
      starred: false,
      participants: [
        'https://alice.pod.com/profile/card#me',
        'https://bob.pod.com/profile/card#me'
      ],
      createdAt: new Date('2024-01-13T16:30:00Z'),
      updatedAt: new Date('2024-01-13T16:30:00Z'),
      lastMessagePreview: '明天再确认一次会议时间。',
      lastActiveAt: new Date('2024-01-15T11:45:00Z'),
    },
    {
      subject: 'chat-4',
      title: 'Old Discussion',
      description: 'Archived conversation',
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      systemPrompt: 'Archive ready.',
      starred: false,
      participants: ['https://alice.pod.com/profile/card#me'],
      createdAt: new Date('2024-01-10T08:00:00Z'),
      updatedAt: new Date('2024-01-12T10:00:00Z'),
      lastMessagePreview: '归档前的最后一条消息。',
      lastActiveAt: new Date('2024-01-10T08:30:00Z'),
    }
  ]

  // 模拟查询延迟
  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async select() {
    return {
      from: (table: any) => ({
        execute: async (): Promise<ChatRow[]> => {
          await this.delay(200) // 模拟网络延迟
          return [...this.mockChats]
        },
        where: (condition: any) => ({
          execute: async (): Promise<ChatRow[]> => {
            await this.delay(150)
            // 简单模拟 where 查询，实际应该解析 condition
            return this.mockChats.filter(chat => chat.status === 'active')
          }
        })
      })
    }
  }

  async insert(table: any) {
    return {
      values: (data: ChatInsert) => ({
        returning: () => ({
          execute: async (): Promise<ChatRow[]> => {
            await this.delay(300)
            
            const newChat: ChatRow = {
              subject: `chat-${Date.now()}`,
              title: data.title,
              description: data.description ?? '',
              provider: data.provider ?? 'openai',
              model: data.model ?? 'gpt-4o-mini',
              systemPrompt: data.systemPrompt ?? '',
              starred: Boolean(data.starred),
              participants: data.participants ?? [],
              lastMessagePreview: data.lastMessagePreview,
              lastActiveAt: data.lastActiveAt ?? new Date(),
              createdAt: data.createdAt ?? new Date(),
              updatedAt: data.updatedAt ?? new Date(),
            } as ChatRow

            this.mockChats.unshift(newChat)
            return [newChat]
          }
        })
      })
    }
  }

  async update(table: any) {
    return {
      set: (data: Partial<ChatRow>) => ({
        where: (condition: any) => ({
          returning: () => ({
            execute: async (): Promise<ChatRow[]> => {
              await this.delay(250)
              
              // 简单模拟更新逻辑
              const chatIndex = this.mockChats.findIndex(chat => chat.subject === (condition as any).chatId)
              if (chatIndex >= 0) {
                this.mockChats[chatIndex] = {
                  ...this.mockChats[chatIndex],
                  ...data,
                  updatedAt: new Date(),
                }
                return [this.mockChats[chatIndex]]
              }
              return []
            }
          })
        })
      })
    }
  }
}

// 导出模拟的数据库实例
export const db = new MockSolidDatabase()

// 模拟 drizzle 的 eq 函数
export const eq = (column: any, value: any) => ({ column, value })
