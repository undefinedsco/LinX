import { describe, expect, it } from 'vitest'
import {
  formatRemaining,
  isHighImpactApproval,
  readAutoJudge,
  readPermissionCommand,
  resourceMatches,
} from './card-model'

describe('card model', () => {
  it('matches row ids to resource URIs', () => {
    const uri = 'https://alice.example/.data/approvals/2026/10/11.ttl#abc'
    expect(resourceMatches('2026/10/11.ttl#abc', uri)).toBe(true)
    expect(resourceMatches('abc', uri)).toBe(true)
    expect(resourceMatches('other', uri)).toBe(false)
    expect(resourceMatches(null, uri)).toBe(false)
  })

  it('treats sending, spending and deleting as needing a second confirmation', () => {
    expect(isHighImpactApproval({ risk: 'low', toolName: 'calendar.send_invite', action: 'x' } as never)).toBe(true)
    expect(isHighImpactApproval({ risk: 'high', toolName: 'read', action: 'x' } as never)).toBe(true)
    expect(isHighImpactApproval({ risk: 'low', toolName: 'read_file', action: 'http://www.w3.org/ns/odrl/2/read' } as never)).toBe(false)
  })

  it('reads the auto-judge plan the inbox track stores on the approval', () => {
    const context = JSON.stringify({ note: 'x', linxAutoJudge: { grantId: 'g1', confidence: 'medium', decideAt: '2026-10-11T10:00:00Z', plannedAt: '2026-10-11T08:00:00Z' } })
    const waiting = { status: 'pending', context, leaseOwner: 'linx:auto-judge', leaseExpiresAt: '2026-10-11T10:00:00Z' }
    const now = new Date('2026-10-11T09:00:00Z')
    const state = readAutoJudge(waiting as never, now)
    expect(state).toMatchObject({ confidence: 'medium', grantId: 'g1' })
    expect(state?.decideAt.toISOString()).toBe('2026-10-11T10:00:00.000Z')
    expect(readAutoJudge({ ...waiting, status: 'approved' } as never, now)).toBeNull()
    expect(readAutoJudge({ ...waiting, leaseOwner: null } as never, now)).toBeNull()
  })

  it('says how long is left in plain words', () => {
    expect(formatRemaining(9 * 60_000)).toBe('9 分钟')
    expect(formatRemaining(112 * 60_000)).toBe('1 小时 52 分')
    expect(formatRemaining(30_000)).toBe('1 分钟')
    expect(formatRemaining(0)).toBe('马上')
  })

  it('reads a coding tool permission request', () => {
    expect(readPermissionCommand({ toolName: 'bash', context: JSON.stringify({ command: 'npm test', cwd: '/work/web', network: false }) } as never))
      .toEqual({ command: 'npm test', folder: '/work/web', network: false })
    expect(readPermissionCommand({ toolName: 'bash', context: null } as never)).toEqual({ command: 'bash', folder: null, network: null })
  })
})
