/**
 * ToolApprovalBlock - 工具审批卡片
 *
 * 显示工具调用的审批请求，包含风险等级、审批状态和操作按钮。
 * 对齐 CP0 collaboration-blocks 契约中的 ToolApprovalBlock 类型。
 *
 * CP0 增强:
 * - 高风险: 30s 倒计时自动拒绝 (spec §7.1)
 * - 中风险: 60s 倒计时自动批准 (spec §7.1)
 * - 参数详情展示
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  CheckCircle,
  XCircle,
  Clock,
  Timer,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  MessageBlockType,
  type MessageBlock,
  type ToolApprovalStatus,
  type ToolRisk,
} from '@linx/models'

/** Extract ToolApprovalMessageBlock from the MessageBlock union */
type ToolApprovalMessageBlock = Extract<MessageBlock, { type: MessageBlockType.TOOL_APPROVAL }>

interface ToolApprovalBlockProps {
  block: ToolApprovalMessageBlock
  onApprove?: (toolCallId: string) => void
  onReject?: (toolCallId: string) => void
  className?: string
}

/** Risk level → icon + color mapping */
function getRiskIndicator(risk: ToolRisk) {
  switch (risk) {
    case 'high':
      return { icon: <ShieldX className="w-5 h-5" />, color: 'text-destructive', bg: 'bg-destructive/10', label: '高风险' }
    case 'medium':
      return { icon: <ShieldAlert className="w-5 h-5" />, color: 'text-amber-500', bg: 'bg-amber-500/10', label: '中风险' }
    case 'low':
    default:
      return { icon: <ShieldCheck className="w-5 h-5" />, color: 'text-green-500', bg: 'bg-green-500/10', label: '低风险' }
  }
}

/** Approval status → display mapping */
function getStatusDisplay(status: ToolApprovalStatus) {
  switch (status) {
    case 'approved':
      return { icon: <CheckCircle className="w-4 h-4 text-green-500" />, text: '已批准' }
    case 'rejected':
      return { icon: <XCircle className="w-4 h-4 text-destructive" />, text: '已拒绝' }
    case 'auto_approved':
      return { icon: <CheckCircle className="w-4 h-4 text-blue-500" />, text: '自动批准' }
    case 'pending':
    default:
      return { icon: <Clock className="w-4 h-4 text-amber-500" />, text: '等待审批' }
  }
}

/** Risk → timeout seconds (spec §7.1: high=30s auto-reject, medium=60s auto-approve) */
function getTimeoutForRisk(risk: ToolRisk): number | null {
  switch (risk) {
    case 'high': return 30
    case 'medium': return 60
    default: return null
  }
}

/** Format args as compact key-value lines */
function formatArgsSummary(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n')
}

/**
 * 工具审批卡片组件
 * - 显示工具名称、描述、风险等级
 * - pending 状态显示审批/拒绝按钮
 * - 高/中风险显示倒计时
 * - 已决策状态显示结果
 */
export const ToolApprovalBlock = memo<ToolApprovalBlockProps>(({
  block,
  onApprove,
  onReject,
  className,
}) => {
  const risk = getRiskIndicator(block.risk)
  const statusDisplay = getStatusDisplay(block.approvalStatus)
  const isPending = block.approvalStatus === 'pending'

  // CP0: countdown timer (spec §7.1)
  const timeoutSec = getTimeoutForRisk(block.risk)
  const [remaining, setRemaining] = useState<number | null>(timeoutSec)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isPending || timeoutSec == null) {
      setRemaining(null)
      return
    }
    setRemaining(timeoutSec)
    timerRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev == null || prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          // Auto-action on timeout: high → reject, medium → approve
          if (block.risk === 'high') {
            onReject?.(block.toolCallId)
          } else if (block.risk === 'medium') {
            onApprove?.(block.toolCallId)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isPending, timeoutSec, block.risk, block.toolCallId, onApprove, onReject])

  const handleApprove = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    onApprove?.(block.toolCallId)
  }, [onApprove, block.toolCallId])

  const handleReject = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    onReject?.(block.toolCallId)
  }, [onReject, block.toolCallId])

  return (
    <div className={cn(
      'rounded-lg border border-border/40 overflow-hidden mb-3',
      className,
    )}>
      {/* Header: risk icon + tool name + status badge */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-2',
        risk.bg,
      )}>
        <span className={risk.color}>{risk.icon}</span>
        <span className="text-sm font-medium text-foreground/80 truncate flex-1">
          {block.toolName}
        </span>
        <Badge variant="outline" className="text-[10px] gap-1 shrink-0">
          {statusDisplay.icon}
          {statusDisplay.text}
        </Badge>
      </div>

      {/* Body */}
      <div className="px-3 py-2 space-y-2 bg-muted/20">
        {/* Description */}
        {block.toolDescription && (
          <p className="text-xs text-muted-foreground">{block.toolDescription}</p>
        )}

        {/* Arguments detail (spec §7.1: show args in approval card) */}
        {block.arguments && Object.keys(block.arguments).length > 0 && (
          <pre className="text-[11px] text-muted-foreground/80 font-mono p-2 rounded bg-background/50 overflow-x-auto max-h-24">
            {formatArgsSummary(block.arguments)}
          </pre>
        )}

        {/* Risk label */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">风险等级:</span>
          <span className={cn('text-xs font-medium', risk.color)}>{risk.label}</span>
        </div>

        {/* Reason (if decided) */}
        {block.reason && (
          <p className="text-xs text-muted-foreground/80 italic">
            {block.reason}
          </p>
        )}

        {/* Action buttons + countdown (only when pending) */}
        {isPending && (onApprove || onReject) && (
          <div className="flex items-center gap-2 pt-1">
            {onReject && (
              <Button size="sm" variant="outline" className="h-7 text-xs border-destructive/50 text-destructive hover:bg-destructive/10" onClick={handleReject}>
                <XCircle className="w-3.5 h-3.5 mr-1" />
                拒绝
              </Button>
            )}
            {onApprove && (
              <Button size="sm" variant="default" className="h-7 text-xs" onClick={handleApprove}>
                <CheckCircle className="w-3.5 h-3.5 mr-1" />
                批准
              </Button>
            )}
            {/* Countdown timer (spec §7.1) */}
            {remaining != null && remaining > 0 && (
              <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                <Timer className="w-3 h-3" />
                {block.risk === 'high' ? '自动拒绝' : '自动批准'}: {remaining}s
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

ToolApprovalBlock.displayName = 'ToolApprovalBlock'

export default ToolApprovalBlock
