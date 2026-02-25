// TanStack Query hooks for chat data using drizzle-solid
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { db, chatTable, eq } from '@/lib/drizzle-solid-client'
import { ChatRow, ChatInsert } from '@/types/chat'

// 查询所有聊天
export function useChats() {
  return useQuery({
    queryKey: ['chats'],
    queryFn: () => db.select().from(chatTable).execute(),
  })
}

// 查询单个聊天
export function useChat(chatId: string | null) {
  return useQuery({
    queryKey: ['chats', chatId],
    queryFn: async () => {
      if (!chatId) return null
      // 这里应该是单独查询，现在先从列表中找
      const chats = await db.select().from(chatTable).execute()
      return chats.find(chat => chat.id === chatId) || null
    },
    enabled: !!chatId,
  })
}

// 创建聊天
export function useCreateChat() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: ChatInsert) => {
      const result = await db.insert(chatTable).values(data).returning().execute()
      return result[0]
    },
    onSuccess: (newChat) => {
      // 乐观更新：立即更新聊天列表缓存
      queryClient.setQueryData(['chats'], (oldChats: ChatRow[] = []) => {
        return [newChat, ...oldChats]
      })
    },
    onError: () => {
      // 失败时重新获取数据
      queryClient.invalidateQueries({ queryKey: ['chats'] })
    }
  })
}

// 更新聊天
export function useUpdateChat() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ chatId, updates }: { chatId: string, updates: Partial<ChatRow> }) => {
      const result = await db.update(chatTable)
        .set(updates)
        .where(eq(chatTable, chatId))
        .returning()
        .execute()
      return result[0]
    },
    onSuccess: (updatedChat) => {
      if (updatedChat) {
        // 更新聊天列表缓存
        queryClient.setQueryData(['chats'], (oldChats: ChatRow[] = []) => {
          return oldChats.map(chat => 
            chat.id === updatedChat.id ? updatedChat : chat
          )
        })
        
        // 更新单个聊天缓存
        queryClient.setQueryData(['chats', updatedChat.id], updatedChat)
      }
    }
  })
}

// 删除聊天（软删除）
export function useDeleteChat() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (chatId: string) => {
      // 软删除：更新状态为 deleted
      const result = await db.update(chatTable)
        .set({ status: 'deleted' })
        .where(eq(chatTable, chatId))
        .returning()
        .execute()
      return result[0]
    },
    onSuccess: (updatedChat, chatId) => {
      if (updatedChat) {
        // 从缓存中移除
        queryClient.setQueryData(['chats'], (oldChats: ChatRow[] = []) => {
          return oldChats.filter(chat => chat.id !== chatId)
        })
        
        // 移除单个聊天缓存
        queryClient.removeQueries({ queryKey: ['chats', chatId] })
      }
    }
  })
}