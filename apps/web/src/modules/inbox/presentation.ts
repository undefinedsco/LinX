import type { AuditRow } from '@linx/models'

export interface AuditPresentation {
  title: string
  description: string
  category: 'auth_required' | 'audit'
  status?: string
  chatId: string | null
  threadId: string | null
  authUrl: string | null
  authMethod: string | null
  authMessage: string | null
  actorRoleLabel: string
}

function parseAuditContext(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function formatTimestamp(value: unknown): number {
  if (!value) return 0
  const time = new Date(String(value)).getTime()
  return Number.isFinite(time) ? time : 0
}

function extractChatThreadRef(uri: string | null | undefined): { chatId: string | null; threadId: string | null } {
  if (!uri) return { chatId: null, threadId: null }

  const match = uri.match(/\.data\/chat\/([^/]+)\/index\.ttl#(.+)$/)
  return {
    chatId: match?.[1] ?? null,
    threadId: match?.[2] ?? null,
  }
}

function getAuditAuthKey(audit: AuditRow, context: Record<string, unknown> | null): string | null {
  const method = typeof context?.method === 'string' ? context.method : null
  const url = typeof context?.url === 'string' ? context.url : null
  if (!method && !url) return null
  return `${audit.session ?? ''}:${method ?? ''}:${url ?? ''}`
}

function buildRuntimeSessionDescription(context: Record<string, unknown> | null, fallback: string): string {
  const title = typeof context?.title === 'string' ? context.title : null
  const tool = typeof context?.tool === 'string' ? context.tool : null
  const parts = [title, tool ? `工具 ${tool}` : null].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : fallback
}

function buildApprovalDecisionDescription(context: Record<string, unknown> | null, decision: 'approved' | 'rejected'): string {
  const toolName = typeof context?.toolName === 'string' ? context.toolName : null
  const risk = typeof context?.risk === 'string' ? `${context.risk} 风险` : null
  const reason = typeof context?.reason === 'string' && context.reason.trim().length > 0 ? context.reason.trim() : null
  const lead = decision === 'approved' ? '收件箱已批准工具执行。' : '收件箱已拒绝工具执行。'
  const parts = [toolName, risk, reason].filter(Boolean)
  return parts.length > 0 ? `${lead} ${parts.join(' · ')}` : lead
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
    const context = parseAuditContext(audit.context)
    const authKey = getAuditAuthKey(audit, context)
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
): AuditPresentation {
  const context = parseAuditContext(audit.context)
  const threadUri = typeof context?.threadUri === 'string' ? context.threadUri : null
  const { chatId, threadId } = extractChatThreadRef(threadUri)
  const actorRoleLabel = formatAuditActorRole(audit.actorRole)

  if (audit.action === 'runtime.auth_required') {
    const method = typeof context?.method === 'string' ? context.method : null
    const url = typeof context?.url === 'string' ? context.url : null
    const message = typeof context?.message === 'string' ? context.message : null
    const descriptionParts = [message, method, url].filter(Boolean)

    const authKey = getAuditAuthKey(audit, context)
    const createdAtTs = formatTimestamp(audit.createdAt)
    const resolvedAtTs = authKey ? (resolvedAuthTimestampsByKey.get(authKey) ?? []) : []
    const isResolved = resolvedAtTs.some((value) => value >= createdAtTs)

    return {
      title: method ? `认证请求 · ${method}` : '认证请求',
      description: descriptionParts.length > 0 ? descriptionParts.join(' · ') : '运行时需要额外认证后才能继续。',
      category: 'auth_required',
      status: isResolved ? 'resolved' : 'pending',
      chatId,
      threadId,
      authUrl: url,
      authMethod: method,
      authMessage: message,
      actorRoleLabel,
    }
  }

  if (audit.action === 'runtime.auth_resolved') {
    const method = typeof context?.method === 'string' ? context.method : null
    const url = typeof context?.url === 'string' ? context.url : null
    const descriptionParts = [method ? '认证已完成' : null, url].filter(Boolean)

    return {
      title: method ? `认证完成 · ${method}` : '认证完成',
      description: descriptionParts.length > 0 ? descriptionParts.join(' · ') : '运行时认证已完成。',
      category: 'audit',
      status: 'resolved',
      chatId,
      threadId,
      authUrl: url,
      authMethod: method,
      authMessage: null,
      actorRoleLabel,
    }
  }

  if (audit.action === 'runtime.tool_call.waiting_approval') {
    const toolName = typeof context?.toolName === 'string' ? context.toolName : null
    const risk = typeof context?.risk === 'string' ? `${context.risk} 风险` : null

    return {
      title: toolName ? `工具请求 · ${toolName}` : '工具请求',
      description: [risk, '已进入审批队列'].filter(Boolean).join(' · ') || '工具调用已进入审批队列。',
      category: 'audit',
      status: undefined,
      chatId,
      threadId,
      authUrl: null,
      authMethod: null,
      authMessage: null,
      actorRoleLabel,
    }
  }

  if (audit.action === 'inbox.approval.approved') {
    return {
      title: '授权已批准',
      description: buildApprovalDecisionDescription(context, 'approved'),
      category: 'audit',
      status: 'approved',
      chatId,
      threadId,
      authUrl: null,
      authMethod: null,
      authMessage: null,
      actorRoleLabel,
    }
  }

  if (audit.action === 'inbox.approval.rejected') {
    return {
      title: '授权已拒绝',
      description: buildApprovalDecisionDescription(context, 'rejected'),
      category: 'audit',
      status: 'rejected',
      chatId,
      threadId,
      authUrl: null,
      authMethod: null,
      authMessage: null,
      actorRoleLabel,
    }
  }

  if (audit.action === 'runtime.session.active') {
    return {
      title: '运行时已启动',
      description: buildRuntimeSessionDescription(context, '运行时会话开始执行。'),
      category: 'audit',
      status: 'active',
      chatId,
      threadId,
      authUrl: null,
      authMethod: null,
      authMessage: null,
      actorRoleLabel,
    }
  }

  if (audit.action === 'runtime.session.paused') {
    return {
      title: '运行时已暂停',
      description: buildRuntimeSessionDescription(context, '运行时会话已暂停。'),
      category: 'audit',
      status: 'paused',
      chatId,
      threadId,
      authUrl: null,
      authMethod: null,
      authMessage: null,
      actorRoleLabel,
    }
  }

  if (audit.action === 'runtime.session.completed') {
    return {
      title: '运行时已完成',
      description: buildRuntimeSessionDescription(context, '运行时会话已完成。'),
      category: 'audit',
      status: 'completed',
      chatId,
      threadId,
      authUrl: null,
      authMethod: null,
      authMessage: null,
      actorRoleLabel,
    }
  }

  if (audit.action === 'runtime.session.error') {
    const message = typeof context?.message === 'string' ? context.message : null
    return {
      title: '运行时异常',
      description: message || buildRuntimeSessionDescription(context, '运行时会话执行失败。'),
      category: 'audit',
      status: 'error',
      chatId,
      threadId,
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
    authUrl: null,
    authMethod: null,
    authMessage: null,
    actorRoleLabel,
  }
}
