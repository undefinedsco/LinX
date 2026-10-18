import { useEffect, useRef } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { agentResource, type ApprovalRow, type GrantRow } from '@undefineds.co/models'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { LINX_DEFAULT_SECRETARY } from '@/modules/chat/collections'
import { useSession } from '@/providers/solid-session-context'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { AUTO_JUDGE_SWEEP_INTERVAL_MS, sweepDueAutoJudge } from '../data/auto-judge'
import { approvalCollection, continueRuntimeAfterApproval, grantCollection } from '../data/collections'
import { useAutoJudgeSettings } from './auto-judge-settings'

/** Reads the three waits from the Pod (and migrates the browser copy once). Safe to mount in several places. */
export function useAutoJudgeSettingsSync() {
  const { session } = useSession()
  const { db } = useSolidDatabase()
  const hydrate = useAutoJudgeSettings((state) => state.hydrate)
  const podBaseUrl = db ? resolveCurrentPodBaseUrl(db) : null
  const authFetch = session.fetch
  useEffect(() => {
    if (podBaseUrl && authFetch) void hydrate({ podBaseUrl, fetch: authFetch as never })
  }, [authFetch, hydrate, podBaseUrl])
}

/** Periodic check in the inbox module: approve due requests on the person's behalf. */
export function useInboxAutoJudgeSweep(intervalMs: number = AUTO_JUDGE_SWEEP_INTERVAL_MS) {
  const { session } = useSession()
  const { db } = useSolidDatabase()
  const approvals = useLiveQuery(approvalCollection)
  const approvalsRef = useRef<readonly ApprovalRow[]>([])
  approvalsRef.current = (approvals.data ?? []) as ApprovalRow[]
  const grants = useLiveQuery(grantCollection)
  const grantsRef = useRef<readonly GrantRow[]>([])
  grantsRef.current = ((grants.data ?? []) as GrantRow[]).filter((grant) => !grant.revokedAt)
  const webId = session.info.webId
  const authFetch = session.fetch
  const podBaseUrl = db ? resolveCurrentPodBaseUrl(db) : null
  useAutoJudgeSettingsSync()

  useEffect(() => {
    if (!webId || !db) return undefined
    const agentIri = (() => {
      try {
        return String(db.resolveRowIri(agentResource as never, { id: LINX_DEFAULT_SECRETARY.agentId } as never))
      } catch {
        return null
      }
    })()
    const run = () => void sweepDueAutoJudge({
      approvals: approvalsRef.current,
      userWebId: webId,
      planning: agentIri
        ? { grants: grantsRef.current, windows: useAutoJudgeSettings.getState().windows, agentIri, podBaseUrl }
        : undefined,
      onApproved: (approval) => continueRuntimeAfterApproval({
        approval,
        decision: 'approved',
        db,
        webId,
        authFetch,
      }),
    })
    run()
    const timer = setInterval(run, intervalMs)
    return () => clearInterval(timer)
  }, [authFetch, db, intervalMs, podBaseUrl, webId])
}
