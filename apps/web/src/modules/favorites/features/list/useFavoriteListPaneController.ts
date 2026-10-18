import { useCallback, useMemo, useRef, type KeyboardEvent } from 'react'
import { useFavoriteStore } from '../../app/store'
import { useFavoriteInit, useFavoriteList } from '../../data/collections'
import { countFavoriteGroups, favoriteGroupOf } from '../../domain/groups'
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
  const group = useFavoriteStore((s) => s.group) ?? 'all'
  const setGroup = useFavoriteStore((s) => s.setGroup)
  const optionRefs = useRef<Array<HTMLDivElement | null>>([])

  const { data: allFavorites, isLoading } = useFavoriteList({
    search: searchText || undefined,
  })

  const counts = useMemo(() => countFavoriteGroups(allFavorites ?? []), [allFavorites])

  const favorites = useMemo(
    () => (group === 'all' ? (allFavorites ?? []) : (allFavorites ?? []).filter((fav) => favoriteGroupOf(fav) === group)),
    [allFavorites, group],
  )

  const selectedIndex = favorites.findIndex((fav) => fav.id === selectedFavoriteId)

  const items = useMemo<FavoriteListItem[]>(
    () => favorites.map((fav) => ({
      id: fav.id,
      title: fav.title,
      snapshotContent: fav.snapshotContent,
      snapshotAuthor: fav.snapshotAuthor,
      formattedDate: formatFavoriteDate(fav.favoredAt),
      kindLabel: group === 'all' ? GROUP_LABEL[favoriteGroupOf(fav)] : undefined,
    })),
    [favorites, group],
  )

  const registerItemRef = useCallback((index: number, node: HTMLDivElement | null) => {
    optionRefs.current[index] = node
  }, [])

  const onItemKeyDown = useCallback((index: number, event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      select(favorites[index].id)
      return
    }
    let nextIndex: number
    if (event.key === 'ArrowDown') nextIndex = Math.min(index + 1, favorites.length - 1)
    else if (event.key === 'ArrowUp') nextIndex = Math.max(index - 1, 0)
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = favorites.length - 1
    else return
    event.preventDefault()
    select(favorites[nextIndex].id)
    optionRefs.current[nextIndex]?.focus()
  }, [favorites, select])

  return {
    searchText,
    onSearchChange: setSearchText,
    items,
    isLoading,
    selectedFavoriteId,
    selectedIndex,
    onSelect: select,
    onItemKeyDown,
    registerItemRef,
    group,
    counts,
    onGroupChange: setGroup ?? (() => {}),
    hasAnyFavorite: (allFavorites ?? []).length > 0 || Boolean(searchText),
  }
}

const GROUP_LABEL = {
  messages: '消息',
  chats: '会话',
  files: '文件',
  cards: '卡片',
  contacts: '联系人',
} as const
