import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 格式化时间
export function formatTime(date: Date | null): string {
  if (!date) return ''
  
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric'
  })
}

// 获取聊天类型图标
export function getChatTypeIcon(type: 'direct' | 'group' | 'ai'): string {
  switch (type) {
    case 'direct': return '👤'
    case 'group': return '👥' 
    case 'ai': return '🤖'
    default: return '💬'
  }
}

// 获取聊天类型标签
export function getChatTypeLabel(type: 'direct' | 'group' | 'ai'): string {
  switch (type) {
    case 'direct': return '私聊'
    case 'group': return '群聊'
    case 'ai': return 'AI助手'
    default: return '聊天'
  }
}