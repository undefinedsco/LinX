import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Archive,
  ArrowUpDown,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Contact,
  ExternalLink,
  Download,
  FileArchive,
  FileText,
  Folder,
  FolderOpen,
  Home,
  Image,
  Link2,
  LockKeyhole,
  List,
  Menu,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  SendHorizontal,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Tags,
  Upload,
  UserRound,
  UsersRound,
} from 'lucide-react'
import '../../web/src/index.css'
import './prototype.css'
import { FilesDetail, FilesList, FilesMain } from './files/FilesModule'
import { FilesWorkspace } from './files/FilesWorkspace'
import { readPrototypeStorage, writePrototypeStorage } from './files/prototypeStorage'
import type { FilePropertyState } from './files/FileEditorSheet'
import type {
  ChatFileItem,
  FileOpenSample,
  FilesSelection,
  IconType,
  StoredFileContent,
  StructuredView,
} from './files/files-types'

type ModuleId = 'chat' | 'contacts' | 'files' | 'favorites'
type InboxItemStatus = 'pending' | 'approved' | 'denied'
type RailSurface = 'chatFiles' | 'keys' | 'models' | 'settings'
const FILE_CONTENTS_STORAGE_KEY = 'linx.prototype.files.fileContentsByPath'
const FILE_PROPERTIES_STORAGE_KEY = 'linx.prototype.files.filePropertiesByPath'

interface NavItem {
  id: ModuleId
  label: string
  icon: IconType
}

interface ListItem {
  id: string
  title: string
  subtitle: string
  meta: string
  icon: IconType
  active?: boolean
  muted?: boolean
}

interface InboxItem {
  id: string
  kind: 'approval' | 'auth' | 'notice'
  title: string
  source: string
  target: string
  risk: string
  time: string
  icon: IconType
}

interface SecretKeyItem {
  id: string
  name: string
  provider: string
  masked: string
  usage: string
  status: string
  runtimeState: string
  health: string
  linkedModels: string
  lastUsed: string
  active?: boolean
}

interface ModelRouteItem {
  id: string
  name: string
  provider: string
  route: string
  credential: string
  note: string
  active?: boolean
}

const navItems: NavItem[] = [
  { id: 'chat', label: '聊天', icon: MessageSquare },
  { id: 'contacts', label: '联系人', icon: Contact },
  { id: 'files', label: '文件', icon: FolderOpen },
  { id: 'favorites', label: '收藏', icon: Star },
]

const menuItems: Array<{ label: string; icon: IconType; action?: RailSurface }> = [
  { label: '聊天文件', icon: FileArchive, action: 'chatFiles' },
  { label: '聊天记录管理', icon: FileText },
  { label: '密钥', icon: LockKeyhole, action: 'keys' },
  { label: '模型', icon: Bot, action: 'models' },
  { label: '设置', icon: Settings, action: 'settings' },
]

const chatFolders = ['全部', '未读', '工作区', '个人']

const chats: ListItem[] = [
  {
    id: 'secretary',
    title: 'AI Secretary',
    subtitle: '默认助手 · 已同步到 Pod',
    meta: '09:41',
    icon: Bot,
    active: true,
  },
  {
    id: 'self',
    title: '我的空间',
    subtitle: '链接、想法、任务先放这里',
    meta: '昨天',
    icon: Archive,
  },
  {
    id: 'design',
    title: 'LinX 原型工作区',
    subtitle: 'Thread 绑定 workspace，继续上次运行',
    meta: 'Tue',
    icon: FolderOpen,
  },
  {
    id: 'cloud',
    title: 'Cloud Node',
    subtitle: '隧道状态正常',
    meta: 'Mon',
    icon: UserRound,
    muted: true,
  },
  {
    id: 'webdev',
    title: 'Web Dev',
    subtitle: '部署完成',
    meta: 'Mon',
    icon: Folder,
    muted: true,
  },
]

const contacts: Array<{ group: string; items: ListItem[] }> = [
  {
    group: 'AI 助手',
    items: [
      { id: 'secretary', title: 'AI Secretary', subtitle: 'Contact · 默认 Agent', meta: '', icon: Bot, active: true },
      { id: 'research', title: 'Research Agent', subtitle: 'Agent home · research', meta: '', icon: Bot },
      { id: 'code', title: 'Code Assistant', subtitle: 'Agent home · coding', meta: '', icon: Bot },
    ],
  },
  {
    group: '联系人',
    items: [
      { id: 'gan', title: 'Gan', subtitle: 'Person · Designer', meta: '', icon: UserRound },
      { id: 'alice', title: 'Alice', subtitle: 'Person · Developer', meta: '', icon: UserRound },
      { id: 'cloud', title: 'Cloud Node', subtitle: 'Service contact · Offline', meta: '', icon: UserRound, muted: true },
    ],
  },
  {
    group: '群组',
    items: [
      { id: 'design', title: 'Design Room', subtitle: '4 members · shared thread', meta: '', icon: UsersRound },
      { id: 'project', title: 'Project Alpha', subtitle: '6 members · shared workspace', meta: '', icon: UsersRound },
    ],
  },
]

const initialFavorites: Array<{ group: string; items: ListItem[] }> = [
  {
    group: 'Today',
    items: [
      { id: 'rule', title: 'Secretary 初始化规则', subtitle: '默认助手不可删除，可改名', meta: '09:41', icon: MessageSquare, active: true },
      { id: 'ui', title: 'UI layout reference.png', subtitle: '/alice/files/images/', meta: '09:30', icon: Image },
      { id: 'figma', title: 'Login flow - Figma', subtitle: 'figma.com/file/abc123', meta: '09:12', icon: Link2 },
    ],
  },
  {
    group: 'Yesterday',
    items: [
      { id: 'tunnel', title: 'tunnel.md', subtitle: '/alice/files/docs/', meta: 'Tue 16:22', icon: FileText },
      { id: 'cloudflare', title: 'Cloudflare Tunnel setup', subtitle: 'developers.cloudflare.com', meta: 'Tue 15:48', icon: Link2 },
    ],
  },
  {
    group: 'This week',
    items: [
      { id: 'room', title: 'Design Room', subtitle: '4 members', meta: 'Mon 11:20', icon: UsersRound },
    ],
  },
]

