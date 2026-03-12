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
import { useChatList, useChatMutations, useChatInit } from '../collections'
import { resolveRowId } from '@linx/models'
import { useInboxItems } from '@/modules/inbox/collections'
import { isActionableInboxItem } from '@/modules/inbox/utils'
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
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

// ============================================
// Types
// ============================================

/** Chat type determines icon and preview rendering */
type ChatType = 'direct_ai' | 'direct_human' | 'group' | 'cli_session'

/** CLI session status for preview text mapping */
type CliSessionStatus = 'active' | 'waiting_approval' | 'paused' | 'completed' | 'error'

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
  chatType?: ChatType
  /** CLI session status (only for cli_session type) */
  cliStatus?: CliSessionStatus

  // -- CP0: chatType differentiation fields --

  /** direct_human: online status dot on avatar */
  onlineStatus?: 'online' | 'offline'

  /** group: participant avatar URLs for composite avatar (max 4) */
  participantAvatars?: string[]
  /** group: sender name prefix in preview ("Alice: ...") */
  senderName?: string
  /** group: @me badge */
  mentionedMe?: boolean

  /** cli_session: tool identifier */
  sessionTool?: 'claude-code' | 'cursor' | 'windsurf'
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

/** CLI session status → preview text + color mapping (spec §7.7) */
const CLI_STATUS_MAP: Record<CliSessionStatus, { text: string; color: string }> = {
  active:             { text: '🟢 运行中',   color: 'text-green-600' },
  waiting_approval:   { text: '⚠️ 等待确认', color: 'text-yellow-600' },
  paused:             { text: '⏸ 已暂停',    color: 'text-muted-foreground' },
  completed:          { text: '✅ 已完成',   color: 'text-green-600' },
  error:              { text: '❌ 错误',     color: 'text-red-600' },
}

/** Backward-compat alias used by resolvePreview */
const CLI_STATUS_PREVIEW: Record<CliSessionStatus, string> = Object.fromEntries(
  Object.entries(CLI_STATUS_MAP).map(([k, v]) => [k, v.text])
) as Record<CliSessionStatus, string>

/** Get avatar fallback icon by chatType */
function getChatTypeIcon(chatType?: ChatType) {
  switch (chatType) {
    case 'direct_human':
      return <User strokeWidth={1.5} className="w-5 h-5" />
    case 'group':
      return <Users strokeWidth={1.5} className="w-5 h-5" />
    case 'cli_session':
      return <Terminal strokeWidth={1.5} className="w-5 h-5" />
    case 'direct_ai':
    default:
      return <Bot strokeWidth={1.5} className="w-5 h-5" />
  }
}

/** Resolve preview text: CLI sessions use status mapping, group prefixes sender name */
function resolvePreview(chat: ChatItemData): string {
  if (chat.pendingInboxVariant === 'auth_required') {
    return '🔐 等待认证'
  }
  if (chat.pendingInboxVariant === 'approval') {
    return `⚠️ 待处理授权${chat.pendingInboxCount && chat.pendingInboxCount > 1 ? ` · ${chat.pendingInboxCount} 条` : ''}`
  }
  if (chat.chatType === 'cli_session' && chat.cliStatus) {
    return CLI_STATUS_PREVIEW[chat.cliStatus]
  }
  if (chat.chatType === 'group' && chat.senderName) {
    return `${chat.senderName}: ${chat.preview}`
  }
  return chat.preview
}

/** Get CLI status color class */
function getCliStatusColor(status?: CliSessionStatus): string | undefined {
  if (!status) return undefined
  return CLI_STATUS_MAP[status]?.color
}

function getInboxPreviewColor(variant?: ChatItemData['pendingInboxVariant']): string | undefined {
  if (variant === 'approval') return 'text-yellow-600'
  if (variant === 'auth_required') return 'text-blue-600'
  return undefined
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
  onDelete: () => void
}

