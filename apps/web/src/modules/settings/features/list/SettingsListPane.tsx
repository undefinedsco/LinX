import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { useSettingsStore } from '../../app/store'
import { SETTINGS_SECTIONS } from '../../domain/section-model'
import { SettingsNavigation } from '../../ui/SettingsNavigation'
import { useSettingsNavigationHints } from './useSettingsNavigationHints'

export function SettingsListPane({}: MicroAppPaneProps) {
  const selectedSection = useSettingsStore((state) => state.selectedSection)
  const selectSection = useSettingsStore((state) => state.selectSection)
  const hints = useSettingsNavigationHints()

  return (
    <div className="flex h-full flex-col bg-layout-list-item">
      <div className="h-12 flex items-center px-3 border-b border-border bg-layout-list-header shrink-0">
        <h2 className="truncate text-sm font-semibold text-foreground">设置</h2>
      </div>
      <SettingsNavigation items={SETTINGS_SECTIONS} selectedId={selectedSection} onSelect={selectSection} trailing={hints} />
    </div>
  )
}
