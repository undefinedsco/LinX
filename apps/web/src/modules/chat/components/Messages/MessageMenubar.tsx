/**
 * MessageMenubar - 消息操作栏组件
 * 
 * 对齐 Cherry Studio: src/renderer/src/pages/home/Messages/MessageMenubar.tsx
 * 提供消息的操作按钮：复制、编辑、重试、删除等
 * 
 * 样式规格：
 * - 按钮尺寸: 26px x 26px
 * - 图标尺寸: 15px
 * - gap: 8px
 * - borderRadius: 8px
 */

import { memo, useState, useCallback } from 'react'
import { Copy, Check, Pencil, RefreshCw, Trash2, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export interface MessageMenubarProps {
  /** 消息 ID */
  messageId: string
  /** 消息角色 */
  role: 'user' | 'assistant' | 'system'
  /** 文本内容（用于复制） */
  content?: string
  /** 是否是最后一条消息 */
  isLastMessage?: boolean
  /** 编辑回调 */
  onEdit?: () => void
  /** 复制回调 */
  onCopy?: () => void
  /** 删除回调 */
  onDelete?: () => void
  /** 重试回调（仅 assistant） */
  onRetry?: () => void
  className?: string
}

/**
 * ActionButton - 对齐 Cherry Studio 的按钮样式
 * 26px x 26px, borderRadius 8px
 */
const ActionButton = ({
  children,
  onClick,
  className,
  title,
}: {
  children: React.ReactNode
  onClick?: (e: React.MouseEvent) => void
  className?: string
  title?: string
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        className={cn(
          'message-action-button',
          'flex items-center justify-center',
          'w-[26px] h-[26px]',  // 26px x 26px
          'rounded-lg',         // borderRadius 8px
          'cursor-pointer',
          'transition-all duration-200',
          'text-muted-foreground/80',
          'hover:bg-muted hover:text-foreground',
          '[&_.lucide]:w-[15px] [&_.lucide]:h-[15px]', // 图标 15px
          className
        )}
        onClick={onClick}
      >
        {children}
      </button>
    </TooltipTrigger>
    {title && (
      <TooltipContent side="top" className="text-xs">
        <p>{title}</p>
      </TooltipContent>
    )}
  </Tooltip>
)

/**
 * 消息操作栏
 */
export const MessageMenubar = memo<MessageMenubarProps>(({
  role,
  content,
  isLastMessage: _isLastMessage,
  onEdit,
  onCopy,
  onDelete,
  onRetry,
  className,
}) => {
  const [copied, setCopied] = useState(false)

  const isUser = role === 'user'
  const isAssistant = role === 'assistant'

  // 复制处理
  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!content) return
    try {
      // 移除末尾双空格（对齐 Cherry Studio）
      const cleanContent = content.replace(/  +$/gm, '').trimStart()
      await navigator.clipboard.writeText(cleanContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      onCopy?.()
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [content, onCopy])

  return (
    <div className={cn(
      'menubar',
      'flex items-center justify-end',
      'gap-2', // 8px
      className
    )}>
      {/* Copy */}
      {content && (
        <ActionButton onClick={handleCopy} title="复制">
          {copied ? (
            <Check className="lucide text-primary" />
          ) : (
            <Copy className="lucide" />
          )}
        </ActionButton>
      )}

      {/* User: Regenerate (重新发送) */}
      {isUser && onRetry && (
        <ActionButton onClick={(e) => { e.stopPropagation(); onRetry(); }} title="重新生成">
          <RefreshCw className="lucide" />
        </ActionButton>
      )}

      {/* User: Edit */}
      {isUser && onEdit && (
        <ActionButton onClick={(e) => { e.stopPropagation(); onEdit(); }} title="编辑">
          <Pencil className="lucide" />
        </ActionButton>
      )}

      {/* Assistant: Regenerate */}
      {isAssistant && onRetry && (
        <ActionButton onClick={(e) => { e.stopPropagation(); onRetry(); }} title="重新生成">
          <RefreshCw className="lucide" />
        </ActionButton>
      )}

      {/* Delete */}
      {onDelete && (
        <ActionButton 
          onClick={(e) => { e.stopPropagation(); onDelete(); }} 
          title="删除"
          className="hover:text-destructive"
        >
          <Trash2 className="lucide" />
        </ActionButton>
      )}

      {/* More Menu (Assistant only) */}
      {isAssistant && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'message-action-button',
                'flex items-center justify-center',
                'w-[26px] h-[26px]',
                'rounded-lg',
                'cursor-pointer',
                'transition-all duration-200',
                'text-muted-foreground/80',
                'hover:bg-muted hover:text-foreground',
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="w-[19px] h-[19px]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {/* Copy in menu */}
            {content && (
              <DropdownMenuItem onClick={handleCopy}>
                <Copy className="w-4 h-4 mr-2" />
                复制
              </DropdownMenuItem>
            )}

            {/* Edit */}
            {onEdit && (
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="w-4 h-4 mr-2" />
                编辑消息
              </DropdownMenuItem>
            )}

            {/* Retry */}
            {onRetry && (
              <DropdownMenuItem onClick={onRetry}>
                <RefreshCw className="w-4 h-4 mr-2" />
                重新生成
              </DropdownMenuItem>
            )}

            {/* Delete */}
            {onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  删除
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
})

MessageMenubar.displayName = 'MessageMenubar'

export default MessageMenubar
