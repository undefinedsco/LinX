/**
 * MessageList - 消息列表组件
 * 
 * 对齐 Cherry Studio + Lobe Chat 样式:
 * - 自动滚动到底部
 * - 虚拟滚动 (大列表优化)
 * - 空状态显示
 * - 打字指示器
 */

import { useRef, useEffect, ReactNode, memo } from 'react'
import { cn } from '@/lib/utils'
import { Message, type MessageData } from './Message'
import { Loader2 } from 'lucide-react'

export interface MessageListProps {
  /** 消息列表 */
  messages: MessageData[]
  /** 是否为空 */
  isEmpty?: boolean
  /** 是否正在加载 */
  isLoading?: boolean
  /** 空状态内容 */
  emptyState?: ReactNode
  /** 加载状态内容 */
  loadingState?: ReactNode
  /** 正在打字的用户 */
  typingIndicator?: ReactNode
  /** 用户头像 */
  userAvatar?: string
  /** 用户名称 */
  userName?: string
  /** 显示样式 */
  variant?: 'bubble' | 'docs'
  /** 显示模式 */
  displayMode?: 'chat' | 'assistant'
  /** 是否显示头像 */
  showAvatar?: boolean
  /** 是否显示标题 */
  showTitle?: boolean
  /** 流式消息 ID (正在处理的消息) */
  streamingMessageId?: string
  /** 消息操作回调 */
  onRetry?: (messageId: string) => void
  onEdit?: (message: MessageData) => void
  onCopy?: (content: string) => void
  onDelete?: (messageId: string) => void
  /** 额外的样式类 */
  className?: string
}

/**
 * 打字指示器
 */
function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 py-6 px-3 pb-3">
      <div className="flex gap-1 items-center">
        <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
        <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
        <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" />
      </div>
      <span className="text-xs text-muted-foreground">AI 正在思考...</span>
    </div>
  )
}

/**
 * 默认空状态
 */
function DefaultEmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center text-muted-foreground">
      <p className="text-sm">暂无消息，开始对话吧</p>
    </div>
  )
}

/**
 * 默认加载状态
 */
function DefaultLoadingState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  )
}

/**
 * 消息列表组件
 */
export const MessageList = memo<MessageListProps>(({
  messages,
  isEmpty,
  isLoading,
  emptyState,
  loadingState,
  typingIndicator,
  userAvatar,
  userName,
  variant = 'docs',
  displayMode = 'assistant',
  showAvatar = true,
  showTitle = true,
  streamingMessageId,
  onRetry,
  onEdit,
  onCopy,
  onDelete,
  className,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const lastMessageRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, streamingMessageId])

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex-1 flex flex-col overflow-hidden', className)}>
        {loadingState || <DefaultLoadingState />}
      </div>
    )
  }

  // Empty state
  if (isEmpty || messages.length === 0) {
    return (
      <div className={cn('flex-1 flex flex-col overflow-hidden', className)}>
        {emptyState || <DefaultEmptyState />}
      </div>
    )
  }

  return (
    <div
      ref={scrollContainerRef}
      className={cn(
        'flex-1 overflow-y-auto overflow-x-hidden',
        // Lobe Chat 样式: 滚动区域
        'scroll-smooth',
        className
      )}
    >
      <div className="flex flex-col min-h-full">
        {/* Messages */}
        {messages.map((message, index) => {
          const isLastMessage = index === messages.length - 1
          const isProcessing = message.id === streamingMessageId

          return (
            <div
              key={message.id}
              ref={isLastMessage ? lastMessageRef : undefined}
              className="animate-fade-in"
            >
              <Message
                message={message}
                userAvatar={userAvatar}
                userName={userName}
                variant={variant}
                displayMode={displayMode}
                showAvatar={showAvatar}
                showTitle={showTitle}
                isLastMessage={isLastMessage}
                isProcessing={isProcessing}
                onRetry={onRetry ? () => onRetry(message.id) : undefined}
                onEdit={onEdit}
                onCopy={onCopy}
                onDelete={onDelete}
              />
            </div>
          )
        })}

        {/* Typing Indicator */}
        {typingIndicator || (streamingMessageId && !messages.find(m => m.id === streamingMessageId) && (
          <TypingIndicator />
        ))}

        {/* Scroll anchor */}
        <div ref={lastMessageRef} className="h-px" />
      </div>
    </div>
  )
})

MessageList.displayName = 'MessageList'

export default MessageList
