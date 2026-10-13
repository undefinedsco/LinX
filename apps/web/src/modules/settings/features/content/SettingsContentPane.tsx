import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { SettingsContentView } from '../../ui/SettingsContentView'
import { LocalNetworkSettingsCard } from '../network/LocalNetworkSettingsCard'
import { SpaceServicesSection } from '../space/SpaceServicesSection'
import { useSettingsContentPaneController } from './useSettingsContentPaneController'

export function SettingsContentPane({ compact }: MicroAppPaneProps) {
  const controller = useSettingsContentPaneController({ compact })
  return (
    <SettingsContentView
      {...controller}
      networkContent={<LocalNetworkSettingsCard />}
      spaceContent={<SpaceServicesSection />}
    />
  )
}
