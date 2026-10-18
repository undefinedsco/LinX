import { useEffect, useMemo, useState } from 'react'
import type { MicroAppLayoutConfig, MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { useFavoriteStore } from '../../app/store'
import { useFavoriteInit, useFavoriteList } from '../../data/collections'
import { countFavoriteGroups } from '../../domain/groups'
import { FavoriteGroups } from '../../ui/FavoriteGroups'
import { FavoriteContentPane } from '../detail/FavoriteContentPane'
import { FavoriteListPane } from '../list/FavoriteListPane'
import { useFavoriteListPaneController } from '../list/useFavoriteListPaneController'
import { FavoriteList } from '../../ui/FavoriteList'
import { EmptyState, FavoriteDetail } from '../../ui/FavoriteDetail'
import { useFavoriteContentPaneController } from '../detail/useFavoriteContentPaneController'

/**
 * K7 three panes inside the shell's list + content + right-sidebar layout:
 * left = type groups (ListPane), middle = the list (ContentPane), right = the
 * preview (right sidebar, see {@link FavoritesLayoutConfigBridge}). Narrow
 * windows keep the one-level-at-a-time flow of FavoriteListPane / FavoriteContentPane.
 */
export function FavoriteGroupsPane(props: MicroAppPaneProps) {
  if (props.compact) return <FavoriteListPane {...props} />
  return <FavoriteGroupsColumn />
}

function FavoriteGroupsColumn() {
  useFavoriteInit()
  const searchText = useFavoriteStore((s) => s.searchText)
  const setSearchText = useFavoriteStore((s) => s.setSearchText)
  const group = useFavoriteStore((s) => s.group) ?? 'all'
  const setGroup = useFavoriteStore((s) => s.setGroup)
  const { data: favorites } = useFavoriteList({ search: searchText || undefined })
  const counts = useMemo(() => countFavoriteGroups(favorites ?? []), [favorites])
  return (
    <FavoriteGroups
      searchText={searchText}
      onSearchChange={setSearchText}
      group={group}
      counts={counts}
      onGroupChange={setGroup}
    />
  )
}

export function FavoriteItemsPane(props: MicroAppPaneProps) {
  if (props.compact) return <FavoriteContentPane {...props} />
  return <FavoriteItemsColumn />
}

function FavoriteItemsColumn() {
  const controller = useFavoriteListPaneController()
  return (
    <FavoriteList
      {...controller}
      showSearch={false}
      counts={undefined}
      onGroupChange={undefined}
    />
  )
}

/** Right column: the selected favorite. */
export function FavoritePreviewPane() {
  const { favorite, sourceStatus, onRemove, onOpenSource } = useFavoriteContentPaneController()
  if (!favorite) return <EmptyState />
  return <FavoriteDetail favorite={favorite} sourceStatus={sourceStatus} onRemove={onRemove} onOpenSource={onOpenSource} />
}

function useIsCompact(): boolean {
  const query = '(max-width: 699px)'
  const read = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches
  const [compact, setCompact] = useState(read)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const media = window.matchMedia(query)
    const update = () => setCompact(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return compact
}

export function FavoritesLayoutConfigBridge({
  onConfigChange,
}: {
  onConfigChange: (config: MicroAppLayoutConfig | undefined) => void
}) {
  const selectedFavoriteId = useFavoriteStore((s) => s.selectedFavoriteId)
  const previewOpen = useFavoriteStore((s) => s.previewOpen)
  const setPreviewOpen = useFavoriteStore((s) => s.setPreviewOpen)
  const compact = useIsCompact()

  const config = useMemo<MicroAppLayoutConfig | undefined>(() => {
    if (compact) return undefined
    return {
      listPanel: { defaultWidth: 200, minWidth: 180, maxWidth: 260 },
      rightSidebar: previewOpen && selectedFavoriteId
        ? <FavoritePreviewPane />
        : null,
      rightSidebarWidth: 380,
      rightSidebarToggle: selectedFavoriteId
        ? { label: '预览', open: previewOpen, onToggle: () => setPreviewOpen(!previewOpen) }
        : undefined,
    }
  }, [compact, previewOpen, selectedFavoriteId, setPreviewOpen])

  useEffect(() => {
    onConfigChange(config)
  }, [config, onConfigChange])

  return null
}

export default FavoritesLayoutConfigBridge
