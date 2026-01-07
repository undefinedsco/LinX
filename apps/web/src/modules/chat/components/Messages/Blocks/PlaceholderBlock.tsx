/**
 * PlaceholderBlock - 占位块渲染器
 * 
 * 参考 Cherry Studio: src/renderer/src/pages/home/Messages/Blocks/PlaceholderBlock.tsx
 * 在消息流式加载时显示加载动画
 */

import { memo } from 'react'
import { cn } from '@/lib/utils'
import type { PlaceholderMessageBlock } from '@linx/models'

interface PlaceholderBlockProps {
  block: PlaceholderMessageBlock
  className?: string
}

/**
 * 打字机光标动画组件
 */
const TypingCursor = () => (
  <span className="inline-flex items-center">
    <span className="w-0.5 h-4 bg-primary animate-pulse" />
  </span>
)

/**
 * 三点加载动画
 */
const LoadingDots = () => (
  <span className="inline-flex gap-1 items-center">
    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
  </span>
)

/**
 * 占位块组件
 * - 流式响应开始前显示
 * - 提供视觉反馈表示正在等待响应
 */
export const PlaceholderBlock = memo<PlaceholderBlockProps>(({
  className,
}) => {
  return (
    <div className={cn('flex items-center gap-2 py-1', className)}>
      <LoadingDots />
      <span className="text-sm text-muted-foreground">正在思考</span>
      <TypingCursor />
    </div>
  )
})

PlaceholderBlock.displayName = 'PlaceholderBlock'

export default PlaceholderBlock
