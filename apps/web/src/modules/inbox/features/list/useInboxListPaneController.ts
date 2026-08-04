import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import { useInboxStore } from '../../app/store'
import { useInboxItems, useInboxSummary } from '../../data/collections'
import type { InboxListItemView } from '../../domain/inbox-item'

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
    selectedIndex,
    onItemKeyDown,
    registerItemRef,
  }
}
