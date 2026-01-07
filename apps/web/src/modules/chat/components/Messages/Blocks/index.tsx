/**
 * MessageBlockRenderer - 消息块渲染器
 * 
 * 参考 Cherry Studio: src/renderer/src/pages/home/Messages/Blocks/index.tsx
 * 根据块类型分发到对应的渲染组件
 */

import { memo, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  MessageBlockType,
  MessageBlockStatus,
  type MessageBlock,
  type MainTextMessageBlock,
  type ThinkingMessageBlock,
  type ToolMessageBlock,
  type ErrorMessageBlock,
  type PlaceholderMessageBlock,
} from '@linx/models'

import { MainTextBlock } from './MainTextBlock'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolBlock } from './ToolBlock'
import { ErrorBlock } from './ErrorBlock'
import { PlaceholderBlock } from './PlaceholderBlock'

interface MessageBlockRendererProps {
  /** 要渲染的块列表 */
  blocks: MessageBlock[]
  /** 消息角色 */
  role: 'user' | 'assistant'
  /** 消息是否正在处理中 */
  isProcessing?: boolean
  /** 消息 ID（用于生成占位块） */
  messageId?: string
  /** 重试回调 */
  onRetry?: () => void
  className?: string
}

/**
 * 消息块渲染器
 * - 根据块类型分发到对应组件
 * - 支持流式渲染时显示占位块
 * - 带动画效果
 */
export const MessageBlockRenderer = memo<MessageBlockRendererProps>(({
  blocks,
  role,
  isProcessing = false,
  messageId = 'unknown',
  onRetry,
  className,
}) => {
  // 过滤并排序块
  const sortedBlocks = useMemo(() => {
    return [...blocks].sort((a, b) => {
      // 按创建时间排序
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })
  }, [blocks])

  return (
    <div className={cn('message-blocks space-y-1', className)}>
      {sortedBlocks.map((block) => {
        switch (block.type) {
          case MessageBlockType.MAIN_TEXT:
          case MessageBlockType.CODE:
            return (
              <MainTextBlock
                key={block.id}
                block={block as MainTextMessageBlock}
                role={role}
              />
            )

          case MessageBlockType.THINKING:
            return (
              <ThinkingBlock
                key={block.id}
                block={block as ThinkingMessageBlock}
              />
            )

          case MessageBlockType.TOOL:
            return (
              <ToolBlock
                key={block.id}
                block={block as ToolMessageBlock}
              />
            )

          case MessageBlockType.ERROR:
            return (
              <ErrorBlock
                key={block.id}
                block={block as ErrorMessageBlock}
                onRetry={onRetry}
              />
            )

          case MessageBlockType.UNKNOWN:
            return (
              <PlaceholderBlock
                key={block.id}
                block={block as PlaceholderMessageBlock}
              />
            )

          // TODO: 后续迁移更多块类型
          case MessageBlockType.IMAGE:
          case MessageBlockType.FILE:
          case MessageBlockType.CITATION:
            // 暂时跳过这些类型
            return null

          default:
            console.warn('Unknown block type:', (block as MessageBlock).type)
            return null
        }
      })}

      {/* 处理中时显示占位块 */}
      {isProcessing && sortedBlocks.length === 0 && (
        <PlaceholderBlock
          block={{
            id: `loading-${messageId}`,
            messageId,
            type: MessageBlockType.UNKNOWN,
            status: MessageBlockStatus.PROCESSING,
            createdAt: new Date().toISOString(),
          }}
        />
      )}
    </div>
  )
})

MessageBlockRenderer.displayName = 'MessageBlockRenderer'

// 导出所有块组件
export { MainTextBlock } from './MainTextBlock'
export { ThinkingBlock } from './ThinkingBlock'
export { ToolBlock } from './ToolBlock'
export { ErrorBlock } from './ErrorBlock'
export { PlaceholderBlock } from './PlaceholderBlock'

export default MessageBlockRenderer
