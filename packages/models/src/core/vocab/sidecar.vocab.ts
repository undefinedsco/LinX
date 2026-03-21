import { AS, DCTerms, ODRL, UDFS } from '../namespaces.js'

export const ApprovalVocab = {
  session: UDFS.session,
  toolCallId: UDFS.toolCallId,
  toolName: UDFS.toolName,
  target: ODRL.target,
  action: ODRL.action,
  risk: UDFS.risk,
  status: UDFS.status,
  assignedTo: UDFS.assignedTo,
  decisionBy: UDFS.decisionBy,
  decisionRole: UDFS.decisionRole,
  onBehalfOf: UDFS.onBehalfOf,
  reason: UDFS.reason,
  policyVersion: UDFS.policyVersion,
  createdAt: DCTerms.created,
  resolvedAt: UDFS.resolvedAt,
} as const

export const AuditVocab = {
  action: UDFS.action,
  actor: UDFS.actor,
  actorRole: UDFS.actorRole,
  onBehalfOf: UDFS.onBehalfOf,
  session: UDFS.session,
  toolCallId: UDFS.toolCallId,
  approval: UDFS.approval,
  context: UDFS.context,
  policy: UDFS.policy,
  policyVersion: UDFS.policyVersion,
  createdAt: DCTerms.created,
} as const

export const GrantVocab = {
  target: ODRL.target,
  action: ODRL.action,
  effect: UDFS.effect,
  riskCeiling: UDFS.riskCeiling,
  decisionBy: UDFS.decisionBy,
  decisionRole: UDFS.decisionRole,
  onBehalfOf: UDFS.onBehalfOf,
  createdAt: DCTerms.created,
  revokedAt: UDFS.revokedAt,
} as const

export const InboxNotificationVocab = {
  actor: AS.actor,
  object: AS.object,
  createdAt: DCTerms.created,
} as const
