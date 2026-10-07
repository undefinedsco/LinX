export type SettingsSectionId = 'general' | 'updates' | 'runtime' | 'network'

export type SettingsSectionIcon = 'palette' | 'updates' | 'runtime' | 'network'

export interface SettingsSectionItem {
  id: SettingsSectionId
  title: string
  description: string
  icon: SettingsSectionIcon
}

export const SETTINGS_SECTIONS: readonly SettingsSectionItem[] = [
  { id: 'general', title: '通用', description: '主题与常用入口', icon: 'palette' },
  { id: 'updates', title: '版本更新', description: '检查新版本与发布页', icon: 'updates' },
  { id: 'runtime', title: '运行环境', description: '当前壳与本地服务', icon: 'runtime' },
  { id: 'network', title: '本地网络', description: '域名、隧道与可达性', icon: 'network' },
]
