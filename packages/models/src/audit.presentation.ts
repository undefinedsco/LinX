import type { ApprovalRow } from './approval.schema'
import type { AuditRow } from './audit.schema'
import { extractChatThreadRef } from './chat.utils'

export interface AuditPresentation {
  title: string
  description: string
  category: 'auth_required' | 'audit'
  status?: string
  chatId: string | null
  threadId: string | null
  thread: string | null
  about: string | null
  authUrl: string | null
  authMethod: string | null
  authMessage: string | null
  actorRoleLabel: string
}

type RelatedApproval = Pick<ApprovalRow, 'target' | 'toolName' | 'risk' | 'reason' | 'status' | 'context'> | null | undefined

function formatTimestamp(value: unknown): number {
  if (!value) return 0
  const time = new Date(String(value)).getTime()
  return Number.isFinite(time) ? time : 0
}

function getAuditAuthKey(audit: AuditRow): string | null {
  if (audit.action !== 'runtime.auth_required' && audit.action !== 'runtime.auth_resolved') return null
  const method = audit.toolName || null
  const entry = audit.entry || null
  if (!method && !entry) return null
  return `${audit.session ?? ''}:${method ?? ''}:${entry ?? ''}`
}

function buildRuntimeSessionDescription(audit: AuditRow, fallback: string): string {
  const tool = audit.toolName ? `工具 ${audit.toolName}` : null
  return tool ?? fallback
}

function buildApprovalDecisionDescription(
  audit: AuditRow,
  relatedApproval: RelatedApproval,
  decision: 'approved' | 'rejected',
): string {
  const toolName = audit.toolName || relatedApproval?.toolName || null
  const risk = relatedApproval?.risk ? `${relatedApproval.risk} 风险` : null
  const reason = relatedApproval?.reason?.trim() || null
  const lead = decision === 'approved' ? '收件箱已批准工具执行。' : '收件箱已拒绝工具执行。'
  const parts = [toolName, risk, reason].filter(Boolean)
  return parts.length > 0 ? `${lead} ${parts.join(' · ')}` : lead
}

export function buildAuditDetailRecord(
  audit: AuditRow,
  relatedApproval?: RelatedApproval,
): Record<string, unknown> {
  return {
    action: audit.action,
    actor: audit.actor,
    actorRole: audit.actorRole,
    onBehalfOf: audit.onBehalfOf || undefined,
    session: audit.session || undefined,
    entry: audit.entry || undefined,
    toolCallId: audit.toolCallId || undefined,
    toolName: audit.toolName || undefined,
    approval: audit.approval || undefined,
    policy: audit.policy || undefined,
    policyVersion: audit.policyVersion || undefined,
    createdAt: audit.createdAt,
    relatedApproval: relatedApproval
      ? {
          target: relatedApproval.target,
          toolName: relatedApproval.toolName,
          risk: relatedApproval.risk,
          status: relatedApproval.status,
          reason: relatedApproval.reason || undefined,
        }
      : undefined,
  }
}

export function formatInboxStatusLabel(status?: string | null): string | null {
  if (!status) return null

  switch (status) {
    case 'pending':
      return '待处理'
    case 'resolved':
      return '已完成'
    case 'approved':
      return '已批准'
    case 'rejected':
      return '已拒绝'
    case 'active':
      return '运行中'
    case 'paused':
      return '已暂停'
    case 'completed':
      return '已完成'
    case 'error':
      return '异常'
    default:
      return status
  }
}

export function formatAuditActorRole(role?: string | null): string {
  switch (role) {
    case 'system':
      return '系统'
    case 'human':
      return '人工'
    case 'secretary':
      return '秘书'
    default:
      return role || '—'
  }
}

export function createResolvedAuthTimestampsIndex(audits: AuditRow[]): Map<string, number[]> {
  const resolvedAuthTimestampsByKey = new Map<string, number[]>()

  for (const audit of audits) {
    if (audit.action !== 'runtime.auth_resolved') continue
    const authKey = getAuditAuthKey(audit)
    if (!authKey) continue
    const timestamps = resolvedAuthTimestampsByKey.get(authKey) ?? []
    timestamps.push(formatTimestamp(audit.createdAt))
    resolvedAuthTimestampsByKey.set(authKey, timestamps)
  }

  return resolvedAuthTimestampsByKey
}

