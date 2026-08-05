import { lazy, type ComponentType, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  MessageSquare,
  Bell,
  Users,
  FolderOpen,
  Star,
  Settings as SettingsIcon,
  Bot,
} from 'lucide-react'

export const appletIds = [
  'chat',
  'inbox',
  'contacts',
  'files',
  'favorites',
  'settings',
  'ai-connections',
] as const

export type AppletId = (typeof appletIds)[number]
export type ThemeMode = 'light' | 'dark'
export type AppletNavigationIntent = 'default' | 'chat-files'

export interface AppletPaneProps {
  theme: ThemeMode
  compact?: boolean
  compactNavigation?: ReactNode
}

export type AppletListPane = ComponentType<AppletPaneProps>
export type AppletContentPane = ComponentType<AppletPaneProps>

export interface AppletHeaderMeta {
  moduleTitle: string
  moduleSubtitle: string
  itemTitle?: string
  itemSubtitle?: string
}

export interface AppletLayoutConfig {
  header?: ReactNode
  mainTitle?: ReactNode
  subtitle?: string
  topActions?: ReactNode
  listPanel?: {
    defaultWidth?: number
    minWidth?: number
    maxWidth?: number
  }
  rightSidebar?: ReactNode
  rightSidebarWidth?: number
  rightSidebarToggle?: {
    open: boolean
    onToggle: () => void
  }
  hideIcon?: boolean
  hideHeader?: boolean
}

export interface AppletLayoutConfigBridgeProps {
  onConfigChange: (config: AppletLayoutConfig | undefined) => void
}

export type AppletLayoutConfigBridge = ComponentType<AppletLayoutConfigBridgeProps>

export interface AppletDefinition {
  id: AppletId
  label: string
  icon: LucideIcon
  header: AppletHeaderMeta
  ListPane: AppletListPane
  ContentPane: AppletContentPane
  LayoutConfigBridge?: AppletLayoutConfigBridge
  hidePrimaryRailOnCompact?: boolean
  hideContentHeaderOnCompact?: boolean
}

function lazyPane<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
): T {
  return lazy(loader) as unknown as T
}

function lazyBridge<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
): T {
  return lazy(loader) as unknown as T
}

const ChatListPane = lazyPane(() =>
  import('@/modules/chat/components/ChatListPane').then((mod) => ({ default: mod.ChatListPane })),
)
const ChatContentPane = lazyPane(() =>
  import('@/modules/chat/components/ChatContentPane').then((mod) => ({ default: mod.ChatContentPane })),
)
const InboxListPane = lazyPane(() =>
  import('@/modules/inbox/components/InboxListPane').then((mod) => ({ default: mod.InboxListPane })),
)
const InboxContentPane = lazyPane(() =>
  import('@/modules/inbox/components/InboxContentPane').then((mod) => ({ default: mod.InboxContentPane })),
)
const ContactListPane = lazyPane(() =>
  import('@/modules/contacts/features/list/ContactListPane').then((mod) => ({ default: mod.ContactListPane })),
)
const ContactDetailPane = lazyPane(() =>
  import('@/modules/contacts/features/detail/ContactDetailPane').then((mod) => ({ default: mod.ContactDetailPane })),
)
const FavoriteListPane = lazyPane(() =>
  import('@/modules/favorites/components/FavoriteListPane').then((mod) => ({ default: mod.FavoriteListPane })),
)
const FavoriteContentPane = lazyPane(() =>
  import('@/modules/favorites/components/FavoriteContentPane').then((mod) => ({ default: mod.FavoriteContentPane })),
)
const FilesListPane = lazyPane(() =>
  import('@/modules/files/features/tree/FilesTreePane').then((mod) => ({ default: mod.FilesTreePane })),
)
const FilesWorkspacePane = lazyPane(() =>
  import('@/modules/files/app/FilesWorkspacePane').then((mod) => ({ default: mod.FilesWorkspacePane })),
)
const AiConnectionsListPane = lazyPane(() =>
  import('@/modules/ai-connections/features/list/AiConnectionsListPane').then((mod) => ({ default: mod.AiConnectionsListPane })),
)
const AiConnectionsContentPane = lazyPane(() =>
  import('@/modules/ai-connections/features/detail/AiConnectionsContentPane').then((mod) => ({ default: mod.AiConnectionsContentPane })),
)
const SettingsListPane = lazyPane(() =>
  import('@/modules/settings/features/list/SettingsListPane').then((mod) => ({ default: mod.SettingsListPane })),
)
const SettingsContentPane = lazyPane(() =>
  import('@/modules/settings/features/content/SettingsContentPane').then((mod) => ({ default: mod.SettingsContentPane })),
)
const ChatLayoutConfigBridge = lazyBridge(() =>
  import('@/modules/chat/layout/ChatLayoutConfigBridge').then((mod) => ({ default: mod.ChatLayoutConfigBridge })),
)
const AiConnectionsLayoutConfigBridge = lazyBridge(() =>
  import('@/modules/ai-connections/app/AiConnectionsLayoutConfigBridge').then((mod) => ({ default: mod.AiConnectionsLayoutConfigBridge })),
)
const FilesLayoutConfigBridge = lazyBridge(() =>
  import('@/modules/files/app/FilesLayoutConfigBridge').then((mod) => ({ default: mod.FilesLayoutConfigBridge })),
)

