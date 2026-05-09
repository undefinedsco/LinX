import { AS, DCTerms, ODRL, UDFS } from '../namespaces'

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
  context: UDFS.context,
  approvalOptions: UDFS.approvalOptions,
  policyVersion: UDFS.policyVersion,
  createdAt: DCTerms.created,
  expiresAt: UDFS.expiresAt,
  resolvedAt: UDFS.resolvedAt,
} as const

export const AuditVocab = {
  action: UDFS.action,
  actor: UDFS.actor,
  actorRole: UDFS.actorRole,
  onBehalfOf: UDFS.onBehalfOf,
  session: UDFS.session,
  entry: UDFS.entry,
  toolCallId: UDFS.toolCallId,
  toolName: UDFS.toolName,
  approval: UDFS.approval,
  policy: UDFS.policy,
  policyVersion: UDFS.policyVersion,
  createdAt: DCTerms.created,
} as const

export const GrantVocab = {
  target: ODRL.target,
  action: ODRL.action,
  title: DCTerms.title,
  summary: UDFS.summary,
  body: UDFS.body,
  schema: DCTerms.conformsTo,
  pageKind: UDFS.pageKind,
  wikiStatus: UDFS.status,
  tags: UDFS.tags,
  source: UDFS.source,
  sourceHash: UDFS.sourceHash,
  compiledAt: UDFS.compiledAt,
  compiledFrom: UDFS.compiledFrom,
  related: UDFS.related,
  effect: UDFS.effect,
  riskCeiling: UDFS.riskCeiling,
  policy: UDFS.policy,
  context: UDFS.context,
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