export function buildAuditPresentation(
  audit: AuditRow,
  resolvedAuthTimestampsByKey: Map<string, number[]>,
  relatedApproval?: RelatedApproval,
): AuditPresentation {
  const thread = audit.entry || relatedApproval?.target || null
  const about = relatedApproval?.target ?? audit.entry ?? audit.approval ?? null
  const { chatId, threadId } = extractChatThreadRef(thread)
  const actorRoleLabel = formatAuditActorRole(audit.actorRole)

  if (audit.action === 'runtime.auth_required') {
    const method = audit.toolName || null
    const authKey = getAuditAuthKey(audit)
    const createdAtTs = formatTimestamp(audit.createdAt)
    const resolvedAtTs = authKey ? (resolvedAuthTimestampsByKey.get(authKey) ?? []) : []
    const isResolved = resolvedAtTs.some((value) => value >= createdAtTs)

    return {
      title: method ? `认证请求 · ${method}` : '认证请求',
      description: method ? `运行时需要完成 ${method} 认证后才能继续。` : '运行时需要额外认证后才能继续。',
      category: 'auth_required',
      status: isResolved ? 'resolved' : 'pending',
      chatId,
      threadId,
      thread,
      about,
      authUrl: null,
      authMethod: method,
      authMessage: null,
      actorRoleLabel,
    }
  }

  if (audit.action === 'runtime.auth_resolved') {
    const method = audit.toolName || null
    return {
      title: method ? `认证完成 · ${method}` : '认证完成',
      description: '运行时认证已完成。',
      category: 'audit',
      status: 'resolved',
      chatId,
      threadId,
      thread,
      about,
      authUrl: null,
      authMethod: method,
      authMessage: null,
      actorRoleLabel,
    }
  }

  if (audit.action === 'runtime.tool_call.waiting_approval') {
    const toolName = audit.toolName || relatedApproval?.toolName || null
    const risk = relatedApproval?.risk ? `${relatedApproval.risk} 风险` : null

    return {
      title: toolName ? `工具请求 · ${toolName}` : '工具请求',
      description: [risk, '已进入审批队列'].filter(Boolean).join(' · ') || '工具调用已进入审批队列。',
      category: 'audit',
      status: undefined,
      chatId,
      threadId,
      thread,
      about,
      authUrl: null,
      authMethod: null,
      authMessage: null,
      actorRoleLabel,
    }
  }

  if (audit.action === 'inbox.approval.approved') {
    return {
      title: '授权已批准',
      description: buildApprovalDecisionDescription(audit, relatedApproval, 'approved'),
      category: 'audit',
      status: 'approved',
      chatId,
      threadId,
      thread,
      about,
      authUrl: null,
      authMethod: null,
      authMessage: null,
      actorRoleLabel,
    }
  }

  if (audit.action === 'inbox.approval.rejected') {
    return {
      title: '授权已拒绝',
      description: buildApprovalDecisionDescription(audit, relatedApproval, 'rejected'),
      category: 'audit',
      status: 'rejected',
      chatId,
      threadId,
      thread,
      about,
      authUrl: null,
      authMethod: null,
      authMessage: null,
      actorRoleLabel,
    }
  }

  if (audit.action === 'runtime.session.active') {
    return {
      title: '运行时已启动',
      description: buildRuntimeSessionDescription(audit, '运行时会话开始执行。'),
      category: 'audit',
      status: 'active',
      chatId,
      threadId,
      thread,
      about,
      authUrl: null,
      authMethod: null,
      authMessage: null,
      actorRoleLabel,
    }
  }

  if (audit.action === 'runtime.session.paused') {
    return {
      title: '运行时已暂停',
      description: buildRuntimeSessionDescription(audit, '运行时会话已暂停。'),
      category: 'audit',
      status: 'paused',
      chatId,
      threadId,
      thread,
      about,
      authUrl: null,
      authMethod: null,
      authMessage: null,
      actorRoleLabel,
    }
  }

  if (audit.action === 'runtime.session.completed') {
    return {
      title: '运行时已完成',
      description: buildRuntimeSessionDescription(audit, '运行时会话已完成。'),
      category: 'audit',
      status: 'completed',
      chatId,
      threadId,
      thread,
      about,
      authUrl: null,
      authMethod: null,
      authMessage: null,
      actorRoleLabel,
    }
  }

  if (audit.action === 'runtime.session.error') {
    return {
      title: '运行时异常',
      description: buildRuntimeSessionDescription(audit, '运行时会话执行失败。'),
      category: 'audit',
      status: 'error',
      chatId,
      threadId,
      thread,
      about,
      authUrl: null,
      authMethod: null,
      authMessage: null,
      actorRoleLabel,
    }
  }

  return {
    title: audit.action,
    description: actorRoleLabel,
    category: 'audit',
    status: undefined,
    chatId,
    threadId,
    thread,
    about,
    authUrl: null,
    authMethod: null,
    authMessage: null,
    actorRoleLabel,
  }
}
