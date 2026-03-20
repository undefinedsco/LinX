/**
 * ChatListPane - WeChat 桌面端风格会话列表
 * 
 * 对齐规格:
 * - 列表项高度: 64px (与 WeChat 桌面端一致)
 * - 头像: 48x48px, 圆角 4px
 * - 标题: 14px, font-weight 500
 * - 预览: 12px, 单行省略
 * - 时间: 12px, 右上角
 * - 置顶: 右上角三角标
 * - 未读: 红色圆形角标
 * - 静音: 灰色静音图标
 * 
 * 交互:
 * - 左键点击: 进入聊天
 * - 右键: 上下文菜单 (置顶、静音、标记未读、删除)
 * - 悬停: 显示更多操作按钮
 */
import { useMemo, useState, useCallback } from 'react'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { useChatStore } from '../store'
import { useChatList, useChatMutations, useChatInit, useThreadIndex } from '../collections'
import { resolveRowId } from '@linx/models'
import { useInboxItems } from '@/modules/inbox/collections'
import { isActionableInboxItem } from '@/modules/inbox/utils'
import { useToast } from '@/components/ui/use-toast'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Bot,
  Trash2,
  MailOpen,
  Star,
  BellOff,
  MoreHorizontal,
  Search,
  Plus,
  X,
  Loader2,
  UserPlus,
  Users,
  User,
  Terminal,
} from 'lucide-react'
import { AddChatDialog } from './AddChatDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import {
  fetchRuntimeSessionLog,
  isRuntimeSessionMode,
  listRuntimeSessions,
  type RuntimeSessionRecord,
} from '../runtime-client'

// ============================================
// Types
// ============================================

type ConversationKind = 'one' | 'group'
type ThreadMode = 'chat' | 'workspace'

/** Workspace thread status for preview text mapping */
type WorkspaceStatus = 'idle' | 'active' | 'waiting_approval' | 'paused' | 'completed' | 'error'

interface ChatItemData {
  id: string
  title: string
  preview: string
  timestamp: string
  starred: boolean
  muted: boolean
  unreadCount: number
  providerLogo?: string
  provider?: string
  conversationKind: ConversationKind
  threadMode: ThreadMode
  /** workspace 线程状态 */
  workspaceStatus?: WorkspaceStatus

  // -- CP0: conversation/thread differentiation fields --

  /** one-to-one: optional online status dot on avatar */
  onlineStatus?: 'online' | 'offline'

  /** group: participant avatar URLs for composite avatar (max 4) */
  participantAvatars?: string[]
  /** group: sender name prefix in preview ("Alice: ...") */
  senderName?: string
  /** group: @me badge */
  mentionedMe?: boolean

  /** workspace 线程工具标识 */
  sessionTool?: string
  runtimeSessionId?: string
  runtimeThreadId?: string
  pendingInboxCount?: number
  pendingInboxVariant?: 'approval' | 'auth_required'
}

// ============================================
// Helpers
// ============================================

const formatTimestamp = (value?: unknown): string => {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value as string)
  if (Number.isNaN(date.getTime())) return ''
  const now = Date.now()
  const diff = now - date.getTime()
  const sameDay = new Date(now).toDateString() === date.toDateString()
  if (sameDay) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString('zh-CN', { weekday: 'short' })
  }
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

/** Workspace status → preview text + color mapping */
const WORKSPACE_STATUS_MAP: Record<WorkspaceStatus, { text: string; color: string }> = {
  idle:               { text: '⏳ 待启动',   color: 'text-muted-foreground' },
  active:             { text: '🟢 运行中',   color: 'text-green-600' },
  waiting_approval:   { text: '⚠️ 等待确认', color: 'text-yellow-600' },
  paused:             { text: '⏸ 已暂停',    color: 'text-muted-foreground' },
  completed:          { text: '✅ 已完成',   color: 'text-green-600' },
  error:              { text: '❌ 错误',     color: 'text-red-600' },
}

const WORKSPACE_STATUS_PREVIEW: Record<WorkspaceStatus, string> = Object.fromEntries(
  Object.entries(WORKSPACE_STATUS_MAP).map(([key, value]) => [key, value.text])
) as Record<WorkspaceStatus, string>

