import { LocalNetworkSettingsCard as LocalNetworkSettingsCardUI } from '../../ui/LocalNetworkSettingsCard'
import { useLocalNetworkSettingsController } from './useLocalNetworkSettingsController'

export function LocalNetworkSettingsCard() {
  const controller = useLocalNetworkSettingsController()
  return <LocalNetworkSettingsCardUI {...controller} />
}
