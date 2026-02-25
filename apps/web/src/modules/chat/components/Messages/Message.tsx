/**
 * Message - 消息组件
 * 
 * 像素级对齐 Cherry Studio:
 * - MessageContainer: padding 10px, padding-bottom 0, border-radius 10px
 * - MessageContentContainer: padding-left 46px, margin-top 0
 * - MessageFooter: margin-left 46px, margin-top 3px, gap 10px
 * - menubar: opacity 0 -> 1 on hover, transition 0.2s ease
 * 
 * 结合 Lobe Chat 布局:
 * - variant: bubble | docs
 * - displayMode: chat (用户右侧) | assistant (全部左侧)
 */

import { memo, useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  MessageBlockType,
  parseMessageBlocks,
  createMessageBlock,
  type MessageBlock,
  type MainTextMessageBlock,
} from '@linx/models'
import { MessageBlockRenderer } from './Blocks'
import { MessageHeader } from './MessageHeader'
import { MessageMenubar } from './MessageMenubar'
import { Button } from '@/components/ui/button'

export interface MessageData {
  id: string
  role: 'user' | 'assistant' | 'system'
  content?: string
  richContent?: string
  status?: 'pending' | 'sending' | 'sent' | 'error'
  createdAt?: string | Date
  updatedAt?: string | Date
  model?: {
    id: string
    name: string
    provider: string
  }
  modelLogoUrl?: string
  card?: {
    title: string
    description?: string
    content?: ReactNode
    actionLabel?: string
    actionHref?: string
    actionOnClick?: () => void
  }
  assistant?: {
    id: string
    name: string
    avatar?: string
  }
}

export interface MessageProps {
  message: MessageData
  /** 用户头像 */
  userAvatar?: string
  /** 用户名称 */
  userName?: string
  /** 是否正在处理 */
  isProcessing?: boolean
  /** 是否是最后一条消息 */
  isLastMessage?: boolean
  /** 是否隐藏菜单栏 */
  hideMenubar?: boolean
  /** 显示样式: bubble (气泡) | docs (文档) */
  variant?: 'bubble' | 'docs'
  /** 显示模式: chat (对话, 用户右侧) | assistant (助手, 全部左侧) */
  displayMode?: 'chat' | 'assistant'
  /** 是否显示头像 */
  showAvatar?: boolean
  /** 是否显示标题 */
  showTitle?: boolean
  /** 重试回调 */
  onRetry?: () => void
  /** 编辑回调 */
  onEdit?: (message: MessageData) => void
  /** 复制回调 */
  onCopy?: (content: string) => void
  /** 删除回调 */
  onDelete?: (messageId: string) => void
  className?: string
}

/**
 * 将消息转换为 blocks
 */
function messageToBlocks(message: MessageData): MessageBlock[] {
  if (message.richContent) {
    const blocks = parseMessageBlocks(message.richContent)
    if (blocks.length > 0) return blocks
  }

  if (message.content) {
    return [
      createMessageBlock<MainTextMessageBlock>(
        MessageBlockType.MAIN_TEXT,
        message.id,
        { content: message.content }
      ),
    ]
  }

  return []
}

/**
 * 消息组件 - Cherry Studio 样式
 */