function getChatIcon(chat: Pick<ChatItemData, 'conversationKind' | 'threadMode'>) {
  if (chat.threadMode === 'workspace') {
    return <Terminal strokeWidth={1.5} className="w-5 h-5" />
  }

  switch (chat.conversationKind) {
    case 'group':
      return <Users strokeWidth={1.5} className="w-5 h-5" />
    default:
      return <User strokeWidth={1.5} className="w-5 h-5" />
  }
}

/** Resolve preview text: workspace threads use status mapping, groups prefix sender name */
function resolvePreview(chat: ChatItemData): string {
  if (chat.pendingInboxVariant === 'auth_required') {
    return '🔐 等待认证'
  }
  if (chat.pendingInboxVariant === 'approval') {
    return `⚠️ 待处理授权${chat.pendingInboxCount && chat.pendingInboxCount > 1 ? ` · ${chat.pendingInboxCount} 条` : ''}`
  }
  if (chat.threadMode === 'workspace' && chat.workspaceStatus) {
    return WORKSPACE_STATUS_PREVIEW[chat.workspaceStatus]
  }
  if (chat.conversationKind === 'group' && chat.senderName) {
    return `${chat.senderName}: ${chat.preview}`
  }
  return chat.preview
}

function getWorkspaceStatusColor(status?: WorkspaceStatus): string | undefined {
  if (!status) return undefined
  return WORKSPACE_STATUS_MAP[status]?.color
}

function getInboxPreviewColor(variant?: ChatItemData['pendingInboxVariant']): string | undefined {
  if (variant === 'approval') return 'text-yellow-600'
  if (variant === 'auth_required') return 'text-blue-600'
  return undefined
}

function compareRuntimeSessions(left: RuntimeSessionRecord, right: RuntimeSessionRecord): number {
  const leftTime = new Date(left.lastActivityAt || left.updatedAt || left.createdAt).getTime()
  const rightTime = new Date(right.lastActivityAt || right.updatedAt || right.createdAt).getTime()
  return rightTime - leftTime
}

// ============================================
// Chat Item Component - WeChat Desktop Style
// ============================================

interface ChatItemProps {
  chat: ChatItemData
  isActive: boolean
  onClick: () => void
  onStar: () => void
  onMute: () => void
  onMarkUnread: () => void
  onCopyLog: () => void
  onDelete: () => void
}

