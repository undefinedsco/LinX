/**
 * ToolApprovalBlock - 工具审批卡片
 *
 * 显示工具调用的审批请求，包含风险等级、审批状态和操作按钮。
 * 对齐 CP0 collaboration-blocks 契约中的 ToolApprovalBlock 类型。
 */

import { memo, useCallback } from 'react'
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  CheckCircle,
  XCircle,
  Clock,
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

/**
 * 工具审批卡片组件
 * - 显示工具名称、描述、风险等级
 * - pending 状态显示审批/拒绝按钮
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

  const handleApprove = useCallback(() => {
    onApprove?.(block.toolCallId)
  }, [onApprove, block.toolCallId])

  const handleReject = useCallback(() => {
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

        {/* Action buttons (only when pending) */}
        {isPending && (onApprove || onReject) && (
          <div className="flex items-center gap-2 pt-1">
            {onApprove && (
              <Button size="sm" variant="default" className="h-7 text-xs" onClick={handleApprove}>
                <CheckCircle className="w-3.5 h-3.5 mr-1" />
                批准
              </Button>
            )}
            {onReject && (
              <Button size="sm" variant="outline" className="h-7 text-xs border-destructive/50 text-destructive hover:bg-destructive/10" onClick={handleReject}>
                <XCircle className="w-3.5 h-3.5 mr-1" />
                拒绝
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

ToolApprovalBlock.displayName = 'ToolApprovalBlock'

export default ToolApprovalBlock
