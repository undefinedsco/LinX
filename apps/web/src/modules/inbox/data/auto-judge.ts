import { useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { useMutation } from '@tanstack/react-query'
import type { ApprovalRow, GrantRow } from '@undefineds.co/models'
import { isAutoJudgeDue, needsAutoJudgePlan, readAutoJudgeState } from '@linx/agent-runtime/auto-judge'
import type { AutoJudgeWindows } from '@linx/agent-runtime/auto-judge'
import { useSession } from '@/providers/solid-session-context'
import { approvalCollection, grantCollection, inboxOps } from './collections'

/** How often the inbox looks for requests whose wait has run out. */
export const AUTO_JUDGE_SWEEP_INTERVAL_MS = 30_000

let sweeping = false

/**
 * Approves every request whose wait has run out. Runs while the inbox module
 * is mounted (rail button and list); safe to mount twice, only one sweep runs
 * at a time and each approval is re-checked before it is approved.
 */
export async function sweepDueAutoJudge(input: {
  approvals: readonly ApprovalRow[]
  userWebId: string
  now?: Date
  /**
   * With the person's three waits (from the Pod), requests nobody has planned
   * yet are planned first: a covering grant of this assistant starts the wait.
   */
  planning?: {
    grants: readonly GrantRow[]
    windows: AutoJudgeWindows
    agentIri: string
    podBaseUrl?: string | null
  }
  onApproved?: (approval: ApprovalRow) => void | Promise<void>
}): Promise<number> {
  if (sweeping) return 0
  sweeping = true
  let approved = 0
  try {
    const now = input.now ?? new Date()
    if (input.planning) {
      for (const approval of input.approvals) {
        if (!needsAutoJudgePlan(approval)) continue
        try {
          await inboxOps.planApprovalAutoJudge({ approval, userWebId: input.userWebId, now, ...input.planning })
        } catch (error) {
          console.warn('[Inbox] Planning auto judge failed:', error)
        }
      }
    }
    for (const approval of input.approvals) {
      if (approval.status !== 'pending' || !isAutoJudgeDue(approval, now)) continue
      try {
        if (await inboxOps.autoApproveApproval({ approval, userWebId: input.userWebId, now })) {
          approved += 1
          await input.onApproved?.(approval)
        }
      } catch (error) {
        console.warn('[Inbox] Auto approval failed:', error)
      }
    }
  } finally {
    sweeping = false
  }
  return approved
}

export function useAutoJudgeActions() {
  const { session } = useSession()
  const webId = () => {
    const value = session.info.webId
    if (!value) throw new Error('Solid session is not ready')
    return value
  }
  const takeOver = useMutation({
    mutationFn: async (approval: ApprovalRow) => inboxOps.takeOverApproval({ approval, userWebId: webId() }),
  })
  const markReviewed = useMutation({
    mutationFn: async (approval: ApprovalRow) => inboxOps.markAutoApprovalReviewed({ approval, userWebId: webId() }),
  })
  const revokeGrant = useMutation({
    mutationFn: async (grant: GrantRow) => inboxOps.revokeGrant({ grant }),
  })
  return { takeOver, markReviewed, revokeGrant }
}

export function useGrantRows() {
  const query = useLiveQuery(grantCollection)
  const data = useMemo(() => ((query.data ?? []) as GrantRow[]).filter((grant) => !grant.revokedAt), [query.data])
  const all = useMemo(() => (query.data ?? []) as GrantRow[], [query.data])
  return { data, all, isLoading: query.isLoading }
}

/** How many requests each grant has covered (auto-judged approvals citing it). */
export function useGrantUseCounts(): Map<string, number> {
  const approvals = useLiveQuery(approvalCollection)
  return useMemo(() => {
    const counts = new Map<string, number>()
    for (const approval of (approvals.data ?? []) as ApprovalRow[]) {
      const grantId = readAutoJudgeState(approval)?.grantId
      if (grantId) counts.set(grantId, (counts.get(grantId) ?? 0) + 1)
    }
    return counts
  }, [approvals.data])
}
