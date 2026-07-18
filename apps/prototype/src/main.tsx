import React, { useEffect, useRef, useState } from 'react'
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
  Cloud,
  Contact,
  ExternalLink,
  Download,
  FileArchive,
  FileText,
  Folder,
  FolderOpen,
  Home,
  Image,
  Info,
  Link2,
  LockKeyhole,
  List,
  ListFilter,
  LogOut,
  Menu,
  MessageSquare,
  Mic,
  MonitorCog,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
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
  Wrench,
} from 'lucide-react'
import '../../web/src/index.css'
import './prototype.css'
import { FilesDetail, FilesMain } from './files/FilesModule'
import { FilesWorkspace } from './files/FilesWorkspace'
import { FilesBrowser } from './files/FilesBrowser'
import type { FilesFolderId } from './files/files-types'
import { ConfirmSheet, EmptyState, useDismissable, usePopover } from './shared/ui'
import { readPrototypeStorage, writePrototypeStorage } from './files/prototypeStorage'
import type { FilePropertyState } from './files/FileEditorSheet'
import type {
  ChatFileItem,
  FileOpenSample,
  FilesSelection,
  FolderChildItem,
  IconType,
  StoredFileContent,
  StructuredView,
} from './files/files-types'

type ModuleId = 'chat' | 'contacts' | 'files' | 'favorites'
type InboxItemStatus = 'pending' | 'approved' | 'denied'
type SettingsSection = 'general' | 'models' | 'runtime' | 'network' | 'about'
type FavoriteTab = '全部' | '消息' | '文件' | '链接' | '联系人'
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

interface ToastItem {
  id: number
  title: string
  kind: 'ok' | 'err'
}

const navItems: NavItem[] = [
  { id: 'chat', label: '聊天', icon: MessageSquare },
  { id: 'contacts', label: '联系人', icon: Contact },
  { id: 'files', label: '文件', icon: FolderOpen },
  { id: 'favorites', label: '收藏', icon: Star },
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

const favoriteTypeByTab: Record<Exclude<FavoriteTab, '全部'>, string> = {
  消息: 'msg',
  文件: 'file',
  链接: 'link',
  联系人: 'contact',
}

const favoriteTypeOf = (item: ListItem): string => {
  if (item.icon === MessageSquare) return 'msg'
  if (item.icon === Link2) return 'link'
  if (item.icon === UsersRound || item.icon === UserRound || item.icon === Contact || item.icon === Bot) return 'contact'
  return 'file'
}

const initialFavorites: Array<{ group: string; items: ListItem[] }> = [
  {
    group: '今天',
    items: [
      { id: 'rule', title: 'Secretary 初始化规则', subtitle: 'AI Secretary · 今天 09:41', meta: '09:41', icon: MessageSquare, active: true },
      { id: 'ui', title: 'UI layout reference.png', subtitle: '/files/images/', meta: '09:30', icon: Image },
      { id: 'figma', title: 'Login flow - Figma', subtitle: 'figma.com/file/abc123', meta: '09:12', icon: Link2 },
    ],
  },
  {
    group: '昨天',
    items: [
      { id: 'tunnel', title: 'tunnel.md', subtitle: '/files/docs/', meta: 'Tue 16:22', icon: FileText },
      { id: 'cloudflare', title: 'Cloudflare Tunnel setup', subtitle: 'developers.cloudflare.com', meta: 'Tue 15:48', icon: Link2 },
    ],
  },
  {
    group: '本周',
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
    runtimeState: '使用中',
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
    runtimeState: '已限流',
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
    runtimeState: '服务错误',
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
  onOpenSettings,
  onRequestSignOut,
}: {
  activeModule: ModuleId
  onChangeModule: (module: ModuleId) => void
  onOpenSettings: (section: SettingsSection) => void
  onRequestSignOut: () => void
}) {
  const settingsMenu = usePopover('.rail-menu')

  const settingsItems: Array<{ label: string; icon: IconType; section: SettingsSection }> = [
    { label: '通用设置', icon: Settings, section: 'general' },
    { label: '模型服务', icon: Bot, section: 'models' },
    { label: '服务管理', icon: Wrench, section: 'runtime' },
    { label: '关于', icon: Info, section: 'about' },
  ]

  return (
    <aside className="side-rail">
      <button className="profile-dot" aria-label="个人资料" title="gan@undefineds.co">
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
      <button
        className="space-badge"
        title="当前空间：云端空间 · Pod 已同步"
        aria-label="当前空间：云端空间，Pod 已同步"
        onClick={() => onOpenSettings('runtime')}
      >
        <Cloud size={16} />
        <i />
      </button>
      <div className="rail-menu">
        {settingsMenu.open ? (
          <div className="rail-menu-popover open" role="menu" aria-label="设置菜单">
            <div className="rail-menu-account">
              <strong>gan@undefineds.co</strong>
              <span>云端空间 · Pod 已同步</span>
            </div>
            {settingsItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.label}
                  role="menuitem"
                  onClick={() => {
                    settingsMenu.close()
                    onOpenSettings(item.section)
                  }}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </button>
              )
            })}
            <div className="rail-menu-divider" />
            <button
              role="menuitem"
              className="destructive"
              onClick={() => {
                settingsMenu.close()
                onRequestSignOut()
              }}
            >
              <LogOut size={16} />
              <span>退出登录</span>
            </button>
          </div>
        ) : null}
        <button
          aria-label="设置"
          title="设置"
          aria-expanded={settingsMenu.open}
          onClick={settingsMenu.toggle}
        >
          <Menu size={21} />
        </button>
      </div>
    </aside>
  )
}

