/**
 * ToolBlock - 工具调用块渲染器
 * 
 * 参考 Cherry Studio: src/renderer/src/pages/home/Messages/Blocks/ToolBlock.tsx
 * 显示 AI 的工具/函数调用及其结果
 */

import { memo, useState } from 'react'
import { ChevronDown, Wrench, CheckCircle, XCircle, Loader2, ShieldCheck, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { MessageBlockStatus, type ToolMessageBlock, type ToolCallStatus } from '@linx/models'

interface ToolBlockProps {
  block: ToolMessageBlock
  /** 是否默认展开 */
  defaultExpanded?: boolean
  className?: string
}

/**
 * 获取工具状态图标 - 支持 MessageBlockStatus 和 ToolCallStatus
 */
function getStatusIcon(status: MessageBlockStatus, toolStatus?: ToolCallStatus) {
  if (toolStatus) {
    switch (toolStatus) {
      case 'done': return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'error': return <XCircle className="w-4 h-4 text-destructive" />
      case 'calling': return <Loader2 className="w-4 h-4 text-primary animate-spin" />
      case 'waiting_approval': return <ShieldCheck className="w-4 h-4 text-amber-500" />
      case 'running': return <Play className="w-4 h-4 text-blue-500" />
    }
  }
  switch (status) {
    case MessageBlockStatus.SUCCESS: return <CheckCircle className="w-4 h-4 text-green-500" />
    case MessageBlockStatus.ERROR: return <XCircle className="w-4 h-4 text-destructive" />
    case MessageBlockStatus.PROCESSING:
    case MessageBlockStatus.STREAMING: return <Loader2 className="w-4 h-4 text-primary animate-spin" />
    default: return <Wrench className="w-4 h-4 text-muted-foreground" />
  }
}

/** Map toolStatus to display text */
function getToolStatusText(status: MessageBlockStatus, toolStatus?: ToolCallStatus): string {
  if (toolStatus) {
    const map: Record<ToolCallStatus, string> = {
      calling: '调用中...', waiting_approval: '等待审批', running: '运行中...', done: '完成', error: '失败',
    }
    return map[toolStatus]
  }
  const isProcessing = status === MessageBlockStatus.PROCESSING || status === MessageBlockStatus.STREAMING
  return isProcessing ? '执行中...' : status === MessageBlockStatus.ERROR ? '失败' : '完成'
}

/** Format duration in ms to compact display (spec §7.1: right-aligned, text-xs) */
function formatDuration(ms?: number): string {
  if (!ms || !Number.isFinite(ms)) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/** Build a single-line args summary for the collapsed header (spec §7.1) */
function summarizeArgs(args?: Record<string, unknown>): string {
  if (!args) return ''
  const entries = Object.entries(args)
  if (entries.length === 0) return ''
  // Show first key-value pair, truncated
  const [key, val] = entries[0]
  const valStr = typeof val === 'string' ? val : JSON.stringify(val)
  const summary = `${key}: ${valStr}`
  return summary.length > 60 ? `${summary.slice(0, 57)}...` : summary
}

/**
 * 格式化 JSON 显示
 */
function formatJSON(data: unknown): string {
  try {
    if (typeof data === 'string') {
      // 尝试解析 JSON 字符串
      const parsed = JSON.parse(data)
      return JSON.stringify(parsed, null, 2)
    }
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data ?? '')
  }
}

/**
 * 工具调用块组件
 * - 显示工具名称和状态
 * - 可折叠显示输入参数和输出结果
 * - 支持 MCP 工具标识
 */
export const ToolBlock = memo<ToolBlockProps>(({
  block,
  defaultExpanded = false,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(defaultExpanded)

  const hasError = block.status === MessageBlockStatus.ERROR || block.toolStatus === 'error'

  // CP0: inline args summary + duration (spec §7.1)
  const argsSummary = summarizeArgs(block.arguments)
  const durationStr = formatDuration(block.duration)

  // 格式化参数和结果
  const formattedArgs = block.arguments ? formatJSON(block.arguments) : null
  const formattedResult = block.content ? formatJSON(block.content) : null

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn('mb-3', className)}
    >
      <CollapsibleTrigger asChild>
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-sm cursor-pointer select-none',
            'bg-muted/50 hover:bg-muted/60 transition-colors',
            'border border-border/30',
            isOpen && 'rounded-b-none border-b-0'
          )}
        >
          {/* Status Icon (spec §7.1: spinner/check/cross) */}
          {getStatusIcon(block.status, block.toolStatus)}

          {/* Tool Name + inline args summary (spec §7.1) */}
          <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
            <span className="text-sm font-medium text-foreground/80 shrink-0">
              {block.toolName}
            </span>
            {/* Args summary: single-line truncated, only when collapsed */}
            {!isOpen && argsSummary && (
              <span className="text-xs text-muted-foreground/60 truncate" title={argsSummary}>
                {argsSummary}
              </span>
            )}
          </div>

          {/* MCP Badge */}
          {block.metadata?.isMcp && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium shrink-0">
              MCP
            </span>
          )}

          {/* Duration (spec §7.1: right-aligned, text-xs text-muted-foreground) */}
          {durationStr && (
            <span className="text-xs text-muted-foreground shrink-0">
              {durationStr}
            </span>
          )}

          {/* Status Text */}
          <span className="text-xs text-muted-foreground shrink-0">
            {getToolStatusText(block.status, block.toolStatus)}
          </span>

          {/* Expand indicator */}
          <ChevronDown
            className={cn(
              'w-4 h-4 text-muted-foreground transition-transform shrink-0',
              isOpen && 'rotate-180'
            )}
          />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div
          className={cn(
            'px-3 py-2 rounded-b-lg text-xs font-mono',
            'bg-muted/20 border border-t-0 border-border/40',
            'space-y-2 overflow-hidden'
          )}
        >
          {/* Arguments */}
          {formattedArgs && (
            <div>
              <div className="text-muted-foreground mb-1">输入参数:</div>
              <pre className="p-2 rounded bg-background/50 overflow-x-auto max-h-40 text-[11px]">
                {formattedArgs}
              </pre>
            </div>
          )}

          {/* Result */}
          {formattedResult && (
            <div>
              <div className={cn(
                'mb-1',
                hasError ? 'text-destructive' : 'text-muted-foreground'
              )}>
                {hasError ? '错误信息:' : '返回结果:'}
              </div>
              <pre className={cn(
                'p-2 rounded overflow-x-auto max-h-60 text-[11px]',
                hasError ? 'bg-destructive/10 text-destructive' : 'bg-background/50'
              )}>
                {formattedResult}
              </pre>
            </div>
          )}

          {/* Error from block.error */}
          {block.error && (
            <div>
              <div className="text-destructive mb-1">错误:</div>
              <pre className="p-2 rounded bg-destructive/10 text-destructive overflow-x-auto text-[11px]">
                {block.error.message}
              </pre>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
})

ToolBlock.displayName = 'ToolBlock'

export default ToolBlock
