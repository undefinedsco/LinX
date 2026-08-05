import type { AppletPaneProps } from '@/modules/layout/applet-registry'
import { SettingsContentView } from '../../ui/SettingsContentView'
import { LocalNetworkSettingsCard } from '../network/LocalNetworkSettingsCard'
import { useSettingsContentPaneController } from './useSettingsContentPaneController'

export function SettingsContentPane({}: AppletPaneProps) {
  const controller = useSettingsContentPaneController()
  return <SettingsContentView {...controller} networkContent={<LocalNetworkSettingsCard />} />
}
