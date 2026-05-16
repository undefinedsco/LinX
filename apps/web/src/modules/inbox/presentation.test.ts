import { describe, expect, it } from 'vitest'
import { buildAuditPresentation, createResolvedAuthTimestampsIndex, formatAuditActorRole, formatInboxStatusLabel } from './presentation'

describe('inbox presentation', () => {
  it('maps runtime session events to user-facing copy', () => {
    const audit = {
      id: 'audit-session-completed',
      action: 'runtime.session.completed',
      actorRole: 'system',
      session: 'urn:linx:runtime-session:runtime-1',
      entry: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
      createdAt: '2026-03-12T12:00:00.000Z',
    }

    const presentation = buildAuditPresentation(audit as any, new Map())

    expect(presentation.title).toBe('运行时已完成')
    expect(presentation.description).toBe('运行时会话已完成。')
    expect(presentation.status).toBe('completed')
    expect(presentation.chatId).toBe('chat-1')
    expect(presentation.threadId).toBe('thread-1')
    expect(presentation.actorRoleLabel).toBe('系统')
  })

  it('maps approval decision audits to human-readable copy', () => {
    const audit = {
      id: 'audit-approval-approved',
      action: 'inbox.approval.approved',
      actorRole: 'human',
      session: 'urn:linx:runtime-session:runtime-1',
      createdAt: '2026-03-12T12:00:00.000Z',
    }
    const approval = {
      toolName: 'write_file',
      risk: 'high',
      reason: '确认路径安全',
    }

    const presentation = buildAuditPresentation(audit as any, new Map(), approval as any)

    expect(presentation.title).toBe('授权已批准')
    expect(presentation.description).toContain('收件箱已批准工具执行。')
    expect(presentation.description).toContain('write_file')
    expect(presentation.description).toContain('high 风险')
    expect(presentation.description).toContain('确认路径安全')
    expect(presentation.status).toBe('approved')
  })

  it('keeps tool-call timeline events informational instead of actionable', () => {
    const audit = {
      id: 'audit-tool-call',
      action: 'runtime.tool_call.waiting_approval',
      actorRole: 'system',
      session: 'urn:linx:runtime-session:runtime-1',
      toolName: 'write_file',
      createdAt: '2026-03-12T12:00:00.000Z',
    }
    const approval = { risk: 'high' }

    const presentation = buildAuditPresentation(audit as any, new Map(), approval as any)

    expect(presentation.title).toBe('工具请求 · write_file')
    expect(presentation.description).toContain('已进入审批队列')
    expect(presentation.status).toBeUndefined()
  })

  it('marks auth request as resolved once matching auth_resolved exists', () => {
    const authRequired = {
      id: 'audit-auth-required',
      action: 'runtime.auth_required',
      actorRole: 'system',
      session: 'urn:linx:runtime-session:runtime-1',
      entry: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
      createdAt: '2026-03-12T12:00:00.000Z',
    }

    const authResolved = {
      id: 'audit-auth-resolved',
      action: 'runtime.auth_resolved',
      actorRole: 'system',
      session: 'urn:linx:runtime-session:runtime-1',
      entry: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
      createdAt: '2026-03-12T12:01:00.000Z',
    }

    const resolvedIndex = createResolvedAuthTimestampsIndex([authResolved as any])
    const presentation = buildAuditPresentation(authRequired as any, resolvedIndex)

    expect(presentation.status).toBe('resolved')
    expect(presentation.category).toBe('auth_required')
  })

  it('formats actor roles and status labels', () => {
    expect(formatAuditActorRole('human')).toBe('人工')
    expect(formatAuditActorRole('secretary')).toBe('秘书')
    expect(formatInboxStatusLabel('resolved')).toBe('已完成')
    expect(formatInboxStatusLabel('approved')).toBe('已批准')
    expect(formatInboxStatusLabel('error')).toBe('异常')
  })
})