function SearchHeader({
  placeholder,
  addLabel,
  filter,
}: {
  placeholder: string
  addLabel?: string
  filter?: { options: string[]; active: string; onChange: (value: string) => void }
}) {
  const filterMenu = usePopover('.list-filter-anchor')

  return (
    <header className="list-header">
      <div className="search-pill">
        <Search size={14} />
        <span>{placeholder}</span>
        <kbd>⌘K</kbd>
      </div>
      {filter ? (
        <span className="list-filter-anchor">
          <button
            className={`icon-button ${filter.active !== filter.options[0] ? 'filter-active' : ''}`}
            aria-label="筛选"
            title="筛选"
            aria-expanded={filterMenu.open}
            onClick={filterMenu.toggle}
          >
            <ListFilter size={16} />
          </button>
          {filterMenu.open ? (
            <span className="list-filter-menu" role="menu">
              {filter.options.map((option) => (
                <button
                  role="menuitem"
                  className={option === filter.active ? 'active' : ''}
                  key={option}
                  onClick={() => {
                    filter.onChange(option)
                    filterMenu.close()
                  }}
                >
                  <span className="chk">{option === filter.active ? <Check size={13} /> : null}</span>
                  <span>{option}</span>
                </button>
              ))}
            </span>
          ) : null}
        </span>
      ) : null}
      {addLabel ? (
        <button className="icon-button" aria-label={addLabel} title={addLabel}>
          <Plus size={17} />
        </button>
      ) : null}
    </header>
  )
}

