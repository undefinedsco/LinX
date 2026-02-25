/**
 * TaskProgressBlock - 多步骤任务进度条
 *
 * 显示任务的多步骤执行进度，对齐 CP0 TaskProgressBlock 契约。
 */

import { memo } from 'react'
import {
  CheckCircle,
  XCircle,
  Loader2,
  Circle,
  SkipForward,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  MessageBlockType,
  type MessageBlock,
  type TaskProgressStepStatus,
} from '@linx/models'

/** Extract TaskProgressMessageBlock from the MessageBlock union */
type TaskProgressMessageBlock = Extract<MessageBlock, { type: MessageBlockType.TASK_PROGRESS }>

interface TaskProgressBlockProps {
  block: TaskProgressMessageBlock
  className?: string
}

/** Step status → icon mapping */
function getStepIcon(status: TaskProgressStepStatus) {
  switch (status) {
    case 'done':
      return <CheckCircle className="w-4 h-4 text-green-500" />
    case 'error':
      return <XCircle className="w-4 h-4 text-destructive" />
    case 'running':
      return <Loader2 className="w-4 h-4 text-primary animate-spin" />
    case 'skipped':
      return <SkipForward className="w-4 h-4 text-muted-foreground/50" />
    case 'pending':
    default:
      return <Circle className="w-4 h-4 text-muted-foreground/40" />
  }
}

/** Format duration in ms to human-readable */
function formatDuration(ms?: number): string {
  if (!ms || !Number.isFinite(ms)) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * 任务进度条组件
 * - 显示任务标题和整体进度
 * - 逐步列出每个步骤的状态
 */
export const TaskProgressBlock = memo<TaskProgressBlockProps>(({
  block,
  className,
}) => {
  const { steps, currentStep, totalSteps, title } = block
  const doneCount = steps.filter(s => s.status === 'done').length
  const progressPct = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0

  return (
    <div className={cn(
      'rounded-lg border border-border/40 overflow-hidden mb-3',
      className,
    )}>
      {/* Header: title + progress fraction */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
        <span className="text-sm font-medium text-foreground/80 truncate">
          {title}
        </span>
        <span className="text-xs text-muted-foreground shrink-0 ml-2">
          {doneCount}/{totalSteps}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted/40">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Steps list */}
      <div className="px-3 py-2 space-y-1.5 bg-muted/10">
        {steps.map((step) => (
          <div key={step.id} className="flex items-start gap-2">
            <span className="shrink-0 mt-0.5">{getStepIcon(step.status)}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={cn(
                  'text-xs truncate',
                  step.status === 'done' && 'text-muted-foreground line-through',
                  step.status === 'running' && 'text-foreground font-medium',
                  step.status === 'error' && 'text-destructive',
                  step.status === 'skipped' && 'text-muted-foreground/50',
                  step.status === 'pending' && 'text-muted-foreground',
                )}>
                  {step.label}
                </span>
                {step.duration != null && (
                  <span className="text-[10px] text-muted-foreground/60 shrink-0">
                    {formatDuration(step.duration)}
                  </span>
                )}
              </div>
              {step.detail && (
                <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">
                  {step.detail}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})

TaskProgressBlock.displayName = 'TaskProgressBlock'

export default TaskProgressBlock
