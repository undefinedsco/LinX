/**
 * MainTextBlock - 主文本块渲染器
 * 
 * 参考 Cherry Studio: src/renderer/src/pages/home/Messages/Blocks/MainTextBlock.tsx
 * 渲染 Markdown 格式的主要文本内容
 */

import { memo } from 'react'
import { cn } from '@/lib/utils'
import type { MainTextMessageBlock } from '@linx/models'
import { MarkdownRenderer } from '../../Markdown/MarkdownRenderer'

interface MainTextBlockProps {
  block: MainTextMessageBlock
  /** user | assistant */
  role: 'user' | 'assistant'
  /** 是否将用户输入渲染为 Markdown（默认 false，直接显示纯文本） */
  renderUserAsMarkdown?: boolean
  /** 引用块 ID（用于显示引用来源） */
  citationBlockId?: string
  className?: string
}

/**
 * 主文本块组件
 * - 支持 Markdown 渲染
 * - 用户消息默认为纯文本，可配置为 Markdown
 * - 支持引用处理（TODO: 后续迁移 Citation 功能）
 */
export const MainTextBlock = memo<MainTextBlockProps>(({
  block,
  role,
  renderUserAsMarkdown = false,
  className,
}) => {
  // 用户消息默认显示纯文本
  if (role === 'user' && !renderUserAsMarkdown) {
    return (
      <p className={cn('whitespace-pre-wrap', className)}>
        {block.content}
      </p>
    )
  }

  // Assistant 消息或配置了 Markdown 渲染的用户消息
  return (
    <div className={cn('main-text-block', className)}>
      <MarkdownRenderer content={block.content} />
    </div>
  )
})

MainTextBlock.displayName = 'MainTextBlock'

export default MainTextBlock
