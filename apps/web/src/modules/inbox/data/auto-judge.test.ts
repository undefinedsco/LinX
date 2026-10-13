import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTO_JUDGE_LEASE_OWNER, writeAutoJudgeContext } from '@linx/agent-runtime/auto-judge'

const autoApprove = vi.fn().mockResolvedValue(true)

vi.mock('@/providers/solid-session-context', () => ({ useSession: () => ({ session: { info: {} } }) }))
vi.mock('@/providers/solid-database-provider', () => ({ useSolidDatabase: () => ({ db: null }) }))
vi.mock('./collections', () => ({
  approvalCollection: {},
  grantCollection: {},
  continueRuntimeAfterApproval: vi.fn(),
  inboxOps: { autoApproveApproval: (...args: unknown[]) => autoApprove(...args) },
}))

import { sweepDueAutoJudge } from './auto-judge'

const now = new Date('2026-10-12T10:00:00.000Z')
const base = {
  status: 'pending',
  assignedTo: 'https://pod.example/agents/linx#me',
  leaseOwner: AUTO_JUDGE_LEASE_OWNER,
  context: writeAutoJudgeContext(null, { grantId: 'g1', confidence: 'high', plannedAt: now.toISOString() }),
}

describe('sweepDueAutoJudge', () => {
  beforeEach(() => autoApprove.mockClear())

  it('approves only requests whose wait has run out', async () => {
    const due = { id: 'a', ...base, leaseExpiresAt: new Date(now.getTime() - 1000) }
    const waiting = { id: 'b', ...base, leaseExpiresAt: new Date(now.getTime() + 60_000) }
    const noGrant = { id: 'c', status: 'pending', context: null }
    const onApproved = vi.fn()

    const count = await sweepDueAutoJudge({
      approvals: [due, waiting, noGrant] as never,
      userWebId: 'https://alice.example/profile/card#me',
      now,
      onApproved,
    })

    expect(count).toBe(1)
    expect(autoApprove).toHaveBeenCalledTimes(1)
    expect(autoApprove).toHaveBeenCalledWith(expect.objectContaining({ approval: due }))
    expect(onApproved).toHaveBeenCalledWith(due)
  })
})
