import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { useSettingsStore } from '../../app/store'
import { SETTINGS_SECTIONS } from '../../domain/section-model'
import { SettingsNavigation } from '../../ui/SettingsNavigation'

export function SettingsListPane({}: MicroAppPaneProps) {
  const selectedSection = useSettingsStore((state) => state.selectedSection)
  const selectSection = useSettingsStore((state) => state.selectSection)

  return (
    <div className="flex h-full flex-col bg-layout-list-item">
      <div className="border-b border-border/40 px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">设置</h2>
        <p className="mt-1 text-xs text-muted-foreground">桌面首发面可见的真实配置入口。</p>
      </div>
      <SettingsNavigation items={SETTINGS_SECTIONS} selectedId={selectedSection} onSelect={selectSection} />
    </div>
  )
}
