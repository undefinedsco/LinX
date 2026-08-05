import type { AppletPaneProps } from '@/modules/layout/applet-registry'
import { FavoriteList } from '../../ui/FavoriteList'
import { useFavoriteListPaneController } from './useFavoriteListPaneController'

export function FavoriteListPane(_props: AppletPaneProps) {
  const controller = useFavoriteListPaneController()

  return <FavoriteList {...controller} />
}

export default FavoriteListPane
