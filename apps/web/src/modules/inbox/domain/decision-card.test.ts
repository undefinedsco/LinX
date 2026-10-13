import { describe, expect, it } from 'vitest'
import type { InboxItem } from './inbox-item'
import { decisionKind, decisionOutcome, describeDecisionOutcome } from './decision-card'

const approval = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 'approval:a1',
  kind: 'approval',
  category: 'approval',
  title: '发送排班日历邀请？',
  description: '',
  timestamp: '',
  status,
  approval: { id: 'a1', status, resolvedAt: '2026-10-11T02:43:00.000Z', ...extra },
}) as unknown as InboxItem

const input = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 'input:i1',
  kind: 'input_request',
  category: 'input_request',
  title: '周日下午几点开始？',
  description: '',
  timestamp: '',
  status,
  inputRequest: { id: 'i1', status, requestKind: 'user-input', response: '14:00', resolvedAt: '2026-10-11T02:45:00.000Z', ...extra },
}) as unknown as InboxItem

describe('decision cards', () => {
  it('tells approvals, questions and logins apart', () => {
    expect(decisionKind(approval('pending'))).toBe('approval')
    expect(decisionKind(input('pending'))).toBe('input')
    expect(decisionKind({ kind: 'audit', category: 'auth_required' })).toBe('login')
    expect(decisionKind({ kind: 'audit', category: 'audit' })).toBeNull()
  })

  it('has no outcome while the request still waits', () => {
    expect(decisionOutcome(approval('pending'))).toBeNull()
    expect(decisionOutcome(input('handling'))).toBeNull()
  })

  it('maps every finished state to an outcome', () => {
    expect(decisionOutcome(approval('approved'))).toBe('approved')
    expect(decisionOutcome(approval('rejected'))).toBe('rejected')
    expect(decisionOutcome(input('resolved'))).toBe('answered')
    expect(decisionOutcome(input('expired'))).toBe('expired')
    expect(decisionOutcome(input('cancelled'))).toBe('withdrawn')
  })

  it('says where it was handled', () => {
    expect(describeDecisionOutcome(approval('approved'), 'approved', true)).toMatch(/^已批准 · \d\d:\d\d$/)
    expect(describeDecisionOutcome(approval('approved'), 'approved', false)).toMatch(/^已在收件箱批准/)
    expect(describeDecisionOutcome(input('resolved'), 'answered', true)).toBe('14:00 · 已回答')
  })

  it('never repeats a secret answer', () => {
    const secret = input('resolved', { requestKind: 'secret', response: '482913' })
    expect(describeDecisionOutcome(secret, 'answered', true)).toBe('已回答（内容不显示）')
  })
})
