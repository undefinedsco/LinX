import type { ApprovalInsert, ApprovalUpdate } from '../approval.schema'
import type { AuditInsert } from '../audit.schema'
import type { GrantInsert } from '../grant.schema'
import type { InboxNotificationInsert } from '../inbox-notification.schema'
import type { ToolCallEvent, InboxApprovalEvent, SessionStateEvent } from './sidecar-events'

// ============================================
// Runtime Event -> Pod Persistence Projection (CP0)
//
// This file is intentionally contract-only:
// - It defines what MUST be persisted (stable fields only).
// - It does NOT implement bridge/service business logic.
// - Runtime-only fields (timestamp/duration/result/error/etc.) MUST NOT become stable Pod fields.
//
// Writer-of-record note:
// - When integrating with xpod/chatkit (architecture choice B), the service-side adapter is responsible
//   for executing the action and persisting these projections to the Pod (Approval/Audit/Grant/InboxNotification).
// ============================================

export type ChatSessionProjection = {
  chatId: string
  sessionStatus: 'active' | 'paused' | 'completed' | 'error'
  policy?: string
  policyVersion?: string
}

export type ApprovalProjectionInsert = Pick<
  ApprovalInsert,
  'session' | 'toolCallId' | 'toolName' | 'target' | 'action' | 'risk' | 'status' | 'policyVersion'
>

export type ApprovalProjectionUpdate = Partial<
  Pick<
    ApprovalUpdate,
    'status' | 'assignedTo' | 'decisionBy' | 'decisionRole' | 'onBehalfOf' | 'reason' | 'policyVersion' | 'resolvedAt'
  >
>

export type AuditProjectionInsert = Pick<
  AuditInsert,
  'action' | 'actor' | 'actorRole' | 'onBehalfOf' | 'session' | 'toolCallId' | 'approval' | 'context' | 'policy' | 'policyVersion'
>

export type GrantProjectionInsert = Pick<
  GrantInsert,
  'target' | 'action' | 'effect' | 'riskCeiling' | 'decisionBy' | 'decisionRole' | 'onBehalfOf'
>

export type InboxNotificationProjectionInsert = Pick<
  InboxNotificationInsert,
  'actor' | 'object'
>

export const SidecarEventToPodMapping = {
  // tool.call
  tool_call_waiting_approval: {
    approval: 'insert' as const,
    inboxNotification: 'insert' as const,
    audit: null,
    grant: null,
  },
  tool_call_approved_or_rejected: {
    approval: 'update' as const,
    inboxNotification: 'insert' as const,
    audit: 'insert' as const,
    grant: null,
  },

  // inbox.approval
  inbox_approval_resolved: {
    approval: 'update' as const,
    inboxNotification: 'insert' as const,
    audit: null,
    grant: null,
  },

  // session.state
  session_state_terminal: {
    chat: 'update' as const,
  },
} as const

// Projection helpers (pure, no DB calls)
// NOTE: CP0 scope is Pod-only. Only project events that provide a concrete ODRL target/action.
export function hasPodScope(scope: { target?: string; action?: string }): scope is { target: string; action: string } {
  return typeof scope.target === 'string' && scope.target.length > 0 && typeof scope.action === 'string' && scope.action.length > 0
}

export type SidecarPersistenceRuleKey = keyof typeof SidecarEventToPodMapping

// Optional helpers for downstream implementers (pure, no DB calls)
export function isToolWaitingApproval(event: ToolCallEvent): boolean {
  return event.type === 'tool.call' && event.status === 'waiting_approval'
}

export function isToolDecisionEvent(event: ToolCallEvent): boolean {
  return event.type === 'tool.call' && (event.status === 'approved' || event.status === 'rejected')
}

export function isInboxResolved(event: InboxApprovalEvent): boolean {
  return event.type === 'inbox.approval' && event.status !== 'pending'
}

export function isSessionTerminal(event: SessionStateEvent): boolean {
  return event.type === 'session.state' && (event.status === 'completed' || event.status === 'error')
}
