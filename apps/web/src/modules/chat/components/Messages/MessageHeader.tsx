/**
 * MessageHeader - 消息头部组件
 * 
 * 对齐:
 * - Cherry Studio: Avatar 35px, borderRadius 25%, 名称 14px font-weight 600
 * - Lobe Chat: placement left/right, 时间 12px
 */

import { memo, useMemo } from 'react'
import { User, Bot, Loader2 } from 'lucide-react'
import dayjs from 'dayjs'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export interface MessageHeaderProps {
  role: 'user' | 'assistant' | 'system'
  model?: {
    id: string
    name: string
    provider: string
  }
  modelLogoUrl?: string
  assistant?: {
    id: string
    name: string
    avatar?: string
  }
  userAvatar?: string
  userName?: string
  timestamp?: string | Date
  isProcessing?: boolean
  /** 布局位置 */
  placement?: 'left' | 'right'
  /** 只显示头像 */
  showAvatarOnly?: boolean
  /** 只显示标题 */
  showTitleOnly?: boolean
  className?: string
}

/**
 * 格式化时间 - MM/DD HH:mm
 */
function formatTime(timestamp?: string | Date): string {
  if (!timestamp) return ''
  const date = dayjs(timestamp)
  if (!date.isValid()) return ''
  return date.format('MM/DD HH:mm')
}

/**
 * 消息头部组件
 */
export const MessageHeader = memo<MessageHeaderProps>(({
  role,
  model,
  modelLogoUrl,
  assistant,
  userAvatar,
  userName,
  timestamp,
  isProcessing,
  placement = 'left',
  showAvatarOnly = false,
  showTitleOnly = false,
  className,
}) => {
  const isUser = role === 'user'
  const isAssistant = role === 'assistant'

  // 显示名称
  const displayName = useMemo(() => {
    if (isUser) return userName || '你'
    if (assistant?.name) return assistant.name
    if (model?.name) return model.name
    if (model?.id) return model.id
    return 'AI 助手'
  }, [isUser, userName, assistant, model])

  // 头像源
  const avatarSrc = useMemo(() => {
    if (isUser) return userAvatar
    if (assistant?.avatar) return assistant.avatar
    return modelLogoUrl
  }, [isUser, userAvatar, assistant, modelLogoUrl])

  // 头像 fallback 文字
  const avatarFallbackText = useMemo(() => {
    if (displayName) return displayName.charAt(0).toUpperCase()
    return isUser ? 'U' : 'AI'
  }, [displayName, isUser])

  const timeStr = formatTime(timestamp)

  // 只显示标题
  if (showTitleOnly) {
    return (
      <div className={cn(
        'flex items-center gap-1.5 mb-1.5',
        placement === 'left' ? 'justify-start' : 'justify-end',
        className
      )}>
        {/* Name - 12px, color text-description */}
        <span className={cn(
          'text-xs text-muted-foreground leading-none',
          placement === 'right' && 'order-2'
        )}>
          {displayName}
        </span>

        {/* Time */}
        {timeStr && (
          <time className={cn(
            'text-xs text-muted-foreground/60 leading-none whitespace-nowrap',
            placement === 'right' && 'order-1'
          )}>
            {timeStr}
          </time>
        )}

        {/* Processing indicator */}
        {isProcessing && isAssistant && (
          <Loader2 className="w-3 h-3 text-primary animate-spin" />
        )}
      </div>
    )
  }

  // 只显示头像
  if (showAvatarOnly) {
    return (
      <div className={cn(
        'relative flex-shrink-0',
        'w-[35px] h-[35px]',  // Cherry Studio: 35px
        className
      )}>
        <Avatar className={cn(
          'h-[35px] w-[35px]',
          'rounded-[25%]',     // Cherry Studio: borderRadius 25%
        )}>
          {avatarSrc && (
            <AvatarImage 
              src={avatarSrc} 
              alt={displayName}
              className="rounded-[25%] object-cover"
            />
          )}
          <AvatarFallback className={cn(
            'rounded-[25%] text-xs font-medium',
            isUser ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}>
            {avatarSrc ? avatarFallbackText : (
              isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />
            )}
          </AvatarFallback>
        </Avatar>

        {/* Loading indicator on avatar */}
        {isProcessing && isAssistant && (
          <div className={cn(
            'absolute -bottom-1',
            placement === 'left' ? '-right-1' : '-left-1',
            'w-4 h-4 rounded-full',
            'bg-primary text-primary-foreground',
            'flex items-center justify-center'
          )}>
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
          </div>
        )}
      </div>
    )
  }

  // 完整显示：头像 + 名称 + 时间（Cherry Studio 风格）
  return (
    <div className={cn(
      'message-header flex items-center relative gap-2.5 mb-2.5',
      className
    )}>
      {/* Avatar */}
      <Avatar className={cn(
        'shrink-0 h-[35px] w-[35px] rounded-[25%]',
      )}>
        {avatarSrc && (
          <AvatarImage src={avatarSrc} alt={displayName} className="rounded-[25%] object-cover" />
        )}
        <AvatarFallback className={cn(
          'rounded-[25%] text-xs font-medium',
          isUser ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
        )}>
          {avatarSrc ? avatarFallbackText : (
            isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />
          )}
        </AvatarFallback>
      </Avatar>

      {/* Info */}
      <div className="flex flex-col flex-1 justify-between">
        <div className="flex items-center">
          {/* Name - 14px, font-weight 600 */}
          <span className="text-[14px] font-semibold text-foreground">
            {displayName}
          </span>
          {isProcessing && isAssistant && (
            <Loader2 className="w-3.5 h-3.5 ml-2 text-primary animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-1">
          {timeStr && (
            <time className="text-xs text-muted-foreground/60">
              {timeStr}
            </time>
          )}
        </div>
      </div>
    </div>
  )
})

MessageHeader.displayName = 'MessageHeader'

export default MessageHeader
