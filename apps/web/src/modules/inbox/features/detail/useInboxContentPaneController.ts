import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useChatStore } from '@/modules/chat/store'
import { useInboxStore } from '../../app/store'
import { useInboxItems, useResolveInboxApproval } from '../../data/collections'
import { buildAuditPresentation, createResolvedAuthTimestampsIndex, formatAuditActorRole, formatInboxStatusLabel } from '../../domain/presentation'
import { isActionableInboxItem } from '../../domain/utils'

function formatTime(value: string | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN')
}

export function useInboxContentPaneController() {
  const [reason, setReason] = useState('')
  const navigate = useNavigate()
  const selectChat = useChatStore((state) => state.selectChat)
  const selectThread = useChatStore((state) => state.selectThread)
  const selectedItemId = useInboxStore((state) => state.selectedItemId)
  const selectItem = useInboxStore((state) => state.selectItem)
  const { data: items = [], isLoading } = useInboxItems()
  const resolveApproval = useResolveInboxApproval()
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null
  const resolvedAuthIndex = useMemo(
    () => createResolvedAuthTimestampsIndex(items.flatMap((item) => (item.audit ? [item.audit] : []))),
    [items],
  )

  const isPendingApproval = selectedItem?.kind === 'approval' && selectedItem.status === 'pending' && !!selectedItem.approval
  const isPendingAuthRequired = !!selectedItem && isActionableInboxItem(selectedItem) && selectedItem.category === 'auth_required'
  const isResolvedAuthRequired = selectedItem?.category === 'auth_required' && selectedItem.status === 'resolved'
  const isMutating = resolveApproval.isPending

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

  const handleResolve = async (decision: 'approved' | 'rejected') => {
    if (!selectedItem?.approval) return
    try {
      await resolveApproval.mutateAsync({
        approval: selectedItem.approval,
        decision,
        reason,
      })
      setReason('')
    } catch {
      // React Query owns the displayed error state; keep the event handler from
      // surfacing expected approval failures as unhandled promise rejections.
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
    isMutating,
    approvalMeta,
    auditPresentation,
    auditTime,
    statusLabel,
    error: resolveApproval.error,
    handleResolve,
    handleOpenConversation,
    selectItem,
    formatAuditActorRole,
  }
}
