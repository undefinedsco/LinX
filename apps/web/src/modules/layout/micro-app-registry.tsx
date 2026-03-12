import { lazy, useEffect, type ComponentType, type ReactNode } from 'react'
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
import { PlaceholderListPane, PlaceholderContentPane } from './placeholders'

export const microAppIds = [
  'chat',
  'inbox',
  'contacts',
  'files',
  'favorites',
  'settings',
  'model-services',
] as const

export type MicroAppId = (typeof microAppIds)[number]
export type ThemeMode = 'light' | 'dark'

export interface MicroAppPaneProps {
  theme: ThemeMode
}

export type MicroAppListPane = ComponentType<MicroAppPaneProps>
export type MicroAppContentPane = ComponentType<MicroAppPaneProps>

export interface MicroAppHeaderMeta {
  moduleTitle: string
  moduleSubtitle: string
  itemTitle?: string
  itemSubtitle?: string
}

export interface MicroAppLayoutConfig {
  header?: ReactNode
  mainTitle?: ReactNode
  subtitle?: string
  topActions?: ReactNode
  rightSidebar?: ReactNode
  rightSidebarWidth?: number
  hideIcon?: boolean
  hideHeader?: boolean
}

export interface MicroAppLayoutConfigBridgeProps {
  onConfigChange: (config: MicroAppLayoutConfig | undefined) => void
}

export type MicroAppLayoutConfigBridge = ComponentType<MicroAppLayoutConfigBridgeProps>

export interface MicroAppDefinition {
  id: MicroAppId
  label: string
  icon: LucideIcon
  header: MicroAppHeaderMeta
  ListPane: MicroAppListPane
  ContentPane: MicroAppContentPane
  LayoutConfigBridge?: MicroAppLayoutConfigBridge
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

const buildList = (title: string, description: string, items: ReactNode[]) =>
  () => <PlaceholderListPane title={title} description={description} items={items} />

const buildContent = (title: string, description: string, body?: ReactNode) =>
  () => <PlaceholderContentPane title={title} description={description}>{body}</PlaceholderContentPane>

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
  import('@/modules/contacts/components/ContactListPane').then((mod) => ({ default: mod.ContactListPane })),
)
const ContactDetailPane = lazyPane(() =>
  import('@/modules/contacts/components/ContactDetailPane').then((mod) => ({ default: mod.ContactDetailPane })),
)
const FavoriteListPane = lazyPane(() =>
  import('@/modules/favorites/components/FavoriteListPane').then((mod) => ({ default: mod.FavoriteListPane })),
)
const FavoriteContentPane = lazyPane(() =>
  import('@/modules/favorites/components/FavoriteContentPane').then((mod) => ({ default: mod.FavoriteContentPane })),
)
const FilesTreePane = lazyPane(() =>
  import('@/modules/files/components/FilesTreePane').then((mod) => ({ default: mod.FilesTreePane })),
)
const FilesListPane = lazyPane(() =>
  import('@/modules/files/components/FilesListPane').then((mod) => ({ default: mod.FilesListPane })),
)
const FileDetailPane = lazyPane(() =>
  import('@/modules/files/components/FileDetailPane').then((mod) => ({ default: mod.FileDetailPane })),
)
const ModelServicesListPane = lazyPane(() =>
  import('@/modules/model-services/ModelServicesListPane').then((mod) => ({ default: mod.ModelServicesListPane })),
)
const ModelServicesContentPane = lazyPane(() =>
  import('@/modules/model-services/ModelServicesContentPane').then((mod) => ({ default: mod.ModelServicesContentPane })),
)
const ChatLayoutConfigBridge = lazyBridge(() =>
  import('@/modules/chat/layout/ChatLayoutConfigBridge').then((mod) => ({ default: mod.ChatLayoutConfigBridge })),
)
const ModelServicesLayoutConfigBridge = lazyBridge(() =>
  import('@/modules/model-services/ModelServicesLayoutConfigBridge').then((mod) => ({ default: mod.ModelServicesLayoutConfigBridge })),
)

function FilesLayoutConfigBridge({
  onConfigChange,
}: MicroAppLayoutConfigBridgeProps) {
  useEffect(() => {
    onConfigChange({
      rightSidebar: <FileDetailPane />,
      rightSidebarWidth: 320,
    })
  }, [onConfigChange])

  return null
}

export const microAppRegistry: Record<MicroAppId, MicroAppDefinition> = {
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
      moduleSubtitle: '浏览 Pod 文件系统',
      itemTitle: '文件预览',
      itemSubtitle: '支持多源同步',
    },
    ListPane: FilesTreePane,
    ContentPane: FilesListPane,
    LayoutConfigBridge: FilesLayoutConfigBridge,
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
    ListPane: buildList('设置项', '示例设置类别', ['通用', '外观', '隐私']),
    ContentPane: buildContent('设置面板', '选择一个设置类别'),
  },
  'model-services': {
    id: 'model-services',
    label: '模型服务',
    icon: Bot, // Using Bot icon for AI Model Services
    header: {
      moduleTitle: '模型服务',
      moduleSubtitle: '配置 AI 提供商及模型',
      itemTitle: '提供商详情',
      itemSubtitle: 'API Key & Model Management',
    },
    ListPane: ModelServicesListPane,
    ContentPane: ModelServicesContentPane,
    LayoutConfigBridge: ModelServicesLayoutConfigBridge,
  },
}

export const defaultMicroAppId: MicroAppId = 'chat'

export const isValidMicroAppId = (value: string | undefined): value is MicroAppId =>
  Boolean(value && microAppIds.includes(value as MicroAppId))
