import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Archive,
  Bell,
  Bot,
  Check,
  ChevronRight,
  Clock3,
  Contact,
  Download,
  FileArchive,
  FileText,
  Folder,
  FolderOpen,
  Home,
  Image,
  Link2,
  LockKeyhole,
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

type ModuleId = 'chat' | 'contacts' | 'files' | 'favorites'

type IconType = typeof MessageSquare

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

interface FileRow {
  name: string
  type: string
  size: string
  modified: string
  permission: string
  icon: IconType
  active?: boolean
}

const navItems: NavItem[] = [
  { id: 'chat', label: '聊天', icon: MessageSquare },
  { id: 'contacts', label: '联系人', icon: Contact },
  { id: 'files', label: '文件', icon: FolderOpen },
  { id: 'favorites', label: '收藏', icon: Star },
]

const menuItems = [
  { label: '聊天文件', icon: FileArchive },
  { label: '聊天记录管理', icon: FileText },
  { label: '锁定', icon: LockKeyhole },
  { label: '设置', icon: Settings },
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

const fileLocations: Array<{ label: string; icon: IconType; active?: boolean }> = [
  { label: 'Pod Home', icon: Home },
  { label: '.data', icon: FolderOpen, active: true },
  { label: 'Recent', icon: Clock3 },
  { label: 'Favorites', icon: Star },
  { label: 'Shared', icon: UsersRound },
]

const fileRows: FileRow[] = [
  { name: 'agents/', type: 'Container', size: '3 agents', modified: 'Today 09:45', permission: 'Private', icon: Folder },
  { name: 'agents/secretary/', type: 'Agent home', size: '8 items', modified: 'Today 09:44', permission: 'Private', icon: Bot, active: true },
  { name: 'workspaces/linx-prototype/', type: 'Workspace', size: '.meta', modified: 'Today 09:42', permission: 'Private', icon: FolderOpen },
  { name: 'repositories/linx.ttl', type: 'Repository', size: '4 KB', modified: 'Today 09:40', permission: 'Private', icon: FileText },
  { name: 'chat/', type: 'Container', size: '12 items', modified: 'Today 09:36', permission: 'Private', icon: MessageSquare },
  { name: 'files/', type: 'Container', size: '42 items', modified: 'Apr 21', permission: 'Private', icon: FileArchive },
]

const favorites: Array<{ group: string; items: ListItem[] }> = [
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
}: {
  activeModule: ModuleId
  onChangeModule: (module: ModuleId) => void
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
              <button key={item.label} role="menuitem">
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

function TopTools() {
  return (
    <div className="top-tools">
      <button className="icon-button" aria-label="消息中心">
        <Bell size={16} />
        <i />
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

function ChatMain() {
  return (
    <main className="work-pane chat-work">
      <header className="work-header">
        <div>
          <h1>AI Secretary</h1>
          <p>当前 Thread · 默认助手 · Pod 已同步</p>
        </div>
        <TopTools />
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

function ContactsMain() {
  return (
    <main className="work-pane contact-work">
      <header className="work-header">
        <div>
          <h1>AI Secretary</h1>
          <p>联系人投影，链接到默认 Agent</p>
        </div>
        <TopTools />
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

function FilesList() {
  return (
    <section className="list-pane tree-pane">
      <div className="tree-title">Files</div>
      <div className="tree-section">
        <h3>Locations</h3>
        {fileLocations.map((item) => {
          const Icon = item.icon
          return (
            <button className={item.active ? 'active' : ''} key={item.label}>
              <Icon size={15} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>
      <div className="tree-section">
        <h3>Containers</h3>
        {['/', '.data/', 'agents/', 'secretary/', 'workspaces/', 'linx-prototype/', 'repositories/', 'chat/', 'files/'].map((label, index) => (
          <button className={label === 'secretary/' ? 'active nested' : index > 1 ? 'nested' : ''} key={label}>
            <Folder size={15} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function FilesMain() {
  return (
    <main className="work-pane files-work">
      <header className="work-header">
        <div>
          <h1>Files</h1>
          <p>Pod / .data / agents / secretary</p>
        </div>
        <div className="file-actions">
          <button><FolderOpen size={15} /></button>
          <button className="primary"><Upload size={15} /> Upload</button>
          <button><MoreHorizontal size={16} /></button>
        </div>
      </header>
      <section className="file-table">
        <div className="file-head">
          <span>Name</span>
          <span>Kind</span>
          <span>Size</span>
          <span>Modified</span>
          <span>Permission</span>
        </div>
        {fileRows.map((row) => {
          const Icon = row.icon
          return (
            <button className={row.active ? 'active' : ''} key={row.name}>
              <span className="file-name"><Icon size={16} /> {row.name}</span>
              <span>{row.type}</span>
              <span>{row.size}</span>
              <span>{row.modified}</span>
              <span>{row.permission}</span>
            </button>
          )
        })}
      </section>
      <footer className="table-status">6 items · Finder view · Repository 只是元数据，Workspace 才是工作区</footer>
    </main>
  )
}

function FilesDetail() {
  return (
    <aside className="detail-pane">
      <section className="identity-card file-identity">
        <AvatarMark icon={Bot} active />
        <h2>secretary/</h2>
        <p>Agent home container</p>
      </section>
      <section className="info-stack">
        <InfoRow label="Path" value="/.data/agents/secretary/" />
        <InfoRow label="Profile" value="/.data/agents/secretary/profile.ttl" />
        <InfoRow label="Config" value="config / skills / mcp / backends" />
        <InfoRow label="Modified" value="Today 09:44" />
        <InfoRow label="Permission" value="Private" />
        <InfoRow label="Type" value="Agent home" />
      </section>
      <div className="primary-actions vertical">
        <button className="primary"><ExternalIcon /> 打开</button>
        <button><Download size={15} /> 下载</button>
      </div>
    </aside>
  )
}

function FavoritesList() {
  return (
    <section className="list-pane">
      <SearchHeader placeholder="Search saved" />
      <div className="folder-tabs">
        {['All', 'Msg', 'File', 'Link', 'Contact'].map((tab, index) => (
          <button className={index === 0 ? 'active' : ''} key={tab}>{tab}</button>
        ))}
      </div>
      <div className="list-scroll grouped">
        {favorites.map((group) => (
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

function FavoritesMain() {
  return (
    <main className="work-pane favorites-work">
      <header className="work-header">
        <div>
          <h1>Favorites</h1>
          <p>回到原消息、原文件、原联系人</p>
        </div>
        <TopTools />
      </header>
      <section className="saved-feed">
        {favorites.map((group) => (
          <div className="saved-group" key={group.group}>
            <h2>{group.group}</h2>
            {group.items.map((item) => {
              const Icon = item.icon
              return (
                <button className={item.active ? 'active' : ''} key={item.id}>
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

function ExternalIcon() {
  return <ChevronRight size={15} />
}

function ModuleSurface({ activeModule }: { activeModule: ModuleId }) {
  if (activeModule === 'contacts') {
    return (
      <>
        <ContactsList />
        <ContactsMain />
        <ContactsDetail />
      </>
    )
  }
  if (activeModule === 'files') {
    return (
      <>
        <FilesList />
        <FilesMain />
        <FilesDetail />
      </>
    )
  }
  if (activeModule === 'favorites') {
    return (
      <>
        <FavoritesList />
        <FavoritesMain />
        <FavoritesDetail />
      </>
    )
  }
  return (
    <>
      <ChatList />
      <ChatMain />
      <ChatDetail />
    </>
  )
}

function PrototypeApp() {
  const [activeModule, setActiveModule] = useState<ModuleId>('chat')

  return (
    <div className="prototype-page light">
      <div className="principle-badge">Mindset prototype · chat-first</div>
      <div className="prototype-shell" data-module={activeModule}>
        <Sidebar activeModule={activeModule} onChangeModule={setActiveModule} />
        <ModuleSurface activeModule={activeModule} />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PrototypeApp />
  </React.StrictMode>,
)