function ListRow({
  item,
  dense = false,
  selected,
  onSelect,
  rowRef,
}: {
  item: ListItem
  dense?: boolean
  selected?: boolean
  onSelect?: () => void
  rowRef?: (el: HTMLButtonElement | null) => void
}) {
  const Icon = item.icon
  return (
    <button
      className={`list-row ${selected ?? item.active ? 'active' : ''} ${item.muted ? 'muted' : ''} ${dense ? 'dense' : ''}`}
      onClick={onSelect}
      ref={rowRef}
      tabIndex={selected ? 0 : -1}
    >
      <AvatarMark icon={Icon} active={selected ?? item.active} />
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

function TopTools({
  pendingCount,
  onOpenInbox,
  detailOpen,
  onToggleDetail,
}: {
  pendingCount: number
  onOpenInbox: () => void
  detailOpen?: boolean
  onToggleDetail?: () => void
}) {
  return (
    <div className="top-tools">
      <button className="icon-button" aria-label={`收件箱，${pendingCount} 待处理`} title="收件箱" onClick={onOpenInbox}>
        <Bell size={16} />
        {pendingCount > 0 ? <i className="bell-count">{pendingCount}</i> : null}
      </button>
      {onToggleDetail ? (
        <button
          className="icon-button"
          aria-label={detailOpen ? '收起侧边栏' : '展开侧边栏'}
          title={detailOpen ? '收起侧边栏' : '展开侧边栏'}
          aria-pressed={detailOpen}
          onClick={onToggleDetail}
        >
          {detailOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
        </button>
      ) : null}
      <button className="icon-button" aria-label="更多">
        <MoreHorizontal size={17} />
      </button>
    </div>
  )
}

function ChatList({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  const rowsRef = useRef<Array<HTMLButtonElement | null>>([])

  const moveSelection = (currentIndex: number, delta: number) => {
    const nextIndex = Math.min(Math.max(currentIndex + delta, 0), chats.length - 1)
    if (nextIndex === currentIndex) return
    const next = chats[nextIndex]
    onSelect(next.id)
    window.setTimeout(() => rowsRef.current[nextIndex]?.focus(), 0)
  }

  return (
    <section className="list-pane">
      <SearchHeader placeholder="搜索会话、Thread 或 Workspace" addLabel="新建会话" />
      <div
        className="list-scroll"
        role="listbox"
        aria-label="会话列表"
        onKeyDown={(event) => {
          const currentIndex = chats.findIndex((chat) => chat.id === selectedId)
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            moveSelection(currentIndex, 1)
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            moveSelection(currentIndex, -1)
          }
        }}
      >
        {chats.map((chat, index) => (
          <ListRow
            item={chat}
            key={chat.id}
            selected={chat.id === selectedId}
            onSelect={() => onSelect(chat.id)}
            rowRef={(el) => { rowsRef.current[index] = el }}
          />
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

function SecretaryWelcome({ onOpenInbox }: { onOpenInbox: () => void }) {
  return (
    <article className="message-card secretary welcome-card">
      <AvatarMark icon={Bot} active />
      <div>
        <strong>早上好。我是 AI Secretary，你的默认助手。</strong>
        <ul>
          <li><FolderOpen size={14} /> 工作现场已就绪：linx-prototype · undefinedsco/LinX</li>
          <li><Cloud size={14} /> 数据保存在云端空间，Pod 已同步</li>
          <li><Check size={14} /> Session 会绑定 Agent、Thread 和 Workspace</li>
        </ul>
        <div className="starter-actions">
          <button>整理今天的链接</button>
          <button>继续上次任务</button>
          <button onClick={onOpenInbox}>查看待审批</button>
        </div>
        <time>09:41</time>
      </div>
    </article>
  )
}

function AiStateStrips({ onOpenInbox, onRetry }: { onOpenInbox: () => void; onRetry: () => void }) {
  const [retrying, setRetrying] = useState(false)
  return (
    <>
      <div className="ai-state-strip error" role="alert">
        <span className="strip-label">中断</span>
        <span className="strip-text">模型请求超时（gateway）</span>
        <button
          onClick={() => {
            if (retrying) return
            setRetrying(true)
            window.setTimeout(() => {
              setRetrying(false)
              onRetry()
            }, 900)
          }}
        >
          {retrying ? '重试中…' : '重试'}
        </button>
      </div>
      <div className="ai-state-strip waiting" role="status">
        <span className="strip-spinner" />
        <span className="strip-text">等待处理 · 运行时请求了一个工具调用，已转入收件箱</span>
        <button onClick={onOpenInbox}>查看</button>
      </div>
    </>
  )
}

function ChatMain({
  selectedChat,
  pendingCount,
  approvalStatus,
  onApprove,
  onDeny,
  onOpenInbox,
  detailOpen,
  onToggleDetail,
  notify,
}: {
  selectedChat: string
  pendingCount: number
  approvalStatus: InboxItemStatus
  onApprove: () => void
  onDeny: () => void
  onOpenInbox: () => void
  detailOpen?: boolean
  onToggleDetail?: () => void
  notify: (title: string, kind?: 'ok' | 'err') => void
}) {
  const isSecretary = selectedChat === 'secretary'
  const chatMeta = chats.find((chat) => chat.id === selectedChat) ?? chats[0]

  return (
    <main className="work-pane chat-work">
      <header className="work-header">
        <div>
          <h1>{chatMeta.title}</h1>
          <p>{isSecretary ? '默认助手 · 当前 Thread「原型调整」 · 云端空间已同步' : '云端空间已同步'}</p>
        </div>
        <TopTools pendingCount={pendingCount} onOpenInbox={onOpenInbox} detailOpen={detailOpen} onToggleDetail={onToggleDetail} />
      </header>
      {isSecretary ? (
        <section className="chat-stage">
          <div className="day-label">今天</div>
          <SecretaryWelcome onOpenInbox={onOpenInbox} />
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
          <AiStateStrips onOpenInbox={onOpenInbox} onRetry={() => notify('已重试 · 请求已重新发送')} />
        </section>
      ) : (
        <section className="chat-stage">
          <div className="day-label">今天</div>
          <article className="message-card secretary">
            <AvatarMark icon={chatMeta.icon} />
            <div>
              <strong>{chatMeta.title}</strong>
              <p style={{ margin: 0, color: 'var(--proto-ink-soft)', fontSize: 13 }}>{chatMeta.subtitle}。这个会话还没有新消息，直接输入即可开始。</p>
              <time>09:30</time>
            </div>
          </article>
        </section>
      )}
      <footer className="composer-card">
        <div className="composer-input" contentEditable suppressContentEditableWarning data-placeholder={`发消息给 ${chatMeta.title}，或把链接、文件、任务直接丢进来`} />
        <div className="composer-actions">
          <button aria-label="添加附件"><Paperclip size={16} /></button>
          <button aria-label="添加图片"><Image size={16} /></button>
          <button aria-label="保存链接"><Link2 size={16} /></button>
          <button aria-label="添加标签"><Tags size={16} /></button>
          <button aria-label="语音输入"><Mic size={16} /></button>
          <button className="send" aria-label="发送" onClick={() => notify('消息已发送')}><SendHorizontal size={16} /></button>
        </div>
      </footer>
    </main>
  )
}

function ChatDetail({ onOpenChatFiles }: { onOpenChatFiles: () => void }) {
  return (
    <aside className="detail-pane">
      <section className="identity-card">
        <AvatarMark icon={Bot} active />
        <h2>AI Secretary</h2>
        <p>默认 Agent · 不可删除</p>
        <button>改名</button>
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
        <button className="wide-action" onClick={onOpenChatFiles}><FileArchive size={15} /> 聊天文件</button>
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

function ContactsMain({
  pendingCount,
  onOpenInbox,
  detailOpen,
  onToggleDetail,
}: {
  pendingCount: number
  onOpenInbox: () => void
  detailOpen?: boolean
  onToggleDetail?: () => void
}) {
  return (
    <main className="work-pane contact-work">
      <header className="work-header">
        <div>
          <h1>AI Secretary</h1>
          <p>默认助手 · 联系人投影</p>
        </div>
        <TopTools pendingCount={pendingCount} onOpenInbox={onOpenInbox} detailOpen={detailOpen} onToggleDetail={onToggleDetail} />
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
        <button><Sparkles size={16} /> 改名</button>
        <button><Star size={16} /> 收藏</button>
      </div>
      <section className="info-table">
        <InfoRow label="Contact" value="/.data/contacts/ai-secretary.ttl" />
        <InfoRow label="Agent" value="/.data/agents/secretary/profile.ttl" />
        <InfoRow label="Agent Home" value="/.data/agents/secretary/" />
        <InfoRow label="聊天模型" value="linx-lite" />
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

function FavoritesList({
  favoriteGroups,
  activeTab,
  onChangeTab,
  selectedId,
  onSelect,
}: {
  favoriteGroups: Array<{ group: string; items: ListItem[] }>
  activeTab: FavoriteTab
  onChangeTab: (tab: FavoriteTab) => void
  selectedId: string | null
  onSelect: (item: ListItem) => void
}) {
  const tabs: FavoriteTab[] = ['全部', '消息', '文件', '链接', '联系人']
  const filteredGroups = favoriteGroups
    .map((group) => ({
      ...group,
      items: activeTab === '全部' ? group.items : group.items.filter((item) => favoriteTypeOf(item) === favoriteTypeByTab[activeTab]),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <section className="list-pane">
      <SearchHeader
        placeholder="搜索收藏"
        filter={{ options: tabs, active: activeTab, onChange: (value) => onChangeTab(value as FavoriteTab) }}
      />
      <div className="list-scroll grouped">
        {filteredGroups.length === 0 ? (
          <div className="list-empty-hint">
            <p>这一类还没有收藏。</p>
          </div>
        ) : (
          filteredGroups.map((group) => (
            <div className="row-group" key={group.group}>
              <h3>{group.group}</h3>
              {group.items.map((item) => (
                <ListRow dense item={item} key={item.id} selected={item.id === selectedId} onSelect={() => onSelect(item)} />
              ))}
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function FavoritesMain({
  selected,
  pendingCount,
  onOpenInbox,
  onGoFiles,
}: {
  selected: ListItem | null
  pendingCount: number
  onOpenInbox: () => void
  onGoFiles: () => void
}) {
  if (!selected) {
    return (
      <main className="work-pane favorites-work">
        <header className="work-header">
          <div>
            <h1>收藏</h1>
            <p>回到原消息、原文件、原联系人</p>
          </div>
          <TopTools pendingCount={pendingCount} onOpenInbox={onOpenInbox} />
        </header>
        <EmptyState
          icon={Star}
          title="在聊天、文件或联系人里点星标"
          description="收藏的内容会出现在这里，并能回到它们原来的位置。"
          action={<button className="wide-action strong" onClick={onGoFiles}>去看看文件</button>}
        />
      </main>
    )
  }

  const Icon = selected.icon
  return (
    <main className="work-pane favorites-work">
      <header className="work-header">
        <div>
          <h1>{selected.title}</h1>
          <p>{selected.subtitle}</p>
        </div>
        <TopTools pendingCount={pendingCount} onOpenInbox={onOpenInbox} />
      </header>
      <section className="favorite-detail-body">
        <section className="identity-card saved-identity">
          <AvatarMark icon={Icon} active />
          <h2>{selected.title}</h2>
          <p>{selected.subtitle}</p>
        </section>
        <section className="detail-card">
          <h3>回到原处</h3>
          <DetailLine icon={MessageSquare} label="来源" value={selected.subtitle} />
          <DetailLine icon={Clock3} label="收藏时间" value={selected.meta} />
        </section>
        <section className="detail-card">
          <h3>标签</h3>
          <div className="tag-cloud">
            <span>规则</span>
            <span>助手</span>
            <span>默认设置</span>
            <span>+</span>
          </div>
        </section>
        <div className="primary-actions">
          <button className="primary"><MessageSquare size={15} /> 回到来源</button>
          <button><Star size={15} /> 取消收藏</button>
        </div>
      </section>
    </main>
  )
}

function ChatFilesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  useDismissable(open, onClose)
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
  useDismissable(open, onClose)
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
              <span>{activeStatus === 'pending' ? '2 待处理' : '1 待处理'}</span>
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
              <DetailLine icon={ShieldCheck} label="类型" value="审批" />
              <DetailLine icon={Clock3} label="时间" value={activeItem.time} />
              <DetailLine icon={Bot} label="来源" value="AI Secretary" />
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

const settingsNavItems: Array<{ section: SettingsSection; label: string; desc: string; icon: IconType }> = [
  { section: 'general', label: '通用', desc: '账号、外观与常用入口', icon: Settings },
  { section: 'models', label: '模型服务', desc: '提供商、密钥与模型路由', icon: Bot },
  { section: 'runtime', label: '运行环境', desc: '当前壳与本地服务', icon: MonitorCog },
  { section: 'network', label: '本地网络', desc: '域名、隧道与可达性', icon: Home },
  { section: 'about', label: '关于', desc: '版本与更新', icon: Info },
]

function SettingsDialog({
  open,
  section,
  onChangeSection,
  onClose,
  notify,
}: {
  open: boolean
  section: SettingsSection
  onChangeSection: (section: SettingsSection) => void
  onClose: () => void
  notify: (title: string, kind?: 'ok' | 'err') => void
}) {
  const [serviceRunning, setServiceRunning] = useState(true)
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false)
  useDismissable(open, onClose)
  if (!open) return null

  const activeNav = settingsNavItems.find((item) => item.section === section) ?? settingsNavItems[0]

  return (
    <div className="modal-layer settings-layer" role="dialog" aria-label="设置">
      <button className="modal-backdrop" aria-label="关闭设置" onClick={onClose} />
      <section className="modal-panel settings-panel">
        <header className="modal-header">
          <div>
            <h2>设置</h2>
            <p>{activeNav.desc}</p>
          </div>
          <button className="icon-button" aria-label="关闭设置弹窗" onClick={onClose}>
            <ChevronRight size={17} />
          </button>
        </header>
        <div className="settings-three-column">
          <aside className="settings-nav-column">
            <div className="settings-nav-title">设置</div>
            {settingsNavItems.map((item) => {
              const Icon = item.icon
              return (
                <button className={item.section === section ? 'active' : ''} key={item.section} onClick={() => onChangeSection(item.section)}>
                  <Icon size={15} />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </aside>
          <main className="settings-main-column">
            {section === 'general' ? (
              <>
                <section className="settings-section-card">
                  <div className="settings-section-header">
                    <div>
                      <h3>账号</h3>
                      <p>登录状态、Pod 状态和基础资料。</p>
                    </div>
                  </div>
                  <div className="settings-info-list">
                    <InfoRow label="Account" value="gan@undefineds.co" />
                    <InfoRow label="Provider" value="undefineds 账号" />
                    <InfoRow label="数据空间" value="云端空间" />
                    <InfoRow label="Pod" value="已同步" />
                  </div>
                </section>
                <section className="settings-section-card">
                  <div className="settings-section-header">
                    <div>
                      <h3>外观</h3>
                      <p>主题跟随系统，强调色仅用于状态与当前位置。</p>
                    </div>
                  </div>
                  <div className="settings-info-list">
                    <InfoRow label="主题" value="跟随系统" />
                    <InfoRow label="密度" value="桌面紧凑" />
                  </div>
                </section>
              </>
            ) : null}
            {section === 'models' ? (
              <>
                {['OpenAI', 'RightCodes', 'OpenAI-compatible'].map((provider) => (
                  <section className="settings-section-card" key={provider}>
                    <div className="settings-section-header">
                      <div>
                        <h3>{provider}</h3>
                        <p>连接配置与可用模型；API Key 保存在你的私有 Pod 设置中。</p>
                      </div>
                      <button onClick={() => notify('连接成功，已同步 3 个模型')}>验证</button>
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
              </>
            ) : null}
            {section === 'runtime' ? (
              <>
                <section className="settings-section-card">
                  <div className="settings-section-header">
                    <div>
                      <h3>运行环境</h3>
                      <p>当前壳、认证方式，以及与本地服务相关的入口。</p>
                    </div>
                  </div>
                  <div className="runtime-env">
                    <span className="env-badge"><MonitorCog size={12} /> Web</span>
                    <span className="env-badge ok">Solid Pod 登录</span>
                    <span className="env-badge ok">云端空间 · Pod 已同步</span>
                  </div>
                  <div className="settings-info-list">
                    <InfoRow label="Shell" value="Browser shell + shared web app" />
                    <InfoRow label="认证" value="Solid Pod 登录" />
                  </div>
                </section>
                <section className="settings-section-card">
                  <div className="settings-section-header">
                    <div>
                      <h3>本地服务</h3>
                      <p>本机空间的文件、会话与同步都依赖这个服务。</p>
                    </div>
                  </div>
                  <div className="service-row">
                    <span className={`status-pill ${serviceRunning ? 'approved' : 'denied'}`}>{serviceRunning ? '本地服务运行中' : '已停止'}</span>
                    <button className="wide-action" onClick={() => notify('正在重启本地服务…')}>重启</button>
                    <button className="wide-action danger" onClick={() => setStopConfirmOpen(true)}>停止服务</button>
                  </div>
                </section>
              </>
            ) : null}
            {section === 'network' ? (
              <section className="settings-section-card">
                <div className="settings-section-header">
                  <div>
                    <h3>本地网络</h3>
                    <p>可记录多个访问配置，但同一时间只有一个生效配置。</p>
                  </div>
                </div>
                <div className="settings-info-list">
                  <InfoRow label="Local" value="仅本机 · 无需公网可达" />
                  <InfoRow label="LAN" value="局域网 · 192.168.1.8" />
                  <InfoRow label="Tunnel" value="node-0000.undefineds.co · 生效中" />
                </div>
                <p className="settings-note">切换配置会先停止旧配置、启动新配置，并验证可达性。</p>
              </section>
            ) : null}
            {section === 'about' ? (
              <section className="settings-section-card">
                <div className="settings-section-header">
                  <div>
                    <h3>关于 LinX</h3>
                    <p>版本与更新。</p>
                  </div>
                  <button onClick={() => notify('已是最新版本')}>检查更新</button>
                </div>
                <div className="settings-info-list">
                  <InfoRow label="版本" value="0.2.45 (prototype)" />
                  <InfoRow label="Runtime" value="xpod 0.3.52" />
                </div>
              </section>
            ) : null}
          </main>
          <aside className="settings-detail-column">
            {section === 'models' ? (
              <>
                <section className="settings-detail-card">
                  <h3>默认策略</h3>
                  <DetailLine icon={Check} label="默认模型" value="gpt-5.5" />
                  <DetailLine icon={LockKeyhole} label="密钥" value="OpenAI Team Key" />
                  <DetailLine icon={Sparkles} label="回退策略" value="轮询可用模型" />
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
              </>
            ) : (
              <>
                <section className="settings-detail-card">
                  <h3>当前状态</h3>
                  <DetailLine icon={Check} label="Login" value="Active" />
                  <DetailLine icon={Cloud} label="空间" value="云端 · 已同步" />
                  <DetailLine icon={Bell} label="Notice" value="Enabled" />
                </section>
                <section className="settings-detail-card compact">
                  <h3>边界</h3>
                  <p>设置不管理供应商；供应商只是密钥和模型页面里的分组。</p>
                </section>
              </>
            )}
          </aside>
        </div>
        {stopConfirmOpen ? (
          <ConfirmSheet
            title="停止本地服务？"
            description="停止后本机空间的文件、会话与同步将不可用，需要手动重新启动。"
            confirmLabel="停止服务"
            destructive
            onCancel={() => setStopConfirmOpen(false)}
            onConfirm={() => {
              setStopConfirmOpen(false)
              setServiceRunning(false)
              notify('已停止本地服务', 'err')
            }}
          />
        ) : null}
      </section>
    </div>
  )
}

function ToastHost({ toasts }: { toasts: ToastItem[] }) {
  if (toasts.length === 0) return null
  return (
    <div className="toast-host" aria-live="polite">
      {toasts.map((toast) => (
        <div className={`toast ${toast.kind}`} key={toast.id}>
          <span className="toast-ico">{toast.kind === 'err' ? '!' : '✓'}</span>
          <span>{toast.title}</span>
        </div>
      ))}
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
  selectedChat,
  onSelectChat,
  selectedFavorite,
  onSelectFavorite,
  favoriteTab,
  onChangeFavoriteTab,
  pendingCount,
  approvalStatus,
  onApprove,
  onDeny,
  onOpenInbox,
  onOpenChatFiles,
  structuredView,
  onChangeStructuredView,
  detailPaneOpen,
  onToggleDetailPane,
  filesDetailOpen,
  onToggleFilesDetail,
  onCloseFilesDetail,
  filesSelection,
  onSelectFile,
  filesFolder,
  onNavigateFolder,
  openedChild,
  favoriteGroups,
  fileContentsByPath,
  filePropertiesByPath,
  isFileFavorite,
  onChangeFileContent,
  onChangeFileProperties,
  onToggleFileFavorite,
  onGoFiles,
  notify,
}: {
  activeModule: ModuleId
  selectedChat: string
  onSelectChat: (id: string) => void
  selectedFavorite: ListItem | null
  onSelectFavorite: (item: ListItem | null) => void
  favoriteTab: FavoriteTab
  onChangeFavoriteTab: (tab: FavoriteTab) => void
  pendingCount: number
  approvalStatus: InboxItemStatus
  onApprove: () => void
  onDeny: () => void
  onOpenInbox: () => void
  onOpenChatFiles: () => void
  structuredView: StructuredView
  onChangeStructuredView: (view: StructuredView) => void
  detailPaneOpen: boolean
  onToggleDetailPane: () => void
  filesDetailOpen: boolean
  onToggleFilesDetail: () => void
  onCloseFilesDetail: () => void
  filesSelection: FilesSelection
  onSelectFile: (selection: FilesSelection, child?: FolderChildItem) => void
  filesFolder: FilesFolderId
  onNavigateFolder: (folder: FilesFolderId) => void
  openedChild: FolderChildItem | null
  favoriteGroups: Array<{ group: string; items: ListItem[] }>
  fileContentsByPath: Record<string, StoredFileContent>
  filePropertiesByPath: Record<string, FilePropertyState>
  isFileFavorite: (path: string) => boolean
  onChangeFileContent: (path: string, content: StoredFileContent) => void
  onChangeFileProperties: (path: string, properties: FilePropertyState) => void
  onToggleFileFavorite: (file: FileOpenSample) => void
  onGoFiles: () => void
  notify: (title: string, kind?: 'ok' | 'err') => void
}) {
  const [filesMobileTreeOpen, setFilesMobileTreeOpen] = useState(false)

  useEffect(() => {
    if (activeModule !== 'files') setFilesMobileTreeOpen(false)
  }, [activeModule])

  useEffect(() => {
    setFilesMobileTreeOpen(false)
  }, [filesSelection, filesFolder])

  if (activeModule === 'contacts') {
    return (
      <>
        <ContactsList />
        <ContactsMain pendingCount={pendingCount} onOpenInbox={onOpenInbox} detailOpen={detailPaneOpen} onToggleDetail={onToggleDetailPane} />
        {detailPaneOpen ? <ContactsDetail /> : null}
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
          <FilesBrowser
            mobileOpen={filesMobileTreeOpen}
            onMobileClose={() => setFilesMobileTreeOpen(false)}
            folder={filesFolder}
            selection={filesSelection}
            openedChildName={openedChild?.name ?? null}
            onNavigate={onNavigateFolder}
            onSelect={onSelectFile}
            isFileFavorite={isFileFavorite}
            onToggleFileFavorite={onToggleFileFavorite}
            notify={notify}
          />
        )}
        main={
          <FilesMain
            selection={filesSelection}
            folder={filesFolder}
            openedChild={openedChild}
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
            onNavigateFolder={onNavigateFolder}
            isFileFavorite={isFileFavorite}
            onToggleFileFavorite={onToggleFileFavorite}
            notify={notify}
          />
        }
        detail={<FilesDetail open={filesDetailOpen} selection={filesSelection} folder={filesFolder} onClose={onCloseFilesDetail} />}
      />
    )
  }
  if (activeModule === 'favorites') {
    return (
      <>
        <FavoritesList
          favoriteGroups={favoriteGroups}
          activeTab={favoriteTab}
          onChangeTab={onChangeFavoriteTab}
          selectedId={selectedFavorite?.id ?? null}
          onSelect={onSelectFavorite}
        />
        <FavoritesMain
          selected={selectedFavorite}
          pendingCount={pendingCount}
          onOpenInbox={onOpenInbox}
          onGoFiles={onGoFiles}
        />
      </>
    )
  }
  return (
    <>
      <ChatList selectedId={selectedChat} onSelect={onSelectChat} />
      <ChatMain
        selectedChat={selectedChat}
        pendingCount={pendingCount}
        approvalStatus={approvalStatus}
        onApprove={onApprove}
        onDeny={onDeny}
        onOpenInbox={onOpenInbox}
        detailOpen={detailPaneOpen}
        onToggleDetail={onToggleDetailPane}
        notify={notify}
      />
      {detailPaneOpen ? <ChatDetail onOpenChatFiles={onOpenChatFiles} /> : null}
    </>
  )
}

function PrototypeApp() {
  const [activeModule, setActiveModule] = useState<ModuleId>('chat')
  const [listWidth, setListWidth] = useState(272)
  const [selectedChat, setSelectedChat] = useState('secretary')
  const [selectedFavorite, setSelectedFavorite] = useState<ListItem | null>(null)
  const [favoriteTab, setFavoriteTab] = useState<FavoriteTab>('全部')
  const [chatFilesOpen, setChatFilesOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general')
  const [inboxOpen, setInboxOpen] = useState(false)
  const [approvalStatus, setApprovalStatus] = useState<InboxItemStatus>('pending')
  const [structuredView, setStructuredView] = useState<StructuredView>('table')
  const [detailPaneOpen, setDetailPaneOpen] = useState(true)
  const [filesDetailOpen, setFilesDetailOpen] = useState(false)
  const [filesSelection, setFilesSelection] = useState<FilesSelection>('structuredVocab')
  const [filesFolder, setFilesFolder] = useState<FilesFolderId>('vocab')
  const [openedChild, setOpenedChild] = useState<FolderChildItem | null>(null)
  const [favoriteGroups, setFavoriteGroups] = useState(initialFavorites)
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastIdRef = useRef(0)
  const [fileContentsByPath, setFileContentsByPath] = useState<Record<string, StoredFileContent>>(() => (
    readPrototypeStorage<Record<string, StoredFileContent>>(FILE_CONTENTS_STORAGE_KEY, {})
  ))
  const [filePropertiesByPath, setFilePropertiesByPath] = useState<Record<string, FilePropertyState>>(() => (
    readPrototypeStorage<Record<string, FilePropertyState>>(FILE_PROPERTIES_STORAGE_KEY, {})
  ))
  const pendingCount = approvalStatus === 'pending' ? 2 : 1

  const notify = (title: string, kind: 'ok' | 'err' = 'ok') => {
    toastIdRef.current += 1
    const id = toastIdRef.current
    setToasts((current) => [...current.slice(-3), { id, title, kind }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 3200)
  }

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

  const startSplitterDrag = (event: React.MouseEvent) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = listWidth
    const splitter = event.currentTarget
    splitter.classList.add('dragging')
    const onMove = (moveEvent: MouseEvent) => {
      setListWidth(Math.min(480, Math.max(232, startWidth + moveEvent.clientX - startX)))
    }
    const onUp = () => {
      splitter.classList.remove('dragging')
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className="prototype-page light">
      <div className="principle-badge">Mindset prototype · chat-first</div>
      <div
        className={`prototype-shell${activeModule === 'files' && !filesDetailOpen ? ' files-detail-collapsed' : ''}${!detailPaneOpen && (activeModule === 'chat' || activeModule === 'contacts') ? ' detail-collapsed' : ''}`}
        data-module={activeModule}
        style={{ '--list-w': `${listWidth}px` } as React.CSSProperties}
      >
        <Sidebar
          activeModule={activeModule}
          onChangeModule={setActiveModule}
          onOpenSettings={(section) => {
            setSettingsSection(section)
            setSettingsOpen(true)
          }}
          onRequestSignOut={() => setSignOutConfirmOpen(true)}
        />
        <div
          className="pane-splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整列表宽度，双击恢复默认"
          title="拖动调整宽度，双击恢复默认"
          onMouseDown={startSplitterDrag}
          onDoubleClick={() => setListWidth(272)}
        />
        <ModuleSurface
          activeModule={activeModule}
          selectedChat={selectedChat}
          onSelectChat={setSelectedChat}
          selectedFavorite={selectedFavorite}
          onSelectFavorite={setSelectedFavorite}
          favoriteTab={favoriteTab}
          onChangeFavoriteTab={(tab) => {
            setFavoriteTab(tab)
            setSelectedFavorite(null)
          }}
          pendingCount={pendingCount}
          approvalStatus={approvalStatus}
          onApprove={() => {
            setApprovalStatus('approved')
            notify('已批准 · 写入 AI Secretary 个人卡片')
          }}
          onDeny={() => {
            setApprovalStatus('denied')
            notify('已拒绝 · 不会修改个人卡片', 'err')
          }}
          onOpenInbox={() => setInboxOpen(true)}
          onOpenChatFiles={() => setChatFilesOpen(true)}
          structuredView={structuredView}
          onChangeStructuredView={setStructuredView}
          detailPaneOpen={detailPaneOpen}
          onToggleDetailPane={() => setDetailPaneOpen((open) => !open)}
          filesDetailOpen={filesDetailOpen}
          onToggleFilesDetail={() => setFilesDetailOpen((open) => !open)}
          onCloseFilesDetail={() => setFilesDetailOpen(false)}
          filesSelection={filesSelection}
          onSelectFile={(selection, child) => {
            setFilesSelection(selection)
            setOpenedChild(child ?? null)
            setStructuredView('table')
          }}
          filesFolder={filesFolder}
          onNavigateFolder={(folder) => {
            setFilesFolder(folder)
            setOpenedChild(null)
            setFilesSelection(folder === 'files' ? 'folderRoot' : 'folder')
          }}
          openedChild={openedChild}
          favoriteGroups={favoriteGroups}
          fileContentsByPath={fileContentsByPath}
          filePropertiesByPath={filePropertiesByPath}
          isFileFavorite={isFileFavorite}
          onChangeFileContent={changeFileContent}
          onChangeFileProperties={changeFileProperties}
          onToggleFileFavorite={(file) => {
            const wasFavorite = isFileFavorite(file.path)
            toggleFileFavorite(file)
            notify(wasFavorite ? '已取消收藏' : '已收藏 · 在收藏模块可回到这里')
          }}
          onGoFiles={() => setActiveModule('files')}
          notify={notify}
        />
        <InboxSheet
          open={inboxOpen}
          items={inboxItems}
          approvalStatus={approvalStatus}
          onApprove={() => {
            setApprovalStatus('approved')
            notify('已批准 · 写入 AI Secretary 个人卡片')
          }}
          onDeny={() => {
            setApprovalStatus('denied')
            notify('已拒绝 · 不会修改个人卡片', 'err')
          }}
          onClose={() => setInboxOpen(false)}
        />
        <ChatFilesDialog open={chatFilesOpen} onClose={() => setChatFilesOpen(false)} />
        <SettingsDialog
          open={settingsOpen}
          section={settingsSection}
          onChangeSection={setSettingsSection}
          onClose={() => setSettingsOpen(false)}
          notify={notify}
        />
        {signOutConfirmOpen ? (
          <ConfirmSheet
            title="退出登录？"
            description="将断开与当前空间的连接。未同步的修改会保留在本机，下次登录后继续。"
            confirmLabel="退出登录"
            destructive
            onCancel={() => setSignOutConfirmOpen(false)}
            onConfirm={() => {
              setSignOutConfirmOpen(false)
              notify('已退出登录')
            }}
          />
        ) : null}
        <ToastHost toasts={toasts} />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PrototypeApp />
  </React.StrictMode>,
)
