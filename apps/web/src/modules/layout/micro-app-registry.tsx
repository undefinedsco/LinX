import type { ComponentType, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  MessageSquare,
  Users,
  FolderOpen,
  Star,
  Settings as SettingsIcon,
  Bot,
} from 'lucide-react'
import { PlaceholderListPane, PlaceholderContentPane } from './placeholders'
import { ChatListPane, ChatContentPane, useChatLayoutConfig } from '@/modules/chat'
import { ContactListPane, ContactDetailPane } from '@/modules/contacts'
import { FavoriteListPane, FavoriteContentPane } from '@/modules/favorites'
import { ModelServicesListPane, ModelServicesContentPane, useModelServicesLayoutConfig } from '@/modules/model-services'

export const microAppIds = [
  'chat',
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

export interface MicroAppDefinition {
  id: MicroAppId
  label: string
  icon: LucideIcon
  header: MicroAppHeaderMeta
  ListPane: MicroAppListPane
  ContentPane: MicroAppContentPane
  useLayoutConfig?: () => MicroAppLayoutConfig
}

const buildList = (title: string, description: string, items: ReactNode[]) =>
  () => <PlaceholderListPane title={title} description={description} items={items} />

const buildContent = (title: string, description: string, body?: ReactNode) =>
  () => <PlaceholderContentPane title={title} description={description}>{body}</PlaceholderContentPane>

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
    useLayoutConfig: useChatLayoutConfig,
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
    ListPane: buildList('文件夹', '示例目录树', ['设计文档', '知识库', '临时文件']),
    ContentPane: buildContent('文件内容', '文件预览区 placeholder'),
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
    useLayoutConfig: useModelServicesLayoutConfig,
  },
}

export const defaultMicroAppId: MicroAppId = 'chat'

export const isValidMicroAppId = (value: string | undefined): value is MicroAppId =>
  Boolean(value && microAppIds.includes(value as MicroAppId))
