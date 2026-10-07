import { ChevronLeft } from 'lucide-react'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { Button } from '@/components/ui/button'
import { useFavoriteStore } from '../../app/store'
import { EmptyState, FavoriteDetail } from '../../ui/FavoriteDetail'
import { FavoriteListPane } from '../list/FavoriteListPane'
import { useFavoriteContentPaneController } from './useFavoriteContentPaneController'

function FavoriteContentEnabled() {
  const { favorite, onRemove, onOpenSource } = useFavoriteContentPaneController()

  if (!favorite) return <EmptyState />

  return (
    <FavoriteDetail
      favorite={favorite}
      onRemove={onRemove}
      onOpenSource={onOpenSource}
    />
  )
}

export function FavoriteContentPane({ compact = false, theme }: MicroAppPaneProps) {
  const selectedFavoriteId = useFavoriteStore((s) => s.selectedFavoriteId)
  const select = useFavoriteStore((s) => s.select)

  if (!compact) {
    return <FavoriteContentEnabled />
  }

  if (!selectedFavoriteId) {
    return <FavoriteListPane theme={theme} />
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center border-b border-border/30 px-2 py-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2 text-xs"
          onClick={() => select(null)}
          aria-label="返回收藏列表"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          列表
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <FavoriteContentEnabled />
      </div>
    </div>
  )
}

export default FavoriteContentPane
