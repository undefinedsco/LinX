import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useChatStore } from '@/modules/chat/store'
import { chatOps } from '@/modules/chat/collections'
import { useSession } from '@/providers/solid-session-context'
import { useInboxStore } from '../../app/store'
import { useInboxItems, useResolveInboxApproval, useResolveInboxInputRequest } from '../../data/collections'
import { formatInputSteerMessage, isPendingInputRequestStatus, isSecretInputRequest, parseInputRequestOptions } from '../../domain/input-request'
import { buildAuditPresentation, createResolvedAuthTimestampsIndex, formatAuditActorRole, formatInboxStatusLabel } from '../../domain/presentation'
import { isActionableInboxItem } from '../../domain/utils'
import { useAutoJudgeActions, useGrantRows } from '../../data/auto-judge'
import {
  AUTO_JUDGE_CONFIDENCE_LABEL,
  HIGH_IMPACT_LABEL,
  autoJudgeRemaining,
  autoJudgeStateOf,
  describeGrantAction,
  detectHighImpact,
  formatAutoJudgeRemaining,
} from '../../domain/auto-judge-view'
import type { InboxAutoDetail } from '../../ui/InboxDetail'

function formatTime(value: string | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN')
}

export function useInboxContentPaneController() {
  const [reason, setReason] = useState('')
  const [inputAnswer, setInputAnswer] = useState('')
  const [grantChecked, setGrantChecked] = useState(false)
  const [confirmGrantOpen, setConfirmGrantOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [steerError, setSteerError] = useState<string | null>(null)
  const [isSteering, setIsSteering] = useState(false)
  const { session } = useSession()
  const navigate = useNavigate()
  const selectChat = useChatStore((state) => state.selectChat)
  const selectThread = useChatStore((state) => state.selectThread)
  const selectedItemId = useInboxStore((state) => state.selectedItemId)
  const selectItem = useInboxStore((state) => state.selectItem)
  const { data: items = [], isLoading } = useInboxItems()
  const resolveApproval = useResolveInboxApproval()
  const resolveInputRequest = useResolveInboxInputRequest()
  const { takeOver, markReviewed, revokeGrant } = useAutoJudgeActions()
  const { all: grants } = useGrantRows()
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null
  const resolvedAuthIndex = useMemo(
    () => createResolvedAuthTimestampsIndex(items.flatMap((item) => (item.audit ? [item.audit] : []))),
    [items],
  )

  useEffect(() => {
    setGrantChecked(false)
    setConfirmGrantOpen(false)
  }, [selectedItemId])
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const impactKind = selectedItem?.approval
    ? detectHighImpact({ action: selectedItem.approval.action, toolName: selectedItem.approval.toolName })
    : null
  const autoDetail = useMemo<InboxAutoDetail | null>(() => {
    const approval = selectedItem?.approval
    const state = autoJudgeStateOf(approval)
    if (!approval || !state) return null
    const phase = selectedItem?.autoPhase
    const grant = grants.find((row) => row.id === state.grantId) ?? null
    if (phase === 'waiting' || phase === 'due') {
      return {
        kind: 'waiting',
        remainingLabel: formatAutoJudgeRemaining(autoJudgeRemaining(approval, now)),
        confidenceLabel: AUTO_JUDGE_CONFIDENCE_LABEL[state.confidence],
      }
    }
    if (phase === 'auto-approved') {
      return {
        kind: 'approved',
        confidenceLabel: AUTO_JUDGE_CONFIDENCE_LABEL[state.confidence],
        grantTitle: grant ? describeGrantAction(grant) : null,
        grantDate: grant?.createdAt ? formatTime(String(grant.createdAt)) : null,
        grantRevoked: !!grant?.revokedAt,
        decidedAt: formatTime(state.decidedAt),
        reviewed: !!state.reviewedAt,
        canRevoke: !!grant && !grant.revokedAt,
      }
    }
    return null
  }, [grants, now, selectedItem])

  const isPendingApproval = selectedItem?.kind === 'approval' && selectedItem.status === 'pending' && !!selectedItem.approval
  const isPendingAuthRequired = !!selectedItem && isActionableInboxItem(selectedItem) && selectedItem.category === 'auth_required'
  const isResolvedAuthRequired = selectedItem?.category === 'auth_required' && selectedItem.status === 'resolved'
  const isPendingInputRequest = selectedItem?.kind === 'input_request'
    && !!selectedItem.inputRequest
    && isPendingInputRequestStatus(selectedItem.status)
  const inputRequestForm = useMemo(() => {
    const inputRequest = selectedItem?.inputRequest
    if (!inputRequest) return null
    return {
      prompt: inputRequest.prompt,
      context: inputRequest.context ?? null,
      options: parseInputRequestOptions(inputRequest.inputOptions),
      secret: isSecretInputRequest(inputRequest.requestKind),
      // Secrets never go into the conversation, and steering needs the original topic.
      canSteer: !isSecretInputRequest(inputRequest.requestKind) && Boolean(selectedItem?.chatId && selectedItem?.threadId),
      response: inputRequest.status === 'resolved' && !isSecretInputRequest(inputRequest.requestKind)
        ? inputRequest.response ?? null
        : null,
    }
  }, [selectedItem])
  const isMutating = resolveApproval.isPending || takeOver.isPending || markReviewed.isPending || revokeGrant.isPending || resolveInputRequest.isPending || isSteering

  const approvalMeta = useMemo(() => {
    if (!selectedItem?.approval) return null
    return {
      createdAt: formatTime(String(selectedItem.approval.createdAt ?? '')),
      resolvedAt: formatTime(String(selectedItem.approval.resolvedAt ?? '')),
    }
  }, [selectedItem])
  const auditPresentation = useMemo(
    () => (selectedItem?.audit ? buildAuditPresentation(selectedItem.audit, resolvedAuthIndex, selectedItem.approval) : null),
    [resolvedAuthIndex, selectedItem],
  )
  const statusLabel = formatInboxStatusLabel(selectedItem?.status)

  const resolveWith = async (decision: 'approved' | 'rejected', withGrant: boolean) => {
    if (!selectedItem?.approval) return
    try {
      await resolveApproval.mutateAsync({
        approval: selectedItem.approval,
        decision,
        reason,
        ...(withGrant && decision === 'approved' ? { grant: { highImpactConfirmed: impactKind !== null } } : {}),
      })
      setReason('')
      setGrantChecked(false)
      setConfirmGrantOpen(false)
    } catch {
      // React Query owns the displayed error state; keep the event handler from
      // surfacing expected approval failures as unhandled promise rejections.
    }
  }

  const handleResolve = async (decision: 'approved' | 'rejected') => {
    // Granting spend / delete / send needs one more confirmation first.
    if (decision === 'approved' && grantChecked && impactKind) {
      setConfirmGrantOpen(true)
      return
    }
    await resolveWith(decision, grantChecked)
  }
  const handleConfirmGrant = () => resolveWith('approved', true)

  const handleTakeOver = () => {
    if (selectedItem?.approval) takeOver.mutate(selectedItem.approval)
  }
  const handleMarkReviewed = () => {
    if (selectedItem?.approval) markReviewed.mutate(selectedItem.approval)
  }
  const handleRevokeGrant = () => {
    const grantId = autoJudgeStateOf(selectedItem?.approval)?.grantId
    const grant = grants.find((row) => row.id === grantId)
    if (grant) revokeGrant.mutate(grant)
  }

  /**
   * `queue` leaves the answer on the request for the run to pick up when it next
   * checks the inbox. `steer` also posts it into the original topic right away.
   */
  const handleSubmitInput = async (mode: 'queue' | 'steer' = 'queue') => {
    const item = selectedItem
    if (!item?.inputRequest || !inputAnswer.trim()) return
    const answer = inputAnswer
    setSteerError(null)
    try {
      await resolveInputRequest.mutateAsync({
        inputRequest: item.inputRequest,
        response: answer,
      })
    } catch {
      // React Query owns the displayed error state; the typed answer stays in place.
      return
    }
    setInputAnswer('')
    if (mode !== 'steer' || !inputRequestForm?.canSteer || !item.chatId || !item.threadId) return
    const webId = session.info.webId
    if (!webId) {
      setSteerError('回答已排队，但没能发进会话：登录状态还没准备好。')
      return
    }
    setIsSteering(true)
    try {
      await chatOps.createUserMessage(
        item.chatId,
        item.threadId,
        formatInputSteerMessage(item.inputRequest.prompt, answer),
        webId,
      )
    } catch {
      setSteerError('回答已排队，但没能发进会话。它下次检查收件箱时仍会读到。')
    } finally {
      setIsSteering(false)
    }
  }

  const handleOpenConversation = () => {
    if (!selectedItem?.chatId) return
    selectChat(selectedItem.chatId)
    if (selectedItem.threadId) {
      selectThread(selectedItem.threadId)
    }
    navigate({ to: '/$microAppId', params: { microAppId: 'chat' } })
  }

  const auditTime = selectedItem?.audit ? formatTime(String(selectedItem.audit.createdAt ?? '')) : null

  return {
    selectedItem,
    isLoading,
    reason,
    setReason,
    isPendingApproval,
    isPendingAuthRequired,
    isResolvedAuthRequired,
    isPendingInputRequest,
    inputRequestForm,
    inputAnswer,
    setInputAnswer,
    handleSubmitInput,
    isMutating,
    approvalMeta,
    auditPresentation,
    auditTime,
    statusLabel,
    error: resolveApproval.error ?? resolveInputRequest.error,
    steerError,
    handleResolve,
    grantChecked,
    setGrantChecked,
    impactLabel: impactKind ? HIGH_IMPACT_LABEL[impactKind] : null,
    confirmGrantOpen,
    setConfirmGrantOpen,
    handleConfirmGrant,
    autoDetail,
    handleTakeOver,
    handleMarkReviewed,
    handleRevokeGrant,
    handleOpenConversation,
    selectItem,
    formatAuditActorRole,
  }
}