export const appletRegistry: Record<AppletId, AppletDefinition> = {
  chat: {
    id: 'chat',
    label: '聊天',
    icon: MessageSquare,
    header: {
      moduleTitle: '聊天',
      moduleSubtitle: '与 AI 助手对话',
      itemTitle: 'AI 助手',
      itemSubtitle: '共享记忆实时同步',
    },
    ListPane: ChatListPane,
    ContentPane: ChatContentPane,
    LayoutConfigBridge: ChatLayoutConfigBridge,
  },
  inbox: {
    id: 'inbox',
    label: '收件箱',
    icon: Bell,
    header: {
      moduleTitle: '收件箱',
      moduleSubtitle: '授权与审计统一入口',
      itemTitle: '事件详情',
      itemSubtitle: 'Approval & Audit',
    },
    ListPane: InboxListPane,
    ContentPane: InboxContentPane,
  },
  contacts: {
    id: 'contacts',
    label: '联系人',
    icon: Users,
    header: {
      moduleTitle: '联系人',
      moduleSubtitle: '管理 Solid Pod 联系人',
      itemTitle: '联系人详情',
      itemSubtitle: 'Person & Agent',
    },
    ListPane: ContactListPane,
    ContentPane: ContactDetailPane,
  },
  files: {
    id: 'files',
    label: '文件',
    icon: FolderOpen,
    header: {
      moduleTitle: '文件',
      moduleSubtitle: 'Pod 资源与文件夹',
      itemTitle: '文件预览',
      itemSubtitle: '打开、复制、收藏',
    },
    ListPane: FilesListPane,
    ContentPane: FilesWorkspacePane,
    LayoutConfigBridge: FilesLayoutConfigBridge,
    hidePrimaryRailOnCompact: true,
    hideContentHeaderOnCompact: true,
  },
  favorites: {
    id: 'favorites',
    label: '收藏',
    icon: Star,
    header: {
      moduleTitle: '收藏',
      moduleSubtitle: '快速访问常用资源',
      itemTitle: '收藏内容',
      itemSubtitle: '跨模块标星项汇总',
    },
    ListPane: FavoriteListPane,
    ContentPane: FavoriteContentPane,
  },
  settings: {
    id: 'settings',
    label: '设置',
    icon: SettingsIcon,
    header: {
      moduleTitle: '设置',
      moduleSubtitle: '应用配置选项',
      itemTitle: '设置详情',
      itemSubtitle: '主题、实验功能等',
    },
    ListPane: SettingsListPane,
    ContentPane: SettingsContentPane,
  },
  'ai-connections': {
    id: 'ai-connections',
    label: 'AI 连接',
    icon: Bot, // Using Bot icon for AI Model Services
    header: {
      moduleTitle: 'AI 连接',
      moduleSubtitle: '配置 AI 提供商及模型',
      itemTitle: '提供商详情',
      itemSubtitle: 'API Key & Model Management',
    },
    ListPane: AiConnectionsListPane,
    ContentPane: AiConnectionsContentPane,
    LayoutConfigBridge: AiConnectionsLayoutConfigBridge,
  },
}

export const defaultAppletId: AppletId = 'chat'

export const isValidAppletId = (value: string | undefined): value is AppletId =>
  Boolean(value && appletIds.includes(value as AppletId))
