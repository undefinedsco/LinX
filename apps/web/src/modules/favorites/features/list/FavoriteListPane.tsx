import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { FavoriteList } from '../../ui/FavoriteList'
import { useFavoriteListPaneController } from './useFavoriteListPaneController'

export function FavoriteListPane(_props: MicroAppPaneProps) {
  const controller = useFavoriteListPaneController()

  return <FavoriteList {...controller} />
}

export default FavoriteListPane