const chatFileItems: ChatFileItem[] = [
  {
    id: 'layout',
    name: 'prototype-layout.png',
    kind: '图片',
    source: 'AI Secretary · 原型调整',
    path: '/files/images/prototype-layout.png',
    time: '09:43',
    size: '2.1 MB',
    icon: Image,
    active: true,
  },
  {
    id: 'access',
    name: 'multi-channel-access.md',
    kind: '文档',
    source: 'LinX 原型工作区',
    path: '/files/docs/multi-channel-access.md',
    time: '09:35',
    size: '18 KB',
    icon: FileText,
  },
  {
    id: 'release',
    name: 'xpod-0.2.36.tgz',
    kind: '运行产物',
    source: 'Cloud Node',
    path: '/files/releases/xpod-0.2.36.tgz',
    time: '昨天',
    size: '412 KB',
    icon: FileArchive,
  },
  {
    id: 'draw',
    name: 'right.codes/draw',
    kind: '链接',
    source: '我的空间',
    path: 'https://www.right.codes/draw',
    time: 'Tue',
    size: 'URL',
    icon: Link2,
  },
]

const inboxItems: InboxItem[] = [
  {
    id: 'write-secretary-profile',
    kind: 'approval',
    title: '允许 AI Secretary 写入个人卡片',
    source: 'AI Secretary · 原型调整',
    target: '/.data/agents/secretary/profile.ttl',
    risk: '会修改默认助手的名称、头像和欢迎语。',
    time: '09:44',
    icon: ShieldCheck,
  },
  {
    id: 'connect-cloudflare',
    kind: 'auth',
    title: 'Cloudflare Tunnel 需要重新认证',
    source: 'Local Provider',
    target: 'node-0000.undefineds.co',
    risk: '认证完成后外网访问路由会更新。',
    time: '09:18',
    icon: ExternalLink,
  },
  {
    id: 'sync-finished',
    kind: 'notice',
    title: '工作区快照已同步',
    source: 'linx-prototype workspace',
    target: '/.data/workspaces/linx-prototype/.meta',
    risk: '无操作要求，可回到 Chat 继续。',
    time: '昨天',
    icon: CheckCircle2,
  },
]

const secretKeys: SecretKeyItem[] = [
  {
    id: 'openai-team',
    name: 'OpenAI Team Key',
    provider: 'OpenAI',
    masked: 'sk-•••• •••• 92A',
    usage: 'Chat / Coding',
    status: 'Default',
    runtimeState: 'Active · In use',
    health: 'OK',
    linkedModels: 'gpt-5.5, gpt-5.3-codex-spark',
    lastUsed: '正在使用 · AI Secretary',
    active: true,
  },
  {
    id: 'rightcodes-draw',
    name: 'RightCodes Draw Key',
    provider: 'RightCodes',
    masked: 'rc-•••• •••• 41F',
    usage: 'Image generation',
    status: '429',
    runtimeState: 'Rate limited',
    health: 'HTTP 429',
    linkedModels: 'rightcodes-image',
    lastUsed: '2 分钟前 · 生图请求',
  },
  {
    id: 'local-lab',
    name: 'Local Lab Key',
    provider: 'OpenAI-compatible',
    masked: 'loc-•••• •••• 08C',
    usage: 'Dev only',
    status: '500',
    runtimeState: 'Server error',
    health: 'HTTP 500',
    linkedModels: 'local fallback',
    lastUsed: '7 分钟前 · fallback 运行',
  },
]

const modelRoutes: ModelRouteItem[] = [
  {
    id: 'frontier',
    name: 'gpt-5.5',
    provider: 'OpenAI',
    route: '默认对话 / coding',
    credential: 'OpenAI Team Key',
    note: '标记为 default，优先使用。',
    active: true,
  },
  {
    id: 'spark',
    name: 'gpt-5.3-codex-spark',
    provider: 'OpenAI',
    route: '快速搜索 / explore',
    credential: 'OpenAI Team Key',
    note: '低延迟任务走 fast lane。',
  },
  {
    id: 'image',
    name: 'rightcodes-image',
    provider: 'RightCodes',
    route: '图片生成 / 修改',
    credential: 'RightCodes Draw Key',
    note: 'Base URL: /v1/images/generations。',
  },
]

function AvatarMark({ icon: Icon, active = false }: { icon: IconType; active?: boolean }) {
  return (
    <span className={`avatar-mark ${active ? 'active' : ''}`}>
      <Icon size={16} strokeWidth={1.8} />
    </span>
  )
}

function Sidebar({
  activeModule,
  onChangeModule,
  onOpenSecondary,
}: {
  activeModule: ModuleId
  onChangeModule: (module: ModuleId) => void
  onOpenSecondary: (surface: RailSurface) => void
}) {
  return (
    <aside className="side-rail">
      <button className="profile-dot" aria-label="个人资料">
        <Sparkles size={17} />
      </button>
      <nav className="module-nav" aria-label="主导航">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              className={activeModule === item.id ? 'active' : ''}
              aria-label={item.label}
              title={item.label}
              onClick={() => onChangeModule(item.id)}
            >
              <Icon size={20} strokeWidth={1.65} />
            </button>
          )
        })}
      </nav>
      <div className="rail-menu">
        <div className="rail-menu-popover" role="menu">
          {menuItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.label}
                role="menuitem"
                onClick={() => {
                  if (item.action) onOpenSecondary(item.action)
                }}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
        <button aria-label="菜单">
          <Menu size={21} />
        </button>
      </div>
    </aside>
  )
}

