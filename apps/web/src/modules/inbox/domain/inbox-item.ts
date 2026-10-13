import type {
  ApprovalRow,
  AuditRow,
  InboxNotificationRow,
  InputRequestRow,
} from '@undefineds.co/models'
import type { AutoJudgePhase } from './auto-judge-view'

export type InboxItemKind = 'approval' | 'input_request' | 'audit'
export type InboxItemCategory = 'approval' | 'input_request' | 'auth_required' | 'audit'

export interface InboxItem {
  id: string
  kind: InboxItemKind
  category: InboxItemCategory
  title: string
  description: string
  timestamp: string
  status?: string
  /** Auto-judge phase of an approval; null/undefined when LinX never judged it. */
  autoPhase?: AutoJudgePhase | null
  approval?: ApprovalRow
  inputRequest?: InputRequestRow
  audit?: AuditRow
  notification?: InboxNotificationRow
  chatId?: string | null
  threadId?: string | null
  thread?: string | null
  about?: string | null
  approvalId?: string | null
  authUrl?: string | null
  authMethod?: string | null
  authMessage?: string | null
}

export interface InboxListItemView {
  id: string
  title: string
  description: string
  formattedTime: string
  kind: InboxItemKind
  category: InboxItemCategory
  status?: string
  approvalTarget?: string | null
  /** "LinX 替你批准" for requests LinX approved after the wait. */
  autoApproved?: boolean
}

/** A request LinX is waiting to approve ("LinX 会自动通过"). */
export interface InboxAutoWaitingView {
  id: string
  title: string
  detail: string
  /** "9 分钟后" */
  remainingLabel: string
  /** "把握高" */
  confidenceLabel: string
}
