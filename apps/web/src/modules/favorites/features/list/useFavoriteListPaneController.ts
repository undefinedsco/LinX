import { useCallback, useMemo, useRef, type KeyboardEvent } from 'react'
import { useFavoriteStore } from '../../app/store'
import { useFavoriteInit, useFavoriteList } from '../../data/collections'
import type { FavoriteListItem } from '../../ui/FavoriteList'

function formatFavoriteDate(favoredAt?: Date | null): string {
  if (!favoredAt) return ''
  const d = favoredAt instanceof Date ? favoredAt : new Date(favoredAt as any)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

export function useFavoriteListPaneController() {
  useFavoriteInit()

  const searchText = useFavoriteStore((s) => s.searchText)
  const setSearchText = useFavoriteStore((s) => s.setSearchText)
  const selectedFavoriteId = useFavoriteStore((s) => s.selectedFavoriteId)
  const select = useFavoriteStore((s) => s.select)
  const optionRefs = useRef<Array<HTMLDivElement | null>>([])

  const { data: favorites, isLoading, error, refetch } = useFavoriteList({
    search: searchText || undefined,
  })

  const selectedIndex = favorites?.findIndex((fav) => fav.id === selectedFavoriteId) ?? -1

  const items = useMemo<FavoriteListItem[]>(
    () => (favorites ?? []).map((fav) => ({
      id: fav.id,
      title: fav.title,
      snapshotContent: fav.snapshotContent,
      snapshotAuthor: fav.snapshotAuthor,
      formattedDate: formatFavoriteDate(fav.favoredAt),
    })),
    [favorites],
  )

  const registerItemRef = useCallback((index: number, node: HTMLDivElement | null) => {
    optionRefs.current[index] = node
  }, [])

  const onItemKeyDown = useCallback((index: number, event: KeyboardEvent<HTMLDivElement>) => {
    const list = favorites ?? []
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      select(list[index].id)
      return
    }
    let nextIndex: number
    if (event.key === 'ArrowDown') nextIndex = Math.min(index + 1, list.length - 1)
    else if (event.key === 'ArrowUp') nextIndex = Math.max(index - 1, 0)
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = list.length - 1
    else return
    event.preventDefault()
    select(list[nextIndex].id)
    optionRefs.current[nextIndex]?.focus()
  }, [favorites, select])

  return {
    searchText,
    onSearchChange: setSearchText,
    items,
    isLoading,
    error,
    refetch,
    selectedFavoriteId,
    selectedIndex,
    onSelect: select,
    onItemKeyDown,
    registerItemRef,
  }
}