function SearchHeader({ placeholder, addLabel }: { placeholder: string; addLabel?: string }) {
  return (
    <header className="list-header">
      <div className="search-pill">
        <Search size={14} />
        <span>{placeholder}</span>
        <kbd>⌘K</kbd>
      </div>
      {addLabel ? (
        <button className="icon-button" aria-label={addLabel}>
          <Plus size={17} />
        </button>
      ) : null}
    </header>
  )
}

function ListRow({ item, dense = false }: { item: ListItem; dense?: boolean }) {
  const Icon = item.icon
  return (
    <button className={`list-row ${item.active ? 'active' : ''} ${item.muted ? 'muted' : ''} ${dense ? 'dense' : ''}`}>
      <AvatarMark icon={Icon} active={item.active} />
      <span className="list-row-main">
        <span className="list-row-title">
          <strong>{item.title}</strong>
          {item.meta ? <time>{item.meta}</time> : null}
        </span>
        <small>{item.subtitle}</small>
      </span>
    </button>
  )
}

function TopTools({ pendingCount, onOpenInbox }: { pendingCount: number; onOpenInbox: () => void }) {
  return (
    <div className="top-tools">
      <button className="icon-button" aria-label="消息中心" onClick={onOpenInbox}>
        <Bell size={16} />
        {pendingCount > 0 ? <i /> : null}
      </button>
      <button className="icon-button" aria-label="更多">
        <MoreHorizontal size={17} />
      </button>
    </div>
  )
}

function ChatList() {
  return (
    <section className="list-pane">
      <SearchHeader placeholder="搜索会话、Thread 或 Workspace" addLabel="新建会话" />
      <div className="folder-tabs">
        {chatFolders.map((folder, index) => (
          <button className={index === 0 ? 'active' : ''} key={folder}>{folder}</button>
        ))}
      </div>
      <div className="list-scroll">
        {chats.map((chat) => (
          <ListRow item={chat} key={chat.id} />
        ))}
      </div>
    </section>
  )
}

function ApprovalInlineCard({
  status,
  onApprove,
  onDeny,
  onOpenInbox,
}: {
  status: InboxItemStatus
  onApprove: () => void
  onDeny: () => void
  onOpenInbox: () => void
}) {
  const isPending = status === 'pending'
  return (
    <article className="message-card secretary approval-inline">
      <AvatarMark icon={ShieldCheck} active={isPending} />
      <div>
        <strong>需要你确认：写入 AI Secretary 个人卡片</strong>
        <p>目标：/.data/agents/secretary/profile.ttl</p>
        <p>影响：更新默认助手名称、头像和欢迎语。</p>
        <div className="approval-actions">
          {isPending ? (
            <>
              <button className="primary" onClick={onApprove}>批准</button>
              <button onClick={onDeny}>拒绝</button>
            </>
          ) : (
            <span className={`status-pill ${status}`}>{status === 'approved' ? '已批准' : '已拒绝'}</span>
          )}
          <button onClick={onOpenInbox}>查看 Inbox</button>
        </div>
        <time>09:44</time>
      </div>
    </article>
  )
}

function ChatMain({
  pendingCount,
  approvalStatus,
  onApprove,
  onDeny,
  onOpenInbox,
}: {
  pendingCount: number
  approvalStatus: InboxItemStatus
  onApprove: () => void
  onDeny: () => void
  onOpenInbox: () => void
}) {
  return (
    <main className="work-pane chat-work">
      <header className="work-header">
        <div>
          <h1>AI Secretary</h1>
          <p>当前 Thread · 默认助手 · Pod 已同步</p>
        </div>
        <TopTools pendingCount={pendingCount} onOpenInbox={onOpenInbox} />
      </header>
      <section className="chat-stage">
        <div className="day-label">今天</div>
        <article className="message-card secretary">
          <AvatarMark icon={Bot} active />
          <div>
            <strong>我已准备好默认工作现场。</strong>
            <ul>
              <li><FolderOpen size={14} /> Workspace: linx-prototype</li>
              <li><FileText size={14} /> Repository: undefinedsco/LinX</li>
              <li><Check size={14} /> Session 会绑定 Agent、Thread 和 Workspace</li>
            </ul>
            <time>09:41</time>
          </div>
        </article>
        <ApprovalInlineCard
          status={approvalStatus}
          onApprove={onApprove}
          onDeny={onDeny}
          onOpenInbox={onOpenInbox}
        />
        <article className="message-card mine">
          <p>按新模型继续重做原型，保持界面接近用户心智。</p>
          <time>09:42 ✓</time>
        </article>
      </section>
      <footer className="composer-card">
        <div className="composer-input">发消息给 AI Secretary，或把链接、文件、任务直接丢进来</div>
        <div className="composer-actions">
          <button><Paperclip size={16} /></button>
          <button><Image size={16} /></button>
          <button><Link2 size={16} /></button>
          <button><Tags size={16} /></button>
          <button><Mic size={16} /></button>
          <button className="send"><SendHorizontal size={16} /></button>
        </div>
      </footer>
    </main>
  )
}

function ChatDetail() {
  return (
    <aside className="detail-pane">
      <section className="identity-card">
        <AvatarMark icon={Bot} active />
        <h2>AI Secretary</h2>
        <p>默认 Agent · 不可删除</p>
        <button>请赐名</button>
      </section>
      <section className="detail-card">
        <h3>当前工作现场</h3>
        <DetailLine icon={MessageSquare} label="Thread" value="原型调整" />
        <DetailLine icon={FolderOpen} label="Workspace" value="linx-prototype" />
        <DetailLine icon={FileText} label="Repository" value="LinX" />
      </section>
      <section className="detail-card">
        <h3>Agent 能力</h3>
        <DetailLine icon={Home} label="Home" value="/.data/agents/secretary/" />
        <DetailLine icon={Sparkles} label="Skills" value="enabled" />
        <DetailLine icon={ShieldCheck} label="AI 配置" value="共享配置池" />
      </section>
      <section className="detail-card">
        <h3>快捷入口</h3>
        <button className="wide-action"><Check size={15} /> 新任务</button>
        <button className="wide-action"><Upload size={15} /> 上传文件</button>
        <button className="wide-action"><Link2 size={15} /> 保存链接</button>
      </section>
    </aside>
  )
}

