/**
 * MessageBlockRenderer - 消息块渲染器
 * 
 * 参考 Cherry Studio: src/renderer/src/pages/home/Messages/Blocks/index.tsx
 * 根据块类型分发到对应的渲染组件
 */

import { Fragment, memo, useMemo } from 'react'
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
} from '../message-blocks'

import { MainTextBlock } from './MainTextBlock'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolBlock } from './ToolBlock'
import { ToolApprovalBlock } from './ToolApprovalBlock'
import { TaskProgressBlock } from './TaskProgressBlock'
import { ErrorBlock } from './ErrorBlock'
import { PlaceholderBlock } from './PlaceholderBlock'
import { ImageBlock } from './ImageBlock'
import { FileBlock } from './FileBlock'
import { CitationBlock } from './CitationBlock'
import {
  registerMessageBlockRenderer,
  renderRegisteredMessageBlock,
} from './renderer-registry'

let builtInRenderersRegistered = false

function registerBuiltInRenderers() {
  if (builtInRenderersRegistered) return
  builtInRenderersRegistered = true

  registerMessageBlockRenderer(MessageBlockType.MAIN_TEXT, (block, context) => (
    <MainTextBlock block={block as MainTextMessageBlock} role={context.role} />
  ))
  registerMessageBlockRenderer(MessageBlockType.CODE, (block, context) => (
    <MainTextBlock block={block as MainTextMessageBlock} role={context.role} />
  ))
  registerMessageBlockRenderer(MessageBlockType.THINKING, (block) => (
    <ThinkingBlock block={block as ThinkingMessageBlock} />
  ))
  registerMessageBlockRenderer(MessageBlockType.TOOL, (block) => (
    <ToolBlock block={block as ToolMessageBlock} />
  ))
  registerMessageBlockRenderer(MessageBlockType.TOOL_APPROVAL, (block, context) => (
    <ToolApprovalBlock
      block={block as Extract<MessageBlock, { type: MessageBlockType.TOOL_APPROVAL }>}
      onApprove={context.onToolApprove}
      onReject={context.onToolReject}
    />
  ))
  registerMessageBlockRenderer(MessageBlockType.TASK_PROGRESS, (block) => (
    <TaskProgressBlock block={block as Extract<MessageBlock, { type: MessageBlockType.TASK_PROGRESS }>} />
  ))
  registerMessageBlockRenderer(MessageBlockType.ERROR, (block, context) => (
    <ErrorBlock block={block as ErrorMessageBlock} onRetry={context.onRetry} />
  ))
  registerMessageBlockRenderer(MessageBlockType.UNKNOWN, (block) => (
    <PlaceholderBlock block={block as PlaceholderMessageBlock} />
  ))
  registerMessageBlockRenderer(MessageBlockType.IMAGE, (block) => (
    <ImageBlock block={block as Extract<MessageBlock, { type: MessageBlockType.IMAGE }>} />
  ))
  registerMessageBlockRenderer(MessageBlockType.FILE, (block) => (
    <FileBlock block={block as Extract<MessageBlock, { type: MessageBlockType.FILE }>} />
  ))
  registerMessageBlockRenderer(MessageBlockType.CITATION, (block) => (
    <CitationBlock block={block as Extract<MessageBlock, { type: MessageBlockType.CITATION }>} />
  ))
}

registerBuiltInRenderers()

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
  /** 工具审批回调 */
  onToolApprove?: (toolCallId: string) => void
  onToolReject?: (toolCallId: string) => void
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
  onToolApprove,
  onToolReject,
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
        const rendered = renderRegisteredMessageBlock(block, {
          role,
          onRetry,
          onToolApprove,
          onToolReject,
        })
        return rendered == null ? null : <Fragment key={block.id}>{rendered}</Fragment>
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
export { ToolApprovalBlock } from './ToolApprovalBlock'
export { TaskProgressBlock } from './TaskProgressBlock'
export { ErrorBlock } from './ErrorBlock'
export { PlaceholderBlock } from './PlaceholderBlock'
export { ImageBlock } from './ImageBlock'
export { FileBlock } from './FileBlock'
export { CitationBlock } from './CitationBlock'
export {
  getMessageBlockRenderer,
  registerMessageBlockRenderer,
  renderRegisteredMessageBlock,
} from './renderer-registry'

export default MessageBlockRenderer
