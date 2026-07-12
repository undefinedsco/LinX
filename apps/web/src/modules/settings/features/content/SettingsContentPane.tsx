import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { SettingsContentView } from '../../ui/SettingsContentView'
import { LocalNetworkSettingsCard } from '../network/LocalNetworkSettingsCard'
import { useSettingsContentPaneController } from './useSettingsContentPaneController'

export function SettingsContentPane({}: MicroAppPaneProps) {
  const controller = useSettingsContentPaneController()
  return <SettingsContentView {...controller} networkContent={<LocalNetworkSettingsCard />} />
}
