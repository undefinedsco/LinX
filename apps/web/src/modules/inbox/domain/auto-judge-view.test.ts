import { describe, expect, it } from 'vitest'
import { AUTO_JUDGE_LEASE_OWNER, writeAutoJudgeContext } from '@linx/agent-runtime/auto-judge'
import { approvalAutoPhase, detectHighImpact, formatAutoJudgeRemaining, formatAutoJudgeWindow } from './auto-judge-view'
import { countActionableInboxItems, filterInboxItems } from './utils'

const now = new Date('2026-10-12T10:00:00.000Z')

function waitingApproval(minutes: number) {
  return {
    status: 'pending',
    assignedTo: 'https://pod.example/agents/linx#me',
    leaseOwner: AUTO_JUDGE_LEASE_OWNER,
    leaseExpiresAt: new Date(now.getTime() + minutes * 60_000),
    context: writeAutoJudgeContext(null, {
      grantId: 'g1',
      confidence: 'high',
      plannedAt: now.toISOString(),
    }),
  }
}

describe('auto-judge view helpers', () => {
  it('formats waits in plain Chinese', () => {
    expect(formatAutoJudgeRemaining(9 * 60_000)).toBe('9 分钟后')
    expect(formatAutoJudgeRemaining(60 * 60_000)).toBe('1 小时后')
    expect(formatAutoJudgeWindow(10 * 60_000)).toBe('10 分钟')
    expect(formatAutoJudgeWindow(2 * 60 * 60_000)).toBe('2 小时')
    expect(formatAutoJudgeWindow(null)).toBe('不自动，交给你')
  })

  it('detects spend, delete and send actions', () => {
    expect(detectHighImpact({ action: 'https://x/ns#sendInvites' })).toBe('send')
    expect(detectHighImpact({ toolName: 'delete_file' })).toBe('delete')
    expect(detectHighImpact({ toolName: 'purchase_ticket' })).toBe('spend')
    expect(detectHighImpact({ toolName: 'read_file' })).toBeNull()
  })

  it('keeps requests LinX is waiting on out of the pending list', () => {
    const phase = approvalAutoPhase(waitingApproval(9), now)
    expect(phase).toBe('waiting')
    const items = [
      { kind: 'approval' as const, category: 'approval' as const, status: 'pending', autoPhase: phase },
      { kind: 'approval' as const, category: 'approval' as const, status: 'pending', autoPhase: null },
    ]
    expect(countActionableInboxItems(items)).toBe(1)
    expect(filterInboxItems(items, 'pending')).toHaveLength(1)
    expect(filterInboxItems(items, 'done')).toHaveLength(0)
  })

  it('treats an elapsed wait as due', () => {
    expect(approvalAutoPhase(waitingApproval(-1), now)).toBe('due')
  })
})
