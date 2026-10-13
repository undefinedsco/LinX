import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  useInboxItems,
  useResolveInboxApproval,
  useResolveInboxInputRequest,
} from '@/modules/inbox/collections'
import type { InboxItem } from '@/modules/inbox/domain/inbox-item'
import {
  decisionKind,
  decisionOutcome,
  describeDecisionOutcome,
  type DecisionKind,
} from '@/modules/inbox/domain/decision-card'
import {
  isSecretInputRequest,
  parseInputRequestOptions,
  type InputRequestOption,
} from '@/modules/inbox/domain/input-request'
import { isActionableInboxItem } from '@/modules/inbox/utils'
import { useSession } from '@/providers/solid-session-context'
import { chatOps, useLinxDefaultSecretaryBootstrapSettling } from '../../collections'

const SUBMIT_FAILED = '没提交成功，你的选择还在。重试不会重复发送。'

export type DecisionBusy = 'approve' | 'reject' | 'answer' | 'reask'

export interface DecisionCardModel {
  item: InboxItem
  kind: DecisionKind
  title: string
  detail: string | null
  pending: boolean
  deferred: boolean
  busy: DecisionBusy | null
  error: string | null
  outcomeText: string | null
  canReask: boolean
  input: { options: InputRequestOption[]; secret: boolean; context: string | null } | null
}

function addTo(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set)
  next.add(id)
  return next
}

/**
 * Requests raised in this conversation, handled right here. Anything the
 * person saw waiting stays visible with its outcome until they dismiss it,
 * so a request handled in the inbox meanwhile does not silently vanish.
 */
export function useConversationDecisions(chatId: string, threadId: string) {
  const settling = useLinxDefaultSecretaryBootstrapSettling()
  const { data: items = [] } = useInboxItems('all', { enabled: !settling })
  const resolveApproval = useResolveInboxApproval()
  const resolveInput = useResolveInboxInputRequest()
  const { session } = useSession()
  const [seenPending, setSeenPending] = useState<Set<string>>(() => new Set())
  const [resolvedHere, setResolvedHere] = useState<Set<string>>(() => new Set())
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const [deferred, setDeferred] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState<Record<string, DecisionBusy>>({})
  const [errors, setErrors] = useState<Record<string, { message: string; retry: () => void }>>({})
  const [answers, setAnswers] = useState<Record<string, string>>({})

  const threadItems = useMemo(() => items.filter((item) => (
    item.chatId === chatId
    && (!item.threadId || item.threadId === threadId)
    && decisionKind(item) !== null
  )), [chatId, items, threadId])

  useEffect(() => {
    const pendingIds = threadItems.filter(isActionableInboxItem).map((item) => item.id)
    if (pendingIds.every((id) => seenPending.has(id))) return
    setSeenPending((current) => {
      const next = new Set(current)
      for (const id of pendingIds) next.add(id)
      return next
    })
  }, [seenPending, threadItems])

  useEffect(() => {
    setSeenPending(new Set())
    setResolvedHere(new Set())
    setDismissed(new Set())
    setDeferred(new Set())
    setErrors({})
  }, [chatId, threadId])

  const run = useCallback(async (item: InboxItem, kind: DecisionBusy, action: () => Promise<void>) => {
    setBusy((current) => ({ ...current, [item.id]: kind }))
    setErrors((current) => {
      const { [item.id]: _cleared, ...rest } = current
      return rest
    })
    try {
      await action()
      setResolvedHere((current) => addTo(current, item.id))
    } catch {
      setErrors((current) => ({
        ...current,
        [item.id]: { message: SUBMIT_FAILED, retry: () => void run(item, kind, action) },
      }))
    } finally {
      setBusy((current) => {
        const { [item.id]: _done, ...rest } = current
        return rest
      })
    }
  }, [])

  const approve = useCallback((item: InboxItem, decision: 'approved' | 'rejected') => {
    if (!item.approval) return
    const approval = item.approval
    void run(item, decision === 'approved' ? 'approve' : 'reject', async () => {
      await resolveApproval.mutateAsync({ approval, decision })
    })
  }, [resolveApproval, run])

  const answer = useCallback((item: InboxItem) => {
    const response = answers[item.id]?.trim()
    if (!item.inputRequest || !response) return
    const inputRequest = item.inputRequest
    void run(item, 'answer', async () => {
      await resolveInput.mutateAsync({ inputRequest, response })
    })
  }, [answers, resolveInput, run])

  /** An expired request: ask the assistant, in this topic, to ask again. */
  const reask = useCallback((item: InboxItem) => {
    const webId = session.info.webId
    if (!webId) return
    void run(item, 'reask', async () => {
      await chatOps.createUserMessage(chatId, threadId, `请重新问我：${item.title}`, webId)
    })
  }, [chatId, run, session.info.webId, threadId])

  const cards = useMemo<DecisionCardModel[]>(() => threadItems.flatMap((item) => {
    const kind = decisionKind(item)
    if (!kind) return []
    const pending = isActionableInboxItem(item)
    if (!pending && (!seenPending.has(item.id) || dismissed.has(item.id))) return []
    const outcome = pending ? null : decisionOutcome(item)
    const secret = kind === 'input' && isSecretInputRequest(item.inputRequest?.requestKind)
    return [{
      item,
      kind,
      title: item.title?.trim() || (kind === 'login' ? '需要登录外部服务' : kind === 'input' ? '需要你补充一点信息' : '需要你决定'),
      detail: item.description?.trim() || null,
      pending,
      deferred: pending && deferred.has(item.id),
      busy: busy[item.id] ?? null,
      error: errors[item.id]?.message ?? null,
      outcomeText: outcome ? describeDecisionOutcome(item, outcome, resolvedHere.has(item.id)) : null,
      canReask: outcome === 'expired' && !resolvedHere.has(item.id),
      input: kind === 'input'
        ? {
            options: parseInputRequestOptions(item.inputRequest?.inputOptions),
            secret,
            context: item.inputRequest?.context ?? null,
          }
        : null,
    }]
  }), [busy, deferred, dismissed, errors, resolvedHere, seenPending, threadItems])

  return {
    cards,
    answers,
    setAnswer: (id: string, value: string) => setAnswers((current) => ({ ...current, [id]: value })),
    approve,
    answer,
    reask,
    retry: (id: string) => errors[id]?.retry(),
    cancelError: (id: string) => setErrors((current) => {
      const { [id]: _cancelled, ...rest } = current
      return rest
    }),
    defer: (id: string) => setDeferred((current) => addTo(current, id)),
    resume: (id: string) => setDeferred((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    }),
    dismiss: (id: string) => setDismissed((current) => addTo(current, id)),
  }
}
