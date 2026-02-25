// 简单的聊天详情组件 - 数据驱动
import { ChatRow } from '@/types/chat'

interface ChatDetailProps {
  chat: ChatRow | null | undefined
  isLoading?: boolean
}

export function ChatDetail({ chat, isLoading }: ChatDetailProps) {
  if (isLoading) return <div>加载中...</div>
  if (!chat) return <div>请选择聊天</div>

  return (
    <div className="p-4 border rounded">
      <h2 className="text-xl font-bold mb-4">{chat.title}</h2>
      
      <div className="space-y-2 text-sm">
        <div><strong>ID:</strong> {chat.id}</div>
        <div><strong>类型:</strong> {chat.conversationType}</div>
        <div><strong>状态:</strong> {chat.status}</div>
        <div><strong>描述:</strong> {chat.description || '无'}</div>
        <div><strong>参与者:</strong> {chat.participants.length} 人</div>
        <div><strong>创建时间:</strong> {chat.createdAt.toLocaleString()}</div>
        <div><strong>是否置顶:</strong> {chat.pinnedAt ? '是' : '否'}</div>
      </div>
      
      <div className="mt-4">
        <h3 className="font-medium mb-2">参与者列表:</h3>
        <ul className="text-xs space-y-1">
          {chat.participants.map((participant, index) => (
            <li key={participant} className="truncate">
              {index + 1}. {participant}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}