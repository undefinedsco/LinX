import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useInboxStore } from '../../app/store'
import { useInboxItems, useInboxSummary, useResolveInboxApproval } from '../../data/collections'
import { useAutoJudgeActions, useInboxAutoJudgeSweep } from '../../data/auto-judge'
import {
  AUTO_JUDGE_CONFIDENCE_LABEL,
  autoJudgeRemaining,
  autoJudgeStateOf,
  formatAutoJudgeRemaining,
} from '../../domain/auto-judge-view'
import type { InboxAutoWaitingView, InboxListItemView } from '../../domain/inbox-item'
import { isAutoWaitingInboxItem } from '../../domain/utils'

function formatTimeLabel(value: string) {
  if (!value) return '刚刚'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function useInboxListPaneController() {
  const filter = useInboxStore((state) => state.filter)
  const setFilter = useInboxStore((state) => state.setFilter)
  const selectedItemId = useInboxStore((state) => state.selectedItemId)
  const selectItem = useInboxStore((state) => state.selectItem)
  const { data: items = [], isLoading } = useInboxItems(filter)
  const summary = useInboxSummary()
  const { data: allItems = [] } = useInboxItems('all')
  const resolveApproval = useResolveInboxApproval()
  const { takeOver } = useAutoJudgeActions()
  const [now, setNow] = useState(() => new Date())

  useInboxAutoJudgeSweep()
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const autoWaiting = useMemo<InboxAutoWaitingView[]>(
    () => allItems.filter(isAutoWaitingInboxItem).flatMap((item) => {
      const state = autoJudgeStateOf(item.approval)
      if (!item.approval || !state) return []
      return [{
        id: item.id,
        title: item.title,
        detail: item.approval.target.split('#')[0]?.split('/').filter(Boolean).pop() ?? '',
        remainingLabel: formatAutoJudgeRemaining(autoJudgeRemaining(item.approval, now)),
        confidenceLabel: AUTO_JUDGE_CONFIDENCE_LABEL[state.confidence],
      }]
    }),
    [allItems, now],
  )
  const decideWaiting = useCallback((id: string, decision: 'approved' | 'rejected') => {
    const approval = allItems.find((item) => item.id === id)?.approval
    if (approval) resolveApproval.mutate({ approval, decision })
  }, [allItems, resolveApproval])
  const takeOverWaiting = useCallback((id: string) => {
    const approval = allItems.find((item) => item.id === id)?.approval
    if (approval) takeOver.mutate(approval)
  }, [allItems, takeOver])

  useEffect(() => {
    if (items.length === 0) {
      if (selectedItemId) selectItem(null)
      return
    }

    if (!selectedItemId || !items.some((item) => item.id === selectedItemId)) {
      selectItem(items[0].id)
    }
  }, [items, selectItem, selectedItemId])

  const listItems = useMemo<InboxListItemView[]>(
    () => items.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      formattedTime: formatTimeLabel(item.timestamp),
      kind: item.kind,
      category: item.category,
      status: item.status,
      approvalTarget: item.approval?.target ?? null,
      autoApproved: item.autoPhase === 'auto-approved',
    })),
    [items],
  )

  const selectedIndex = listItems.findIndex((item) => item.id === selectedItemId)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const registerItemRef = useCallback((index: number, node: HTMLButtonElement | null) => {
    optionRefs.current[index] = node
  }, [])
  const onItemKeyDown = useCallback((index: number, event: KeyboardEvent<HTMLButtonElement>) => {
    let nextIndex: number
    if (event.key === 'ArrowDown') nextIndex = Math.min(index + 1, listItems.length - 1)
    else if (event.key === 'ArrowUp') nextIndex = Math.max(index - 1, 0)
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = listItems.length - 1
    else return
    event.preventDefault()
    const target = listItems[nextIndex]
    if (!target) return
    selectItem(target.id)
    optionRefs.current[nextIndex]?.focus()
  }, [listItems, selectItem])

  return {
    filter,
    setFilter,
    selectedItemId,
    selectItem,
    items: listItems,
    isLoading,
    summary,
    autoWaiting,
    onApproveWaiting: (id: string) => decideWaiting(id, 'approved'),
    onRejectWaiting: (id: string) => decideWaiting(id, 'rejected'),
    onTakeOverWaiting: takeOverWaiting,
    selectedIndex,
    onItemKeyDown,
    registerItemRef,
  }
}