function ContactsList() {
  return (
    <section className="list-pane">
      <SearchHeader placeholder="搜索联系人、Agent 或群组" addLabel="添加联系人" />
      <div className="list-scroll grouped">
        {contacts.map((group) => (
          <div className="row-group" key={group.group}>
            <h3>{group.group}</h3>
            {group.items.map((item) => (
              <ListRow dense item={item} key={item.id} />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

function ContactsMain({ pendingCount, onOpenInbox }: { pendingCount: number; onOpenInbox: () => void }) {
  return (
    <main className="work-pane contact-work">
      <header className="work-header">
        <div>
          <h1>AI Secretary</h1>
          <p>联系人投影，链接到默认 Agent</p>
        </div>
        <TopTools pendingCount={pendingCount} onOpenInbox={onOpenInbox} />
      </header>
      <section className="contact-profile-card">
        <AvatarMark icon={Bot} active />
        <div>
          <h2>AI Secretary</h2>
          <p>Contact · Agent projection</p>
        </div>
      </section>
      <div className="primary-actions">
        <button className="primary"><MessageSquare size={16} /> 发消息</button>
        <button><Sparkles size={16} /> 请赐名</button>
        <button><Star size={16} /> 收藏</button>
      </div>
      <section className="info-table">
        <InfoRow label="Contact" value="/.data/contacts/ai-secretary.ttl" />
        <InfoRow label="Agent" value="/.data/agents/secretary/profile.ttl" />
        <InfoRow label="Agent Home" value="/.data/agents/secretary/" />
        <InfoRow label="规则" value="默认助手不可删除；可改名、改头像" />
        <InfoRow label="说明" value="帮你整理聊天、文件、链接、任务和上下文。" />
      </section>
    </main>
  )
}

function ContactsDetail() {
  return (
    <aside className="detail-pane">
      <section className="detail-card">
        <h3>关系边界</h3>
        <DetailLine icon={Contact} label="Contact" value="关系卡片" />
        <DetailLine icon={UserRound} label="Person" value="人类身份" />
        <DetailLine icon={Bot} label="Agent" value="执行能力" />
      </section>
      <section className="detail-card">
        <h3>共享上下文</h3>
        <DetailLine icon={MessageSquare} label="Chat" value="AI Secretary" />
        <DetailLine icon={FolderOpen} label="Workspace" value="linx-prototype" />
        <DetailLine icon={Image} label="Artifacts" value="6 files" />
      </section>
      <button className="wide-action strong">查看全部</button>
    </aside>
  )
}

function FavoritesList({ favoriteGroups }: { favoriteGroups: Array<{ group: string; items: ListItem[] }> }) {
  return (
    <section className="list-pane" data-favorites-surface="list">
      <SearchHeader placeholder="Search saved" />
      <div className="folder-tabs">
        {['All', 'Msg', 'File', 'Link', 'Contact'].map((tab, index) => (
          <button className={index === 0 ? 'active' : ''} key={tab}>{tab}</button>
        ))}
      </div>
      <div className="list-scroll grouped">
        {favoriteGroups.map((group) => (
          <div className="row-group" key={group.group}>
            <h3>{group.group}</h3>
            {group.items.map((item) => (
              <span data-favorite-item={item.id} data-favorite-path={item.subtitle} key={item.id}>
                <ListRow dense item={item} />
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

function FavoritesMain({
  favoriteGroups,
  pendingCount,
  onOpenInbox,
}: {
  favoriteGroups: Array<{ group: string; items: ListItem[] }>
  pendingCount: number
  onOpenInbox: () => void
}) {
  return (
    <main className="work-pane favorites-work">
      <header className="work-header">
        <div>
          <h1>Favorites</h1>
          <p>回到原消息、原文件、原联系人</p>
        </div>
        <TopTools pendingCount={pendingCount} onOpenInbox={onOpenInbox} />
      </header>
      <section className="saved-feed" data-favorites-surface="feed">
        {favoriteGroups.map((group) => (
          <div className="saved-group" key={group.group}>
            <h2>{group.group}</h2>
            {group.items.map((item) => {
              const Icon = item.icon
              return (
                <button
                  className={item.active ? 'active' : ''}
                  data-favorite-item={item.id}
                  data-favorite-path={item.subtitle}
                  key={item.id}
                >
                  <AvatarMark icon={Icon} active={item.active} />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.subtitle}</small>
                  </span>
                  <time>{item.meta}</time>
                </button>
              )
            })}
          </div>
        ))}
      </section>
    </main>
  )
}

function FavoritesDetail() {
  return (
    <aside className="detail-pane">
      <section className="identity-card saved-identity">
        <AvatarMark icon={Star} active />
        <h2>Secretary 初始化规则</h2>
        <p>Message · AI Secretary</p>
      </section>
      <section className="detail-card">
        <h3>Go back to</h3>
        <DetailLine icon={MessageSquare} label="Message" value="09:41" />
        <DetailLine icon={Bot} label="Agent" value="AI Secretary" />
        <DetailLine icon={FolderOpen} label="Workspace" value="linx-prototype" />
      </section>
      <section className="detail-card">
        <h3>Tags</h3>
        <div className="tag-cloud">
          <span>规则</span>
          <span>助手</span>
          <span>默认设置</span>
          <span>+</span>
        </div>
      </section>
    </aside>
  )
}

function ChatFilesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  return (
    <div className="modal-layer chat-files-layer" role="dialog" aria-label="聊天文件">
      <button className="modal-backdrop" aria-label="关闭聊天文件" onClick={onClose} />
      <section className="modal-panel chat-files-panel">
        <header className="modal-header">
          <div>
            <h2>聊天文件</h2>
            <p>按聊天来源查看附件、链接和运行产物</p>
          </div>
          <button className="icon-button" aria-label="关闭聊天文件弹窗" onClick={onClose}>
            <ChevronRight size={17} />
          </button>
        </header>
        <div className="chat-files-modal-body">
          <aside className="chat-files-source">
            <SearchHeader placeholder="搜索聊天文件、来源会话或链接" />
            <div className="folder-tabs">
              {['当前聊天', '最近', '图片', '文档', '链接'].map((tab, index) => (
                <button className={index === 0 ? 'active' : ''} key={tab}>{tab}</button>
              ))}
            </div>
            <div className="list-scroll grouped">
              <div className="row-group">
                <h3>来源会话</h3>
                {chats.slice(0, 4).map((chat, index) => (
                  <ListRow dense item={{ ...chat, active: index === 0 }} key={chat.id} />
                ))}
              </div>
            </div>
          </aside>
          <main className="chat-files-content">
            <div className="chat-file-summary">
              <span>AI Secretary</span>
              <strong>4 个文件</strong>
              <small>只组织聊天来源；完整 Pod 浏览仍在「文件」模块。</small>
            </div>
            <div className="chat-file-list">
              {chatFileItems.map((item) => {
                const Icon = item.icon
                return (
                  <button className={item.active ? 'active' : ''} key={item.id}>
                    <AvatarMark icon={Icon} active={item.active} />
                    <span className="chat-file-main">
                      <strong>{item.name}</strong>
                      <small>{item.source}</small>
                    </span>
                    <span>{item.kind}</span>
                    <time>{item.time}</time>
                  </button>
                )
              })}
            </div>
          </main>
          <aside className="chat-files-detail">
            <section className="identity-card file-identity">
              <AvatarMark icon={Image} active />
              <h2>prototype-layout.png</h2>
              <p>来自 AI Secretary 的文件消息</p>
            </section>
            <section className="detail-card">
              <h3>来源</h3>
              <DetailLine icon={MessageSquare} label="Thread" value="原型调整" />
              <DetailLine icon={Bot} label="Agent" value="AI Secretary" />
              <DetailLine icon={Clock3} label="Message" value="今天 09:43" />
            </section>
            <section className="info-stack">
              <InfoRow label="Path" value="/files/images/prototype-layout.png" />
              <InfoRow label="Size" value="2.1 MB" />
              <InfoRow label="Type" value="image/png" />
              <InfoRow label="Relation" value="source message URI" />
            </section>
            <div className="primary-actions vertical">
              <button className="primary"><MessageSquare size={15} /> 回到消息</button>
              <button><FolderOpen size={15} /> 在文件中打开</button>
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}

function InboxSheet({
  open,
  items,
  approvalStatus,
  onApprove,
  onDeny,
  onClose,
}: {
  open: boolean
  items: InboxItem[]
  approvalStatus: InboxItemStatus
  onApprove: () => void
  onDeny: () => void
  onClose: () => void
}) {
  if (!open) return null
  const activeItem = items[0]
  const activeStatus = approvalStatus

  return (
    <div className="modal-layer inbox-layer" role="dialog" aria-label="Inbox">
      <button className="modal-backdrop" aria-label="关闭 Inbox" onClick={onClose} />
      <aside className="modal-panel inbox-panel">
        <header className="modal-header">
          <div>
            <h2>Inbox</h2>
            <p>待审批、待认证和异步通知</p>
          </div>
          <button className="icon-button" aria-label="关闭" onClick={onClose}>
            <ChevronRight size={17} />
          </button>
        </header>
        <div className="inbox-three-column">
          <aside className="inbox-filter-column">
            <div className="inbox-filter-title">分类</div>
            {[
              { label: '全部', count: 3, icon: Bell, active: true },
              { label: '待审批', count: activeStatus === 'pending' ? 1 : 0, icon: ShieldCheck },
              { label: '待认证', count: 1, icon: ExternalLink },
              { label: '通知', count: 1, icon: CheckCircle2 },
            ].map((filter) => {
              const Icon = filter.icon
              return (
                <button className={filter.active ? 'active' : ''} key={filter.label}>
                  <Icon size={15} />
                  <span>{filter.label}</span>
                  <strong>{filter.count}</strong>
                </button>
              )
            })}
          </aside>
          <section className="inbox-list-column">
            <div className="inbox-column-header">
              <h3>待处理</h3>
              <span>{activeStatus === 'pending' ? '2 pending' : '1 pending'}</span>
            </div>
            <div className="inbox-list-scroll">
              {items.map((item, index) => {
                const Icon = item.icon
                const status = item.id === 'write-secretary-profile' ? approvalStatus : item.kind === 'notice' ? 'approved' : 'pending'
                return (
                  <article className={`inbox-item ${status} ${index === 0 ? 'active' : ''}`} key={item.id}>
                    <AvatarMark icon={Icon} active={status === 'pending'} />
                    <div>
                      <span className="inbox-item-title">
                        <strong>{item.title}</strong>
                        <time>{item.time}</time>
                      </span>
                      <p>{item.source}</p>
                      <small>{item.target}</small>
                      {index === 0 ? (
                        <div className="inbox-expanded-approval">
                          <div className="approval-detail-row">
                            <span>动作</span>
                            <strong>写入 AI Secretary 个人卡片</strong>
                          </div>
                          <div className="approval-detail-row">
                            <span>目标资源</span>
                            <strong>{activeItem.target}</strong>
                          </div>
                          <div className="approval-detail-row">
                            <span>风险说明</span>
                            <strong>{activeItem.risk}</strong>
                          </div>
                          <div className="approval-detail-row">
                            <span>影响范围</span>
                            <strong>profile:name / profile:avatar / secretary:welcomeMessage</strong>
                          </div>
                          <p>只影响默认助手个人卡片，不会修改 Workspace、Repository 或聊天历史。</p>
                          <div className="approval-actions inbox-expanded-actions">
                            {activeStatus === 'pending' ? (
                              <>
                                <button className="primary" onClick={onApprove}>批准</button>
                                <button onClick={onDeny}>拒绝</button>
                              </>
                            ) : (
                              <span className={`status-pill ${activeStatus}`}>{activeStatus === 'approved' ? '已批准' : '已拒绝'}</span>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
          <aside className="inbox-detail-column">
            <section className="inbox-entry-card">
              <h3>入口</h3>
              <button className="wide-action strong"><MessageSquare size={15} /> 回到来源消息</button>
              <button className="wide-action"><Bot size={15} /> 打开 AI Secretary</button>
              <button className="wide-action"><FileText size={15} /> 查看目标资源</button>
            </section>
            <section className="inbox-entry-card">
              <h3>当前选择</h3>
              <DetailLine icon={ShieldCheck} label="Type" value="Approval" />
              <DetailLine icon={Clock3} label="Time" value={activeItem.time} />
              <DetailLine icon={Bot} label="Source" value="AI Secretary" />
            </section>
            <section className="inbox-entry-card compact">
              <h3>策略</h3>
              <p>高风险写入手动确认；批准后 Chat inline 卡和 Inbox 同步更新。</p>
            </section>
          </aside>
        </div>
      </aside>
    </div>
  )
}

function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  return (
    <div className="modal-layer settings-layer" role="dialog" aria-label="设置">
      <button className="modal-backdrop" aria-label="关闭设置" onClick={onClose} />
      <section className="modal-panel settings-panel">
        <header className="modal-header">
          <div>
            <h2>设置</h2>
            <p>账号、服务、Local 和通知；密钥与模型在底部菜单中独立打开</p>
          </div>
          <button className="icon-button" aria-label="关闭设置弹窗" onClick={onClose}>
            <ChevronRight size={17} />
          </button>
        </header>
        <div className="settings-three-column">
          <aside className="settings-nav-column">
            <div className="settings-nav-title">设置</div>
            {[
              { label: '账号', icon: UserRound, active: true },
              { label: '服务状态', icon: ShieldCheck },
              { label: 'Local Provider', icon: Home },
              { label: '通知', icon: Bell },
              { label: '关于', icon: FileText },
            ].map((item) => {
              const Icon = item.icon
              return (
                <button className={item.active ? 'active' : ''} key={item.label}>
                  <Icon size={15} />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </aside>
          <main className="settings-main-column">
            <section className="settings-section-card">
              <div className="settings-section-header">
                <div>
                  <h3>账号</h3>
                  <p>登录状态、Pod 状态和基础资料。</p>
                </div>
              </div>
              <div className="settings-info-list">
                <InfoRow label="Account" value="gan@undefineds.co" />
                <InfoRow label="Provider" value="Cloud" />
                <InfoRow label="Pod" value="Connected" />
                <InfoRow label="WebID" value="https://gan.undefineds.co/profile/card#me" />
              </div>
            </section>
            <section className="settings-section-card">
              <div className="settings-section-header">
                <div>
                  <h3>低频入口</h3>
                  <p>密钥和模型是并列二级页面，不放进设置内部。</p>
                </div>
              </div>
              <div className="settings-shortcut-list">
                <button><LockKeyhole size={16} /> 密钥</button>
                <button><Bot size={16} /> 模型</button>
              </div>
            </section>
          </main>
          <aside className="settings-detail-column">
            <section className="settings-detail-card">
              <h3>当前状态</h3>
              <DetailLine icon={Check} label="Login" value="Active" />
              <DetailLine icon={Home} label="Local" value="Off" />
              <DetailLine icon={Bell} label="Notice" value="Enabled" />
            </section>
            <section className="settings-detail-card">
              <h3>边界</h3>
              <p>设置不管理供应商；供应商只是密钥和模型页面里的分组。</p>
            </section>
          </aside>
        </div>
      </section>
    </div>
  )
}

function KeysDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  return (
    <div className="modal-layer settings-layer" role="dialog" aria-label="密钥">
      <button className="modal-backdrop" aria-label="关闭密钥" onClick={onClose} />
      <section className="modal-panel settings-panel">
        <header className="modal-header">
          <div>
            <h2>密钥</h2>
            <p>按供应商分组的共享 credential 池；不展示明文 API key</p>
          </div>
          <button className="icon-button" aria-label="关闭密钥弹窗" onClick={onClose}>
            <ChevronRight size={17} />
          </button>
        </header>
        <div className="settings-three-column keys-surface">
          <aside className="settings-nav-column">
            <div className="settings-nav-title">供应商</div>
            {['全部', 'OpenAI', 'RightCodes', 'OpenAI-compatible'].map((label, index) => (
              <button className={index === 0 ? 'active' : ''} key={label}>
                <LockKeyhole size={15} />
                <span>{label}</span>
              </button>
            ))}
          </aside>
          <main className="settings-main-column">
            {['OpenAI', 'RightCodes', 'OpenAI-compatible'].map((provider) => (
              <section className="settings-section-card" key={provider}>
                <div className="settings-section-header">
                  <div>
                    <h3>{provider}</h3>
                    <p>供应商只是分组，不是单独设置页。</p>
                  </div>
                  <button><Plus size={15} /> 新密钥</button>
                </div>
                <div className="secret-list">
                  {secretKeys.filter((item) => item.provider === provider).map((item) => (
                    <button className={item.active ? 'active' : ''} key={item.id}>
                      <AvatarMark icon={LockKeyhole} active={item.active} />
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.masked}</small>
                        <small>{item.runtimeState} · {item.lastUsed}</small>
                      </span>
                      <em className={item.health === 'HTTP 429' || item.health === 'HTTP 500' ? 'danger' : item.active ? 'active' : ''}>{item.health.startsWith('HTTP') ? item.health : item.status}</em>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </main>
          <aside className="settings-detail-column">
            <section className="settings-detail-card">
              <h3>当前激活</h3>
              <InfoRow label="Key" value="OpenAI Team Key" />
              <InfoRow label="State" value="Active · In use" />
              <InfoRow label="Models" value="gpt-5.5 / spark" />
            </section>
            <section className="settings-detail-card warning">
              <h3>异常记录</h3>
              <InfoRow label="HTTP 429" value="RightCodes Draw Key" />
              <InfoRow label="HTTP 500" value="Local Lab Key" />
            </section>
            <section className="settings-detail-card compact">
              <h3>边界</h3>
              <p>密钥只在这里维护；Agent 和 Session 只引用偏好，不保存 API key。</p>
            </section>
          </aside>
        </div>
      </section>
    </div>
  )
}

function ModelsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  return (
    <div className="modal-layer settings-layer" role="dialog" aria-label="模型">
      <button className="modal-backdrop" aria-label="关闭模型" onClick={onClose} />
      <section className="modal-panel settings-panel">
        <header className="modal-header">
          <div>
            <h2>模型</h2>
            <p>按供应商分组的模型路由；引用密钥页面里的 credential</p>
          </div>
          <button className="icon-button" aria-label="关闭模型弹窗" onClick={onClose}>
            <ChevronRight size={17} />
          </button>
        </header>
        <div className="settings-three-column models-surface">
          <aside className="settings-nav-column">
            <div className="settings-nav-title">供应商</div>
            {['全部', 'OpenAI', 'RightCodes'].map((label, index) => (
              <button className={index === 0 ? 'active' : ''} key={label}>
                <Bot size={15} />
                <span>{label}</span>
              </button>
            ))}
          </aside>
          <main className="settings-main-column">
            {['OpenAI', 'RightCodes'].map((provider) => (
              <section className="settings-section-card" key={provider}>
                <div className="settings-section-header">
                  <div>
                    <h3>{provider}</h3>
                    <p>模型按供应商分组，credential 来自密钥池。</p>
                  </div>
                  <button><Plus size={15} /> 新模型</button>
                </div>
                <div className="model-route-list">
                  {modelRoutes.filter((item) => item.provider === provider).map((item) => (
                    <button className={item.active ? 'active' : ''} key={item.id}>
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.route}</small>
                      </span>
                      <span>{item.credential}</span>
                      <span>{item.note}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </main>
          <aside className="settings-detail-column">
            <section className="settings-detail-card">
              <h3>默认策略</h3>
              <DetailLine icon={Check} label="Default" value="gpt-5.5" />
              <DetailLine icon={LockKeyhole} label="Key" value="OpenAI Team Key" />
              <DetailLine icon={Sparkles} label="Fallback" value="轮询可用模型" />
            </section>
            <section className="settings-detail-card warning">
              <h3>受影响模型</h3>
              <InfoRow label="HTTP 429" value="rightcodes-image" />
              <InfoRow label="HTTP 500" value="local fallback" />
            </section>
            <section className="settings-detail-card compact">
              <h3>边界</h3>
              <p>模型页面只配置路由和默认偏好；供应商只是分组，不另设管理页。</p>
            </section>
          </aside>
        </div>
      </section>
    </div>
  )
}

function DetailLine({ icon: Icon, label, value }: { icon: IconType; label: string; value: string }) {
  return (
    <div className="detail-line">
      <Icon size={15} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ModuleSurface({
  activeModule,
  pendingCount,
  approvalStatus,
  onApprove,
  onDeny,
  onOpenInbox,
  structuredView,
  onChangeStructuredView,
  filesDetailOpen,
  onToggleFilesDetail,
  onCloseFilesDetail,
  filesSelection,
  onSelectFile,
  favoriteGroups,
  fileContentsByPath,
  filePropertiesByPath,
  isFileFavorite,
  onChangeFileContent,
  onChangeFileProperties,
  onToggleFileFavorite,
}: {
  activeModule: ModuleId
  pendingCount: number
  approvalStatus: InboxItemStatus
  onApprove: () => void
  onDeny: () => void
  onOpenInbox: () => void
  structuredView: StructuredView
  onChangeStructuredView: (view: StructuredView) => void
  filesDetailOpen: boolean
  onToggleFilesDetail: () => void
  onCloseFilesDetail: () => void
  filesSelection: FilesSelection
  onSelectFile: (selection: FilesSelection) => void
  favoriteGroups: Array<{ group: string; items: ListItem[] }>
  fileContentsByPath: Record<string, StoredFileContent>
  filePropertiesByPath: Record<string, FilePropertyState>
  isFileFavorite: (path: string) => boolean
  onChangeFileContent: (path: string, content: StoredFileContent) => void
  onChangeFileProperties: (path: string, properties: FilePropertyState) => void
  onToggleFileFavorite: (file: FileOpenSample) => void
}) {
  const [filesMobileTreeOpen, setFilesMobileTreeOpen] = useState(false)

  useEffect(() => {
    if (activeModule !== 'files') setFilesMobileTreeOpen(false)
  }, [activeModule])

  useEffect(() => {
    setFilesMobileTreeOpen(false)
  }, [filesSelection])

  if (activeModule === 'contacts') {
    return (
      <>
        <ContactsList />
        <ContactsMain pendingCount={pendingCount} onOpenInbox={onOpenInbox} />
        <ContactsDetail />
      </>
    )
  }
  if (activeModule === 'files') {
    return (
      <FilesWorkspace
        mobileTreeOpen={filesMobileTreeOpen}
        onCloseMobileTree={() => setFilesMobileTreeOpen(false)}
        onOpenMobileTree={() => setFilesMobileTreeOpen(true)}
        list={(
          <FilesList
            mobileOpen={filesMobileTreeOpen}
            onMobileClose={() => setFilesMobileTreeOpen(false)}
            selection={filesSelection}
            onSelect={onSelectFile}
          />
        )}
        main={
          <FilesMain
            selection={filesSelection}
            structuredView={structuredView}
            onChangeView={onChangeStructuredView}
            detailOpen={filesDetailOpen}
            fileContentsByPath={fileContentsByPath}
            filePropertiesByPath={filePropertiesByPath}
            onChangeFileContent={onChangeFileContent}
            onChangeFileProperties={onChangeFileProperties}
            onToggleDetail={onToggleFilesDetail}
            onCloseDetail={onCloseFilesDetail}
            onOpenSelection={onSelectFile}
            isFileFavorite={isFileFavorite}
            onToggleFileFavorite={onToggleFileFavorite}
          />
        }
        detail={<FilesDetail open={filesDetailOpen} selection={filesSelection} />}
      />
    )
  }
  if (activeModule === 'favorites') {
    return (
      <>
        <FavoritesList favoriteGroups={favoriteGroups} />
        <FavoritesMain favoriteGroups={favoriteGroups} pendingCount={pendingCount} onOpenInbox={onOpenInbox} />
        <FavoritesDetail />
      </>
    )
  }
  return (
    <>
      <ChatList />
      <ChatMain
        pendingCount={pendingCount}
        approvalStatus={approvalStatus}
        onApprove={onApprove}
        onDeny={onDeny}
        onOpenInbox={onOpenInbox}
      />
      <ChatDetail />
    </>
  )
}

function PrototypeApp() {
  const [activeModule, setActiveModule] = useState<ModuleId>('chat')
  const [chatFilesOpen, setChatFilesOpen] = useState(false)
  const [keysOpen, setKeysOpen] = useState(false)
  const [modelsOpen, setModelsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [approvalStatus, setApprovalStatus] = useState<InboxItemStatus>('pending')
  const [structuredView, setStructuredView] = useState<StructuredView>('table')
  const [filesDetailOpen, setFilesDetailOpen] = useState(false)
  const [filesSelection, setFilesSelection] = useState<FilesSelection>('structuredVocab')
  const [favoriteGroups, setFavoriteGroups] = useState(initialFavorites)
  const [fileContentsByPath, setFileContentsByPath] = useState<Record<string, StoredFileContent>>(() => (
    readPrototypeStorage<Record<string, StoredFileContent>>(FILE_CONTENTS_STORAGE_KEY, {})
  ))
  const [filePropertiesByPath, setFilePropertiesByPath] = useState<Record<string, FilePropertyState>>(() => (
    readPrototypeStorage<Record<string, FilePropertyState>>(FILE_PROPERTIES_STORAGE_KEY, {})
  ))
  const pendingCount = approvalStatus === 'pending' ? 2 : 1

  useEffect(() => {
    writePrototypeStorage(FILE_CONTENTS_STORAGE_KEY, fileContentsByPath)
  }, [fileContentsByPath])

  useEffect(() => {
    writePrototypeStorage(FILE_PROPERTIES_STORAGE_KEY, filePropertiesByPath)
  }, [filePropertiesByPath])

  const changeFileContent = (path: string, content: StoredFileContent) => {
    setFileContentsByPath((current) => ({ ...current, [path]: content }))
  }
  const changeFileProperties = (path: string, properties: FilePropertyState) => {
    setFilePropertiesByPath((current) => ({ ...current, [path]: properties }))
  }
  const isFileFavorite = (path: string) => favoriteGroups.some((group) => group.items.some((item) => item.id === path || item.subtitle === path))
  const toggleFileFavorite = (file: FileOpenSample) => {
    setFavoriteGroups((current) => {
      const exists = current.some((group) => group.items.some((item) => item.id === file.path || item.subtitle === file.path))
      if (exists) {
        return current.map((group) => ({
          ...group,
          items: group.items.filter((item) => item.id !== file.path && item.subtitle !== file.path),
        }))
      }
      const fileFavorite: ListItem = {
        id: file.path,
        title: file.name,
        subtitle: file.path,
        meta: 'Now',
        icon: file.icon,
      }
      return current.map((group, index) => (
        index === 0 ? { ...group, items: [fileFavorite, ...group.items] } : group
      ))
    })
  }

  return (
    <div className="prototype-page light">
      <div className="principle-badge">Mindset prototype · chat-first</div>
      <div
        className={`prototype-shell${activeModule === 'files' && !filesDetailOpen ? ' files-detail-collapsed' : ''}`}
        data-module={activeModule}
      >
        <Sidebar
          activeModule={activeModule}
          onChangeModule={setActiveModule}
          onOpenSecondary={(surface) => {
            if (surface === 'chatFiles') setChatFilesOpen(true)
            if (surface === 'keys') setKeysOpen(true)
            if (surface === 'models') setModelsOpen(true)
            if (surface === 'settings') setSettingsOpen(true)
          }}
        />
        <ModuleSurface
          activeModule={activeModule}
          pendingCount={pendingCount}
          approvalStatus={approvalStatus}
          onApprove={() => setApprovalStatus('approved')}
          onDeny={() => setApprovalStatus('denied')}
          onOpenInbox={() => setInboxOpen(true)}
          structuredView={structuredView}
          onChangeStructuredView={setStructuredView}
          filesDetailOpen={filesDetailOpen}
          onToggleFilesDetail={() => setFilesDetailOpen((open) => !open)}
          onCloseFilesDetail={() => setFilesDetailOpen(false)}
          filesSelection={filesSelection}
          onSelectFile={setFilesSelection}
          favoriteGroups={favoriteGroups}
          fileContentsByPath={fileContentsByPath}
          filePropertiesByPath={filePropertiesByPath}
          isFileFavorite={isFileFavorite}
          onChangeFileContent={changeFileContent}
          onChangeFileProperties={changeFileProperties}
          onToggleFileFavorite={toggleFileFavorite}
        />
        <InboxSheet
          open={inboxOpen}
          items={inboxItems}
          approvalStatus={approvalStatus}
          onApprove={() => setApprovalStatus('approved')}
          onDeny={() => setApprovalStatus('denied')}
          onClose={() => setInboxOpen(false)}
        />
        <ChatFilesDialog open={chatFilesOpen} onClose={() => setChatFilesOpen(false)} />
        <KeysDialog open={keysOpen} onClose={() => setKeysOpen(false)} />
        <ModelsDialog open={modelsOpen} onClose={() => setModelsOpen(false)} />
        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PrototypeApp />
  </React.StrictMode>,
)
