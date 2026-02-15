/**
 * Wave A CP0: collaboration-related richContent block contracts.
 *
 * These are minimal JSON shapes stored in MessageRow.richContent and consumed by downstream UIs.
 * They intentionally do NOT include UI block runtime fields (id/createdAt/status, etc.).
 */

export type ToolRisk = 'low' | 'medium' | 'high'
export type ToolApprovalStatus = 'pending' | 'approved' | 'rejected' | 'auto_approved'

export interface ToolApprovalBlock {
  type: 'tool_approval'

  toolCallId: string
  toolName: string
  toolDescription: string
  arguments: Record<string, unknown>

  risk: ToolRisk
  status: ToolApprovalStatus

  approvedBy?: string
  approvedAt?: string

  // Audit fields
  decisionBy?: string
  decisionRole?: 'human' | 'secretary' | 'system'
  onBehalfOf?: string
  reason?: string
  policyVersion?: string
  inboxItemId?: string
}

export type TaskProgressStepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped'

export interface TaskProgressBlock {
  type: 'task_progress'

  taskId: string
  title: string
  steps: Array<{
    id: string
    label: string
    status: TaskProgressStepStatus
    detail?: string
    duration?: number
  }>

  currentStep: number
  totalSteps: number
}

export type ToolCallStatus = 'calling' | 'waiting_approval' | 'running' | 'done' | 'error'

export interface ToolCallBlock {
  // Maps to MessageBlockType.TOOL in message-block.ts runtime model.
  type: 'tool'

  toolCallId: string
  toolName: string
  arguments: Record<string, unknown>

  status: ToolCallStatus
  result?: unknown
  error?: string
  duration?: number
}

export type CollaborationRichBlock = ToolApprovalBlock | TaskProgressBlock | ToolCallBlock