function ChatItem({
  chat,
  isActive,
  onClick,
  onStar,
  onMute,
  onMarkUnread,
  onDelete
}: ChatItemProps) {
  const [isHovering, setIsHovering] = useState(false)

  // CP0: chatType-differentiated preview color (cli_session uses status color)
  const previewColorClass = chat.chatType === 'cli_session'
    ? getCliStatusColor(chat.cliStatus) ?? 'text-muted-foreground'
    : getInboxPreviewColor(chat.pendingInboxVariant) ?? 'text-muted-foreground'

  return (
    <ContextMenu>
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
          {/* Avatar - 48x48, 圆角 4px — chatType-differentiated (spec §7.7) */}
          <div className="relative shrink-0">
            {/* Group: composite 2x2 avatar grid */}
            {chat.chatType === 'group' && chat.participantAvatars && chat.participantAvatars.length > 1 ? (
              <div className="h-12 w-12 rounded-sm border border-border/30 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden bg-muted">
                {chat.participantAvatars.slice(0, 4).map((url, i) => (
                  <Avatar key={i} className="h-full w-full rounded-none">
                    <AvatarImage src={url} className="object-cover" />
                    <AvatarFallback className="rounded-none bg-primary/10 text-primary text-[10px]">
                      {getChatTypeIcon('group')}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
            ) : (
              <Avatar className="h-12 w-12 border border-border/30 rounded-sm">
                <AvatarImage src={chat.providerLogo} className="rounded-sm object-cover" />
                <AvatarFallback className="rounded-sm bg-primary/10 text-primary text-sm">
                  {chat.provider ? chat.provider.slice(0, 2).toUpperCase() : getChatTypeIcon(chat.chatType)}
                </AvatarFallback>
              </Avatar>
            )}

            {/* direct_human: online status dot (spec §7.7) */}
            {chat.chatType === 'direct_human' && chat.onlineStatus && (
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
                {/* group: @me badge */}
                {chat.chatType === 'group' && chat.mentionedMe && (
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

      {/* Context Menu — chatType-differentiated (spec §7.7) */}
      <ContextMenuContent className="w-40">
        <ContextMenuItem onClick={onStar}>
          <Star className={cn('mr-2 h-4 w-4', chat.starred && 'text-amber-500 fill-amber-500')} />
          {chat.starred ? '取消标星' : '标星'}
        </ContextMenuItem>
        <ContextMenuItem onClick={onMute}>
          <BellOff strokeWidth={1.5} className={cn('mr-2 h-4 w-4', chat.muted && 'text-wechat-muted')} />
          {chat.muted ? '取消静音' : '静音'}
        </ContextMenuItem>
        {/* direct_ai / direct_human / group: 标记未读 */}
        {chat.chatType !== 'cli_session' && (
          <ContextMenuItem onClick={onMarkUnread}>
            <MailOpen strokeWidth={1.5} className="mr-2 h-4 w-4" />
            标记未读
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        {/* cli_session: 复制日志 (placeholder) */}
        {chat.chatType === 'cli_session' && (
          <ContextMenuItem disabled>
            <Terminal strokeWidth={1.5} className="mr-2 h-4 w-4" />
            复制日志
          </ContextMenuItem>
        )}
        {/* group: 群设置 (placeholder) */}
        {chat.chatType === 'group' && (
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
          {chat.chatType === 'group' ? '退出群聊' : '删除'}
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
  
  const search = useChatStore((state) => state.search)
  const setSearch = useChatStore((state) => state.setSearch)
  const selectedChatId = useChatStore((state) => state.selectedChatId)
  const selectChat = useChatStore((state) => state.selectChat)
  const openAddDialog = useChatStore((state) => state.openAddDialog)

  // Use new collection-based hooks
  const { data: rawChats, isLoading: isChatsLoading } = useChatList(search ? { search } : undefined)
  const { data: inboxItems = [] } = useInboxItems('all')

  const mutations = useChatMutations()

  // 格式化 Chat 列表 - 添加标星排序
  const chats: ChatItemData[] = useMemo(() => {
    if (!rawChats) return []
    const formatted = rawChats.map((chat) => {
      const id = resolveRowId(chat) ?? 'unknown'
      const pendingItems = inboxItems.filter((item) => item.chatId === id)
      const hasPendingApproval = pendingItems.some((item) => item.kind === 'approval' && item.status === 'pending')
      const hasAuthRequired = pendingItems.some((item) => item.category === 'auth_required')
      const pendingInboxCount = pendingItems.filter(isActionableInboxItem).length
      const pendingInboxVariant: ChatItemData['pendingInboxVariant'] =
        hasAuthRequired ? 'auth_required' : hasPendingApproval ? 'approval' : undefined

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
        chatType: (chat.participants && chat.participants.length > 1
          ? 'group'
          : 'direct_ai') as ChatType,
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
  }, [inboxItems, rawChats])

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
