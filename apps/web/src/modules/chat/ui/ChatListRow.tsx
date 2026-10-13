import type { KeyboardEvent } from 'react'
import { BellOff, Download, LogOut, MailOpen, Star, Trash2 } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import type { ChatListEntry } from '../domain/chat-list-model'
import { IdentityAvatar } from './IdentityAvatar'

export interface ChatListRowProps {
  entry: ChatListEntry
  isActive: boolean
  tabIndex: number
  itemRef: (node: HTMLDivElement | null) => void
  onRovingKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onOpen: () => void
  onToggleStar: () => void
  onMarkUnread: () => void
  onToggleMute: () => void
  onExport?: () => void
  onDelete: () => void
  onLeave: () => void
}

/**
 * S0b: a flat 64px WeChat-style row. Selected = background + a thin line on
 * the left; everything else lives in the right-click menu (S1b ②).
 */
export function ChatListRow({
  entry,
  isActive,
  tabIndex,
  itemRef,
  onRovingKeyDown,
  onOpen,
  onToggleStar,
  onMarkUnread,
  onToggleMute,
  onExport,
  onDelete,
  onLeave,
}: ChatListRowProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={itemRef}
          data-testid="chat-list-item"
          data-chat-id={entry.id}
          role="option"
          aria-label={entry.title}
          aria-selected={isActive}
          tabIndex={tabIndex}
          onClick={onOpen}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onOpen()
              return
            }
            onRovingKeyDown(event)
          }}
          className={cn(
            'relative flex h-16 cursor-pointer select-none items-center gap-2.5 px-3 outline-none transition-colors duration-150',
            'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50',
            isActive
              ? 'bg-layout-list-selected shadow-[inset_2px_0_0_hsl(var(--primary))]'
              : 'hover:bg-layout-list-hover',
          )}
        >
          <IdentityAvatar kind={entry.kind} text={entry.avatarText} avatarUrl={entry.avatarUrl} size="list" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className={cn('min-w-0 flex-1 truncate text-sm text-foreground', entry.isProtected && 'font-semibold')}>
                {entry.title}
              </span>
              {entry.time ? (
                <span className="shrink-0 text-[11px] text-muted-foreground">{entry.time}</span>
              ) : null}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-xs',
                  entry.previewAccent ? 'font-medium text-primary' : 'text-muted-foreground',
                )}
              >
                {entry.preview}
              </span>
              {entry.muted ? (
                <BellOff className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="免打扰" />
              ) : null}
              {entry.unreadBadge ? (
                entry.muted ? (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" aria-label={`${entry.unreadBadge} 条未读`} />
                ) : (
                  <span
                    className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground"
                    aria-label={`${entry.unreadBadge} 条未读`}
                  >
                    {entry.unreadBadge}
                  </span>
                )
              ) : null}
            </div>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-44">
        {!entry.isProtected ? (
          <ContextMenuItem onSelect={onToggleStar}>
            <Star className={cn('mr-2 h-4 w-4', entry.starred && 'fill-primary text-primary')} aria-hidden="true" />
            {entry.starred ? '取消标星' : '标星'}
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem onSelect={onMarkUnread}>
          <MailOpen className="mr-2 h-4 w-4" aria-hidden="true" />
          标为未读
        </ContextMenuItem>
        <ContextMenuItem onSelect={onToggleMute}>
          <BellOff className="mr-2 h-4 w-4" aria-hidden="true" />
          {entry.muted ? '取消免打扰' : '免打扰'}
        </ContextMenuItem>
        {onExport ? (
          <ContextMenuItem onSelect={onExport}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            导出聊天记录…
          </ContextMenuItem>
        ) : null}
        {entry.canDelete || entry.canLeave ? <ContextMenuSeparator /> : null}
        {entry.canDelete ? (
          <ContextMenuItem className="text-destructive focus:bg-destructive focus:text-destructive-foreground" onSelect={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
            删除会话…
          </ContextMenuItem>
        ) : null}
        {entry.canLeave ? (
          <ContextMenuItem className="text-destructive focus:bg-destructive focus:text-destructive-foreground" onSelect={onLeave}>
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
            退出群聊…
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}