function ChatItem({
  chat,
  isActive,
  onClick,
  onStar,
  onMute,
  onMarkUnread,
  onCopyLog,
  onDelete
}: ChatItemProps) {
  const [isHovering, setIsHovering] = useState(false)

  const previewColorClass = chat.threadMode === 'workspace'
    ? getWorkspaceStatusColor(chat.workspaceStatus) ?? 'text-muted-foreground'
    : getInboxPreviewColor(chat.pendingInboxVariant) ?? 'text-muted-foreground'

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          onClick={onClick}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          className={cn(
            // WeChat Desktop: 64px 高度, 无圆角, 紧凑间距
            'group relative flex items-center gap-3 h-16 px-3 cursor-pointer select-none',
            'transition-colors duration-150',
            // 选中状态
            isActive
              ? 'bg-layout-list-selected'
              : [
                  // 悬停状态
                  'hover:bg-layout-list-hover',
                  // 标星(置顶)状态: 稍微加深背景色以示区分
                  chat.starred ? 'bg-muted/80' : 'bg-transparent'
                ]
          )}
        >
          {/* Avatar - 48x48, 圆角 4px */}
          <div className="relative shrink-0">
            {chat.conversationKind === 'group' && chat.participantAvatars && chat.participantAvatars.length > 1 ? (
              <div className="h-12 w-12 rounded-sm border border-border/30 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden bg-muted">
                {chat.participantAvatars.slice(0, 4).map((url, i) => (
                  <Avatar key={i} className="h-full w-full rounded-none">
                    <AvatarImage src={url} className="object-cover" />
                    <AvatarFallback className="rounded-none bg-primary/10 text-primary text-[10px]">
                      {getChatIcon({ conversationKind: 'group', threadMode: 'chat' })}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
            ) : (
              <Avatar className="h-12 w-12 border border-border/30 rounded-sm">
                <AvatarImage src={chat.providerLogo} className="rounded-sm object-cover" />
                <AvatarFallback className="rounded-sm bg-primary/10 text-primary text-sm">
                  {chat.provider ? chat.provider.slice(0, 2).toUpperCase() : getChatIcon(chat)}
                </AvatarFallback>
              </Avatar>
            )}

            {chat.conversationKind === 'one' && chat.threadMode === 'chat' && chat.onlineStatus && (
              <span className={cn(
                'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background',
                chat.onlineStatus === 'online' ? 'bg-green-500' : 'bg-muted-foreground/40'
              )} />
            )}

            {/* 未读角标 */}
            {chat.unreadCount > 0 && (
              <div className={cn(
                'absolute -top-1 -right-1 flex items-center justify-center',
                'min-w-[18px] h-[18px] px-1 rounded-full',
                'bg-wechat-unread text-white text-[10px] font-medium',
                'border-2 border-background'
              )}>
                {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 py-2 relative">
            {/* Top Row: Title + Time/Action */}
            <div className="relative mb-0.5 h-5">
              <div className="text-sm font-medium text-foreground truncate pr-[60px]">
                {chat.title}
              </div>

              {/* Time or Action - Absolute Right */}
              <div className="absolute right-0 top-0 h-full flex items-center justify-end gap-1 z-10">
                {isHovering ? (
                  <div className="flex items-center gap-0.5 animate-in fade-in zoom-in-95 duration-150">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10"
                      onClick={(e) => { e.stopPropagation(); onStar(); }}
                      title={chat.starred ? '取消标星' : '标星'}
                    >
                      <Star strokeWidth={1.5} className={cn("w-4 h-4", chat.starred && "fill-amber-500 text-amber-500")} />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal strokeWidth={1.5} className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMute() }}>
                          <BellOff strokeWidth={1.5} className={cn('mr-2 h-4 w-4', chat.muted && 'text-wechat-muted')} />
                          {chat.muted ? '取消静音' : '静音'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMarkUnread() }}>
                          <MailOpen strokeWidth={1.5} className="mr-2 h-4 w-4" />
                          标记未读
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                          onClick={(e) => { e.stopPropagation(); onDelete() }}
                        >
                          <Trash2 strokeWidth={1.5} className="mr-2 h-4 w-4" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ) : (
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {chat.timestamp}
                  </span>
                )}
              </div>
            </div>

            {/* Bottom Row: Preview + Badges (spec §7.7) */}
            <div className="flex items-center justify-between gap-2">
              <p className={cn('text-xs truncate flex-1', previewColorClass)}>
                {resolvePreview(chat)}
              </p>
              <div className="flex items-center gap-1 shrink-0">
                {chat.conversationKind === 'group' && chat.mentionedMe && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium whitespace-nowrap">
                    @我
                  </span>
                )}
                {chat.muted && (
                  <BellOff strokeWidth={1.5} className="w-3 h-3 text-wechat-muted" />
                )}
              </div>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>

      {/* Context Menu — conversation/thread differentiated */}
      <ContextMenuContent className="w-40">
        <ContextMenuItem onClick={onStar}>
          <Star className={cn('mr-2 h-4 w-4', chat.starred && 'text-amber-500 fill-amber-500')} />
          {chat.starred ? '取消标星' : '标星'}
        </ContextMenuItem>
        <ContextMenuItem onClick={onMute}>
          <BellOff strokeWidth={1.5} className={cn('mr-2 h-4 w-4', chat.muted && 'text-wechat-muted')} />
          {chat.muted ? '取消静音' : '静音'}
        </ContextMenuItem>
        {chat.threadMode !== 'workspace' && (
          <ContextMenuItem onClick={onMarkUnread}>
            <MailOpen strokeWidth={1.5} className="mr-2 h-4 w-4" />
            标记未读
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        {chat.threadMode === 'workspace' && (
          <ContextMenuItem onClick={onCopyLog}>
            <Terminal strokeWidth={1.5} className="mr-2 h-4 w-4" />
            复制日志
          </ContextMenuItem>
        )}
        {chat.conversationKind === 'group' && (
          <ContextMenuItem disabled>
            <Users strokeWidth={1.5} className="mr-2 h-4 w-4" />
            群设置
          </ContextMenuItem>
        )}
        <ContextMenuItem
          className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
          onClick={onDelete}
        >
          <Trash2 strokeWidth={1.5} className="mr-2 h-4 w-4" />
          {chat.conversationKind === 'group' ? '退出群聊' : '删除'}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

// ============================================
// List Header Component
// ============================================

interface ListHeaderProps {
  title?: React.ReactNode
  searchValue: string
  onSearchChange: (value: string) => void
  onAddClick?: () => void
  onAddFriend?: () => void
  onAddGroup?: () => void
  addButtonLabel?: string
  variant?: 'search' | 'title'
}

function ListHeader({ 
  title, 
  searchValue, 
  onSearchChange, 
  onAddClick, 
  onAddFriend,
  onAddGroup,
  addButtonLabel,
  variant = 'title'
}: ListHeaderProps) {
  const [isSearchExpanded, setIsSearchExpanded] = useState(false)

  const handleCloseSearch = useCallback(() => {
    setIsSearchExpanded(false)
    onSearchChange('')
  }, [onSearchChange])

  // Persistent Search Mode (WeChat Style)
  if (variant === 'search') {
    return (
      <div className="h-16 flex items-center gap-2 px-3 border-b border-border bg-layout-list-header shrink-0">
        <div className="relative flex-1 min-w-0">
          <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 text-muted-foreground">
            <Search strokeWidth={1.5} className="h-3.5 w-3.5" />
          </div>
          <Input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索"
            className="pl-8 pr-8 h-8 bg-muted/50 hover:bg-muted/80 focus:bg-background rounded-sm text-xs border-0 focus-visible:ring-1 transition-colors"
          />
          {searchValue && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted-foreground/20 rounded-full"
            >
              <X strokeWidth={1.5} className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
        {onAddClick && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 bg-muted/50 hover:bg-muted/80 rounded-sm"
                title={addButtonLabel || '添加'}
              >
                <Plus strokeWidth={1.5} className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={onAddClick}>
                <Bot strokeWidth={1.5} className="mr-2 h-4 w-4" />
                <span>创建助手</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onAddFriend}>
                <UserPlus strokeWidth={1.5} className="mr-2 h-4 w-4" />
                <span>添加朋友</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onAddGroup}>
                <Users strokeWidth={1.5} className="mr-2 h-4 w-4" />
                <span>发起群聊</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    )
  }

  // Title Mode (with expandable search)
  return (
    <div className="h-16 flex items-center gap-2 px-3 border-b border-border bg-layout-list-header shrink-0">
      {isSearchExpanded ? (
        <>
          <div className="relative flex-1 min-w-0">
            <Search strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜索..."
              autoFocus
              className="pl-9 pr-8 h-8 bg-background/60 rounded text-sm border-0 focus-visible:ring-1"
            />
            {searchValue && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
              >
                <X strokeWidth={1.5} className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleCloseSearch}
            className="h-8 w-8 shrink-0"
          >
            <X strokeWidth={1.5} className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <>
          <div className="flex-1 min-w-0 font-medium text-sm truncate">
            {title}
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setIsSearchExpanded(true)}
            className="h-8 w-8 shrink-0 hover:bg-muted"
          >
            <Search strokeWidth={1.5} className="h-4 w-4 text-muted-foreground" />
          </Button>
          {onAddClick && (
            <Button
              size="icon"
              variant="ghost"
              onClick={onAddClick}
              className="h-8 w-8 shrink-0 hover:bg-primary/10 hover:text-primary"
              title={addButtonLabel || '添加'}
            >
              <Plus strokeWidth={1.5} className="w-4 h-4" />
            </Button>
          )}
        </>
      )}
    </div>
  )
}

// ============================================
// Main Component
// ============================================

export interface ChatListPaneProps extends MicroAppPaneProps {}

export function ChatListPane(_props: ChatListPaneProps) {
  // Initialize chat collections with database
  useChatInit()
  const { toast } = useToast()
  
  const search = useChatStore((state) => state.search)
  const setSearch = useChatStore((state) => state.setSearch)
  const selectedChatId = useChatStore((state) => state.selectedChatId)
  const selectChat = useChatStore((state) => state.selectChat)
  const openAddDialog = useChatStore((state) => state.openAddDialog)

  // Use new collection-based hooks
  const { data: rawChats, isLoading: isChatsLoading } = useChatList(search ? { search } : undefined)
  const runtimeMode = isRuntimeSessionMode()
  const { data: threads = [] } = useThreadIndex({ enabled: runtimeMode })
  const { data: inboxItems = [] } = useInboxItems('all')
  const { data: runtimeSessions = [] } = useQuery({
    queryKey: ['runtime-sessions'],
    queryFn: () => listRuntimeSessions(),
    enabled: runtimeMode,
    refetchInterval: 5000,
  })

  const mutations = useChatMutations()

  // 格式化 Chat 列表 - 添加标星排序
  const chats: ChatItemData[] = useMemo(() => {
    if (!rawChats) return []

    const threadsByChatId = new Map<string, string[]>()
    const workspaceBackedChatIds = new Set<string>()
    for (const thread of threads) {
      const threadId = resolveRowId(thread) ?? thread.id
      const chatId = thread.chatId
      if (!threadId || !chatId) continue
      const list = threadsByChatId.get(chatId) ?? []
      list.push(threadId)
      threadsByChatId.set(chatId, list)
      if (thread.workspace) {
        workspaceBackedChatIds.add(chatId)
      }
    }

    const runtimeSessionByThreadId = new Map<string, RuntimeSessionRecord>()
    for (const session of runtimeSessions) {
      const previous = runtimeSessionByThreadId.get(session.threadId)
      if (!previous || compareRuntimeSessions(previous, session) > 0) {
        runtimeSessionByThreadId.set(session.threadId, session)
      }
    }

    const formatted = rawChats.map((chat): ChatItemData => {
      const id = resolveRowId(chat) ?? 'unknown'
      const pendingItems = inboxItems.filter((item) => item.chatId === id)
      const hasPendingApproval = pendingItems.some((item) => item.kind === 'approval' && item.status === 'pending')
      const hasAuthRequired = pendingItems.some((item) => item.category === 'auth_required')
      const pendingInboxCount = pendingItems.filter(isActionableInboxItem).length
      const pendingInboxVariant: ChatItemData['pendingInboxVariant'] =
        hasAuthRequired ? 'auth_required' : hasPendingApproval ? 'approval' : undefined
      const runtimeThreadIds = threadsByChatId.get(id) ?? []
      const linkedRuntimeSessions = runtimeThreadIds
        .map((threadId) => runtimeSessionByThreadId.get(threadId))
        .filter((session): session is RuntimeSessionRecord => !!session)
        .sort(compareRuntimeSessions)
      const runtimeSession = linkedRuntimeSessions[0]
      const hasWorkspaceContext = workspaceBackedChatIds.has(id)

      return {
        id,
        title: chat.title ?? '未命名聊天',
        preview: chat.lastMessagePreview ?? '暂无消息',
        timestamp: formatTimestamp(chat.lastActiveAt ?? chat.updatedAt),
        starred: chat.starred ?? false,
        muted: chat.muted ?? false,
        unreadCount: chat.unreadCount ?? 0,
        providerLogo: chat.avatarUrl ?? undefined,
        provider: undefined,
        conversationKind: chat.participants && chat.participants.length > 1 ? 'group' : 'one',
        threadMode: runtimeSession || hasWorkspaceContext ? 'workspace' : 'chat',
        workspaceStatus: runtimeSession?.status,
        sessionTool: runtimeSession?.tool,
        runtimeSessionId: runtimeSession?.id,
        runtimeThreadId: runtimeSession?.threadId,
        pendingInboxCount,
        pendingInboxVariant,
      }
    })
    
    // 标星的排在前面
    return formatted.sort((a, b) => {
      if (a.starred && !b.starred) return -1
      if (!a.starred && b.starred) return 1
      return 0
    })
  }, [inboxItems, rawChats, runtimeSessions, threads])

  // Handlers
  const handleAddChat = useCallback(() => {
    openAddDialog('ai')
  }, [openAddDialog])

  const handleAddFriend = useCallback(() => {
    openAddDialog('friend')
  }, [openAddDialog])

  const handleAddGroup = useCallback(() => {
    openAddDialog('group')
  }, [openAddDialog])

  const handleChatClick = useCallback((chatId: string) => {
    // WeChat style: Click to select, don't enter 'topic' list view on left
    // Topics are now in the Right Sidebar
    selectChat(chatId) 
  }, [selectChat])

  const handleStarChat = useCallback(async (chatId: string) => {
    const chat = chats.find(c => c.id === chatId)
    if (!chat) return
    try {
      await mutations.updateChat.mutateAsync({
        id: chatId,
        starred: !chat.starred,
      })
    } catch (e) {
      console.error('Star chat failed:', e)
    }
  }, [chats, mutations])

  const handleMuteChat = useCallback(async (chatId: string) => {
    const chat = chats.find(c => c.id === chatId)
    if (!chat) return
    try {
      await mutations.updateChat.mutateAsync({
        id: chatId,
        muted: !chat.muted,
      })
    } catch (e) {
      console.error('Mute chat failed:', e)
    }
  }, [chats, mutations])

  const handleMarkAsUnread = useCallback(async (chatId: string) => {
    try {
      await mutations.updateChat.mutateAsync({
        id: chatId,
        unreadCount: 1,
      })
    } catch (e) {
      console.error('Mark as unread failed:', e)
    }
  }, [mutations])

  const handleDeleteChat = useCallback(async (chatId: string) => {
    if (!confirm('确定要删除这个聊天吗？相关的话题和消息也会被删除。')) return
    try {
      await mutations.deleteChat.mutateAsync(chatId)
      if (selectedChatId === chatId) {
        selectChat(null)
      }
    } catch (e) {
      console.error('Delete chat failed:', e)
    }
  }, [selectedChatId, mutations, selectChat])

  const handleCopyLog = useCallback(async (chatId: string) => {
    const chat = chats.find((item) => item.id === chatId)
    if (!chat?.runtimeSessionId) {
      toast({
        description: '当前聊天还没有可复制的运行时日志。',
        variant: 'destructive',
      })
      return
    }

    try {
      const log = await fetchRuntimeSessionLog(chat.runtimeSessionId)
      await navigator.clipboard.writeText(log)
      toast({ description: '运行时日志已复制。' })
    } catch (error) {
      console.error('Copy runtime session log failed:', error)
      toast({
        description: error instanceof Error ? error.message : '复制运行时日志失败。',
        variant: 'destructive',
      })
    }
  }, [chats, toast])

  return (
    <div className="flex h-full flex-col bg-layout-list-item">
      <ListHeader
        title="聊天"
        searchValue={search}
        onSearchChange={setSearch}
        onAddClick={handleAddChat}
        onAddFriend={handleAddFriend}
        onAddGroup={handleAddGroup}
        addButtonLabel="新建聊天"
        variant="search"
      />
      
      <ScrollArea className="flex-1">
        {isChatsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground px-4 py-8 justify-center animate-fade-in">
            <Loader2 className="w-4 h-4 animate-spin" />
            正在加载...
          </div>
        ) : chats.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground animate-fade-in">
            暂无聊天
          </div>
        ) : (
          <div className="divide-y divide-border/30 animate-fade-in">
            {chats.map((chat) => (
              <ChatItem
                key={chat.id}
                chat={chat}
                isActive={selectedChatId === chat.id}
                onClick={() => handleChatClick(chat.id)}
                onStar={() => handleStarChat(chat.id)}
                onMute={() => handleMuteChat(chat.id)}
                onMarkUnread={() => handleMarkAsUnread(chat.id)}
                onCopyLog={() => handleCopyLog(chat.id)}
                onDelete={() => handleDeleteChat(chat.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
      
      <AddChatDialog />
    </div>
  )
}

export default ChatListPane
