import type {
  ApprovalRow,
  AuditRow,
  InboxNotificationRow,
  InputRequestRow,
} from '@undefineds.co/models'

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
}
