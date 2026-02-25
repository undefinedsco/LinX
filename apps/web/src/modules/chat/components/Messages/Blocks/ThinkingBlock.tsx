/**
 * ThinkingBlock - 思考块渲染器
 * 
 * 对齐 Cherry Studio: src/renderer/src/pages/home/Messages/Blocks/ThinkingBlock.tsx
 * 显示 AI 模型的推理/思考过程（CoT, o1, DeepSeek R1 等）
 * 
 * 样式规格：
 * - 容器: borderRadius 10px, border 0.5px solid var(--color-border)
 * - 折叠时 borderRadius: 10px 10px 0 0
 * - 图标容器: width 50px
 * - 标题: font-size 14px, font-weight 500
 * - margin-bottom: 15px
 */

import { memo, useState, useMemo, useCallback } from 'react'
import { Check, Copy, ChevronRight, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { MessageBlockStatus, type ThinkingMessageBlock } from '@linx/models'
import { MarkdownRenderer } from '../../Markdown/MarkdownRenderer'

interface ThinkingBlockProps {
  block: ThinkingMessageBlock
  /** 是否默认折叠 */
  defaultCollapsed?: boolean
  className?: string
}

/**
 * 格式化思考时间
 */
function formatThinkingTime(milliseconds?: number, isThinking?: boolean): string {
  if (!milliseconds || !Number.isFinite(milliseconds)) {
    return isThinking ? '思考中 0.1s' : '深度思考 0.1s'
  }
  const seconds = Math.max(0.1, milliseconds / 1000)
  const timeStr = `${seconds.toFixed(1)}s`
  return isThinking ? `思考中 ${timeStr}` : `深度思考 ${timeStr}`
}

/**
 * 思考块组件 - 对齐 Cherry Studio 样式
 */
export const ThinkingBlock = memo<ThinkingBlockProps>(({
  block,
  defaultCollapsed = true,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(!defaultCollapsed)
  const [copied, setCopied] = useState(false)

  const isThinking = block.status === MessageBlockStatus.STREAMING

  const thinkingTimeText = useMemo(() => {
    return formatThinkingTime(block.thinkingDuration, isThinking)
  }, [block.thinkingDuration, isThinking])

  const handleCopy = useCallback(async () => {
    if (!block.content) return
    try {
      await navigator.clipboard.writeText(block.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [block.content])

  if (!block.content) {
    return null
  }

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn('message-thought-container mb-[15px]', className)}
    >
      <CollapsibleTrigger asChild>
        <div
          className={cn(
            'w-full overflow-hidden relative flex items-center',
            'border-[0.5px] border-border',
            'transition-all duration-150',
            'cursor-pointer select-none',
            'h-[38px]',
            isOpen ? 'rounded-t-lg rounded-b-none' : 'rounded-lg'
          )}
        >
          {/* Icon Container - 50px */}
          <div className={cn(
            'w-[50px] h-full flex-shrink-0',
            'flex items-center justify-center',
            'pl-[5px]',
            isThinking && 'animate-pulse'
          )}>
            <Lightbulb 
              className={cn(
                'text-primary transition-all duration-150',
                isThinking ? 'w-5 h-5' : 'w-5 h-5'
              )}
            />
          </div>

          {/* Text Container */}
          <div className="flex-1 h-full py-[5px] overflow-hidden relative">
            {/* Title - 14px, font-weight 500 */}
            <div className={cn(
              'absolute inset-x-0 top-0',
              'text-[14px] leading-[14px] font-medium',
              'py-[10px]',
              'z-10',
              !isThinking && 'pt-[12px]'
            )}>
              {thinkingTimeText}
            </div>
          </div>

          {/* Arrow Container - 40px */}
          <div className={cn(
            'w-[40px] h-full flex-shrink-0',
            'flex items-center justify-center',
            'text-muted-foreground/60',
            'transition-transform duration-150',
            isOpen && 'rotate-90'
          )}>
            <ChevronRight className="w-5 h-5" strokeWidth={1} />
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div
          className={cn(
            'relative px-4 py-4',
            'rounded-b-lg',
            'border-[0.5px] border-t-0 border-border'
          )}
        >
          {/* Copy button */}
          {!isThinking && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'absolute -right-3 -top-3',
                'h-7 w-7',
                'bg-transparent border-none',
                'text-muted-foreground/60 hover:text-foreground',
                'opacity-60 hover:opacity-100',
                'transition-all duration-300',
                'p-1'
              )}
              onClick={(e) => {
                e.stopPropagation()
                handleCopy()
              }}
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </Button>
          )}

          {/* Content */}
          <div className="text-foreground/80">
            <MarkdownRenderer content={block.content} />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
})

ThinkingBlock.displayName = 'ThinkingBlock'

export default ThinkingBlock
