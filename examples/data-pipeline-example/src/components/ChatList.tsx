// 简单的聊天列表组件 - 数据驱动
import { ChatRow } from '@/types/chat'

interface ChatListProps {
  chats: ChatRow[]
  selectedChatId: string | null
  onSelectChat: (chatId: string) => void
  isLoading?: boolean
}

export function ChatList({ chats, selectedChatId, onSelectChat, isLoading }: ChatListProps) {
  if (isLoading) return <div>加载中...</div>
  if (chats.length === 0) return <div>暂无聊天</div>

  return (
    <div className="space-y-2">
      {chats.map((chat) => (
        <div
          key={chat.id}
          className={`p-3 border rounded cursor-pointer ${
            chat.id === selectedChatId ? 'bg-blue-100' : 'hover:bg-gray-50'
          }`}
          onClick={() => onSelectChat(chat.id)}
        >
          <div className="font-medium">{chat.title}</div>
          <div className="text-sm text-gray-500">{chat.conversationType}</div>
          <div className="text-xs text-gray-400">
            {chat.participants.length} 人 • {chat.status}
          </div>
        </div>
      ))}
    </div>
  )
}