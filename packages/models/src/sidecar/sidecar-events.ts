import { z } from 'zod'

// ============================================
// Sidecar Runtime Event Contracts (CP0)
//
// Notes:
// - Runtime wire contracts only; events are NOT persisted as-is.
// - Pod projections live in approval/audit/grant/inboxNotification tables.
// - CP0 freezes v1 as strict. If fields change later, introduce v2.
// ============================================

export type SidecarEventType = 'tool.call' | 'session.state' | 'tool.control' | 'inbox.approval'
export type SidecarEventVersion = 1

export const RiskLevelSchema = z.enum(['low', 'medium', 'high'])
export type RiskLevel = z.infer<typeof RiskLevelSchema>

export const DecisionRoleSchema = z.enum(['human', 'secretary', 'system'])
export type DecisionRole = z.infer<typeof DecisionRoleSchema>

export const ToolCallStatusSchema = z.enum([
  'calling',
  'waiting_approval',
  'approved',
  'rejected',
  'running',
  'done',
  'error',
])
export type ToolCallStatus = z.infer<typeof ToolCallStatusSchema>

const IsoDatetimeSchema = z.string().datetime()

// --------------------------------------------
// tool.call
// --------------------------------------------

export const ToolCallEventV1Schema = z
  .object({
    type: z.literal('tool.call'),
    version: z.literal(1).optional(),

    sessionId: z.string(),
    toolCallId: z.string(),
    toolName: z.string(),
    risk: RiskLevelSchema.optional(),
    status: ToolCallStatusSchema,

    // CP0 Pod-only scope projection
    target: z.string().optional(),
    action: z.string().optional(),

    arguments: z.record(z.unknown()).optional(),
    result: z.unknown().optional(),
    error: z.string().optional(),
    duration: z.number().int().nonnegative().optional(),

    inboxItemId: z.string().optional(),
    decisionBy: z.string().optional(), // WebID
    decisionRole: DecisionRoleSchema.optional(),
    onBehalfOf: z.string().optional(), // WebID
    policyVersion: z.string().optional(),

    timestamp: IsoDatetimeSchema,
  })
  .strict()

export const ToolCallEventSchema = ToolCallEventV1Schema
export type ToolCallEvent = z.infer<typeof ToolCallEventSchema>

// --------------------------------------------
// session.state
// --------------------------------------------

export const SessionToolSchema = z.enum(['claude-code', 'cursor', 'windsurf'])
export type SessionTool = z.infer<typeof SessionToolSchema>

export const SessionStatusSchema = z.enum(['active', 'paused', 'completed', 'error'])
export type SessionStatus = z.infer<typeof SessionStatusSchema>

export const SessionStateEventV1Schema = z
  .object({
    type: z.literal('session.state'),
    version: z.literal(1).optional(),

    sessionId: z.string(),
    chatId: z.string(),
    policy: z.string().optional(),
    policyVersion: z.string().optional(),
    status: SessionStatusSchema,
    previousStatus: z.string(),
    tool: SessionToolSchema,
    tokenUsage: z.number().int().nonnegative(),
    timestamp: IsoDatetimeSchema,
  })
  .strict()

export const SessionStateEventSchema = SessionStateEventV1Schema
export type SessionStateEvent = z.infer<typeof SessionStateEventSchema>

// --------------------------------------------
// tool.control
// --------------------------------------------

export const ToolControlCommandNameSchema = z.enum([
  'approve',
  'reject',
  'pause',
  'resume',
  'stop',
  'inject_message',
  'approve_pattern',
])
export type ToolControlCommandName = z.infer<typeof ToolControlCommandNameSchema>

export const ToolControlCommandV1Schema = z
  .object({
    commandId: z.string().optional(),
    type: z.literal('tool.control'),
    version: z.literal(1).optional(),

    command: ToolControlCommandNameSchema,
    sessionId: z.string(),

    toolCallId: z.string().optional(),
    message: z.string().optional(),
    pattern: z.string().optional(),
    inboxItemId: z.string().optional(),

    actor: z
      .object({
        actorWebId: z.string(),
        actorRole: DecisionRoleSchema,
        onBehalfOf: z.string().optional(),
      })
      .optional(),

    policyVersion: z.string().optional(),
    timestamp: IsoDatetimeSchema,
  })
  .strict()

export const ToolControlCommandSchema = ToolControlCommandV1Schema
export type ToolControlCommand = z.infer<typeof ToolControlCommandSchema>

// --------------------------------------------
// inbox.approval
// --------------------------------------------

export const InboxApprovalStatusSchema = z.enum(['pending', 'approved', 'rejected', 'expired'])
export type InboxApprovalStatus = z.infer<typeof InboxApprovalStatusSchema>

export const InboxApprovalEventV1Schema = z
  .object({
    type: z.literal('inbox.approval'),
    version: z.literal(1).optional(),

    inboxItemId: z.string(),
    sessionId: z.string(),
    toolCallId: z.string(),

    // Optional Pod scope projection
    target: z.string().optional(),
    action: z.string().optional(),

    policy: z.string().optional(),
    policyVersion: z.string().optional(),

    risk: RiskLevelSchema,
    status: InboxApprovalStatusSchema,
    assignedTo: z.string().optional(),

    createdAt: IsoDatetimeSchema,
    resolvedAt: IsoDatetimeSchema.optional(),
  })
  .strict()

export const InboxApprovalEventSchema = InboxApprovalEventV1Schema
export type InboxApprovalEvent = z.infer<typeof InboxApprovalEventSchema>

// --------------------------------------------
// SidecarEvent
// --------------------------------------------

export const SidecarEventSchema = z.union([
  ToolCallEventSchema,
  SessionStateEventSchema,
  ToolControlCommandSchema,
  InboxApprovalEventSchema,
])

export type SidecarEvent = z.infer<typeof SidecarEventSchema>

export function getSidecarEventVersion(_event: SidecarEvent): SidecarEventVersion {
  return 1
}
