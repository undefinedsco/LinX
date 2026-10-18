export type SettingsSectionId = 'space' | 'general' | 'models' | 'runtime' | 'network' | 'updates' | 'about'

export type SettingsSectionIcon = 'space' | 'palette' | 'models' | 'runtime' | 'network' | 'updates' | 'about'

/** S7: 空间与服务 / 通用 / 模型连接, then 这台电脑, then 关于. */
export type SettingsSectionGroup = 'main' | 'device' | 'about'

export interface SettingsSectionItem {
  id: SettingsSectionId
  title: string
  icon: SettingsSectionIcon
  group: SettingsSectionGroup
}

export const SETTINGS_SECTIONS: readonly SettingsSectionItem[] = [
  { id: 'space', title: '空间与服务', icon: 'space', group: 'main' },
  { id: 'general', title: '通用', icon: 'palette', group: 'main' },
  { id: 'models', title: '模型连接', icon: 'models', group: 'main' },
  // 原“运行环境”“本地网络”
  { id: 'runtime', title: '本机服务', icon: 'runtime', group: 'device' },
  { id: 'network', title: '外部访问', icon: 'network', group: 'device' },
  { id: 'updates', title: '版本更新', icon: 'updates', group: 'device' },
  { id: 'about', title: '关于 LinX', icon: 'about', group: 'about' },
]

export const SETTINGS_GROUP_LABELS: Partial<Record<SettingsSectionGroup, string>> = {
  device: '这台电脑',
}

export function settingsSectionTitle(id: SettingsSectionId): string {
  return SETTINGS_SECTIONS.find((section) => section.id === id)?.title ?? '设置'
}
