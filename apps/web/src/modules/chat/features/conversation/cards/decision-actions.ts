/**
 * Pressing a card button = writing the resource the card is bound to (spec
 * §3.1). The runtime watches the resource and carries on, so the same press in
 * the inbox or by LinX itself takes the same path.
 */
import { useCallback, useMemo } from 'react'
import { approvalResource, grantResource, type ApprovalRow, type InputRequestRow } from '@undefineds.co/models'
import { useResolveInboxApproval, useResolveInboxInputRequest } from '@/modules/inbox/collections'
import { updateExactRecord } from '@/lib/data/exact-records'
import { useSession } from '@/providers/solid-session-context'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { grantTitleFor } from './card-model'
import { buildAutoJudgeTakeOverPatch, type AutoJudgeApprovalLike } from '@linx/agent-runtime/auto-judge'

export interface ApprovalDecision {
  approval: ApprovalRow
  /** The question the card showed, used to name the grant. */
  question: string
  /** "以后这类交给 LinX 判断": also write a grant. */
  delegate?: boolean
}

export type ApprovalOutcome =
  | { granted: false }
  | { granted: true; grantUri: string }
  | { granted: false; grantFailed: true }

export function useDecisionActions() {
  const resolveApproval = useResolveInboxApproval()
  const resolveInput = useResolveInboxInputRequest()
  const { db } = useSolidDatabase()
  const { session } = useSession()
  const webId = session.info.webId

  const createGrant = useCallback(async (decision: ApprovalDecision): Promise<string> => {
    if (!db || !webId) throw new Error('空间还没准备好')
    const id = `${crypto.randomUUID()}.ttl`
    const { approval } = decision
    await db.insert(grantResource).values({
      id,
      target: approval.target,
      action: approval.action,
      effect: 'allow',
      riskCeiling: approval.risk,
      title: grantTitleFor(approval, decision.question),
      source: 'approval',
      decisionBy: webId,
      decisionRole: 'human',
      createdAt: new Date(),
    } as never).execute()
    return db.resolveRowIri(grantResource as never, { id } as never)
  }, [db, webId])

  const approve = useCallback(async (decision: ApprovalDecision): Promise<ApprovalOutcome> => {
    await resolveApproval.mutateAsync({ approval: decision.approval, decision: 'approved' })
    if (!decision.delegate) return { granted: false }
    try {
      return { granted: true, grantUri: await createGrant(decision) }
    } catch {
      return { granted: false, grantFailed: true }
    }
  }, [createGrant, resolveApproval])

  const reject = useCallback(
    (approval: ApprovalRow) => resolveApproval.mutateAsync({ approval, decision: 'rejected' }),
    [resolveApproval],
  )

  const answer = useCallback(
    (inputRequest: InputRequestRow, response: string) => resolveInput.mutateAsync({ inputRequest, response }),
    [resolveInput],
  )

  /** "我来判断": the pending request stops counting down and waits for the person. */
  const takeOver = useCallback(async (approval: ApprovalRow) => {
    if (!db) throw new Error('空间还没准备好')
    const iri = db.resolveRowIri(approvalResource as never, {
      id: approval.id,
      createdAt: approval.createdAt ?? new Date(),
    } as never)
    const patch = webId
      ? buildAutoJudgeTakeOverPatch({ approval: approval as unknown as AutoJudgeApprovalLike, userWebId: webId, now: new Date() })
      : null
    if (!patch) return
    await updateExactRecord(db, approvalResource as never, iri, patch as never)
  }, [db, webId])

  const revokeGrant = useCallback(async (grantUri: string) => {
    if (!db) throw new Error('空间还没准备好')
    await updateExactRecord(db, grantResource as never, grantUri, { revokedAt: new Date() })
  }, [db])

  return useMemo(
    () => ({ approve, reject, answer, takeOver, revokeGrant }),
    [answer, approve, reject, revokeGrant, takeOver],
  )
}