export const Message = memo<MessageProps>(({
  message,
  userAvatar,
  userName,
  isProcessing = false,
  isLastMessage = false,
  hideMenubar = false,
  variant = 'docs',
  displayMode = 'assistant',
  showAvatar = true,
  showTitle = true,
  onRetry,
  onEdit,
  onCopy,
  onDelete,
  className,
}) => {
  const [isHovering, setIsHovering] = useState(false)
  const isUser = message.role === 'user'
  
  // Cherry Studio: 用户和助手消息布局不同
  // 在 bubble 模式下用户消息右对齐
  const isUserBubble = variant === 'bubble' && isUser && displayMode === 'chat'

  // 转换为 blocks
  const blocks = useMemo(() => messageToBlocks(message), [message])

  // 显示菜单栏条件 (控制可见性，不控制渲染)
  // AI 消息: 始终显示 (或根据设计需求) -> 用户反馈 "AI消息是持续显示的"
  // 用户消息: 悬停显示
  // processing: 隐藏
  const isMenubarVisible = !hideMenubar && !isProcessing && (
    (!isUser) || // AI always visible
    (isUser && (isHovering || isLastMessage)) // User on hover or last
  )

  // 获取纯文本内容
  const plainContent = useMemo(() => {
    if (message.content) return message.content
    return blocks
      .filter((b): b is MainTextMessageBlock => b.type === MessageBlockType.MAIN_TEXT)
      .map(b => b.content)
      .join('\n\n')
  }, [message.content, blocks])

  const timestamp = message.updatedAt || message.createdAt

  return (
    <div
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className={cn(
        // Cherry Studio MessageContainer 样式
        'message group relative flex flex-col w-full',
        // padding: 10px, padding-bottom: 0
        'p-3 pb-0',
        // border-radius: 10px
        'rounded-lg',
        // 过渡
        'transition-colors duration-300',
        // 用户消息 vs 助手消息
        isUser ? 'message-user' : 'message-assistant',
        // Bubble 模式下用户消息背景
        isUserBubble && 'items-end',
        className
      )}
    >
      {/* Header - 头像 + 模型/用户名 + 时间 */}
      <MessageHeader
        role={message.role}
        model={message.model}
        modelLogoUrl={message.modelLogoUrl}
        assistant={message.assistant}
        userAvatar={userAvatar}
        userName={userName}
        timestamp={showTitle ? timestamp : undefined}
        isProcessing={isProcessing}
        showAvatarOnly={!showTitle}
        placement={isUserBubble ? 'right' : 'left'}
      />

      {/* Content Container - Cherry Studio: padding-left 46px */}
      <div 
        className={cn(
          'message-content-container max-w-full mt-0',
          // 根据是否显示头像决定 padding
          showAvatar && !isUserBubble && 'pl-12',
          showAvatar && isUserBubble && 'pr-12',
          // Bubble 模式特殊样式
          variant === 'bubble' && [
            'py-2 px-4',
            'bg-card border border-border/60',
            'rounded-lg',
            isUserBubble && 'bg-primary/5 border-primary/20',
          ]
        )}
      >
        <MessageBlockRenderer
          blocks={blocks}
          role={message.role as 'user' | 'assistant'}
          isProcessing={isProcessing}
          messageId={message.id}
          onRetry={onRetry}
        />

        {message.card && (
          <div className="mt-3 rounded-lg border border-border/60 bg-card/80 px-4 py-3">
            <div className="text-sm font-medium text-foreground">{message.card.title}</div>
            {message.card.description && (
              <div className="mt-1 text-xs text-muted-foreground">
                {message.card.description}
              </div>
            )}
            {message.card.content && (
              <div className="mt-3">
                {message.card.content}
              </div>
            )}
            {(message.card.actionLabel || message.card.actionHref || message.card.actionOnClick) && (
              <div className="mt-3">
                {message.card.actionHref ? (
                  <Button asChild size="sm">
                    <a href={message.card.actionHref}>{message.card.actionLabel || '打开'}</a>
                  </Button>
                ) : (
                  <Button size="sm" onClick={message.card.actionOnClick}>
                    {message.card.actionLabel || '打开'}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer - Cherry Studio: margin-left 46px, margin-top 3px */}
      {/* Always render to reserve space, control opacity for visibility */}
      <div 
        className={cn(
          'MessageFooter flex items-center justify-between gap-2.5 mt-1',
          // 最小高度，保留空间防止抖动
          'min-h-[24px]',
          showAvatar && !isUserBubble && 'ml-12',
          showAvatar && isUserBubble && 'mr-12 flex-row-reverse',
          // Opacity transition
          'transition-opacity duration-200',
          isMenubarVisible ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      >
        {!hideMenubar && !isProcessing && (
          <MessageMenubar
            messageId={message.id}
            role={message.role}
            content={plainContent}
            isLastMessage={isLastMessage}
            onEdit={onEdit ? () => onEdit(message) : undefined}
            onCopy={onCopy ? () => onCopy(plainContent) : undefined}
            onDelete={onDelete ? () => onDelete(message.id) : undefined}
            onRetry={onRetry}
          />
        )}
      </div>
    </div>
  )
})

Message.displayName = 'Message'

export default Message
