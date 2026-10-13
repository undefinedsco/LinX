import { Bookmark, BookmarkCheck, Copy, MoreHorizontal, RotateCcw, BookmarkPlus } from 'lucide-react'
import { ActionBarPrimitive, useAuiState } from '@assistant-ui/react'
import { favoriteHooks, useFavoriteList } from '@/modules/favorites/collections'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { useOptionalConversationIdentity } from '../ConversationContext'
import { RememberStrip } from './RememberStrip'
import { useChatList } from '../../../collections'
import { useSpeakerName } from './speaker'
import { useRememberMessage } from './useRememberMessage'

const buttonClass = 'inline-flex h-7 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50'

function isPodMessage(id: string): boolean {
  return /^https?:\/\//u.test(id)
}

export function messageTextOf(content: ReadonlyArray<{ type: string; text?: string }>): string {
  return content.flatMap((part) => (part.type === 'text' && part.text ? [part.text] : [])).join('\n')
}

/** Hover toolbar of a message: 复制 · 记住 · 收藏 · ⋯ (W3). */
export function MessageToolbar({ role }: { role: 'user' | 'assistant' }) {
  const id = useAuiState((state) => state.message.id)
  const content = useAuiState((state) => state.message.content)
  const identity = useOptionalConversationIdentity()
  const { toast } = useToast()
  const text = messageTextOf(content as ReadonlyArray<{ type: string; text?: string }>)
  const persisted = isPodMessage(id)
  const speaker = useSpeakerName(role)
  const { data: chats } = useChatList()
  const chatTitle = chats?.find((chat) => chat.id === identity?.chatId)?.title ?? undefined
  const memory = useRememberMessage(id, text)
  const { data: favorites = [] } = useFavoriteList({ sourceModule: 'messages' })
  const starred = favorites.some((row) => row.sourceId === id)

  const toggleStar = () => {
    void favoriteHooks.onStarredChange('messages', id, !starred, {
      title: text.replace(/\s+/gu, ' ').trim().slice(0, 40) || '消息',
      searchText: text,
      snapshotContent: text,
      snapshotAuthor: speaker ?? (role === 'user' ? identity?.selfName : identity?.agentName),
      // K7: lets 收藏 jump back to the message ("在会话中查看"); messageId is the Pod message URI.
      snapshotMeta: JSON.stringify({ chatId: identity?.chatId, chatTitle, threadId: identity?.threadId, messageId: id }),
      // Top-level copies for the favorites module (R2-C); fields it does not know yet are ignored.
      chatId: identity?.chatId, chatTitle, threadId: identity?.threadId,
    }).catch(() => toast({ variant: 'destructive', description: starred ? '没取消成功，请重试。' : '没收藏成功，请重试。' }))
  }

  return (
    <>
      <ActionBarPrimitive.Root
        className={cn('flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100', role === 'user' && 'justify-end')}
      >
        <ActionBarPrimitive.Copy className={buttonClass} aria-label="复制">
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />复制
        </ActionBarPrimitive.Copy>
        <button type="button" className={buttonClass} disabled={!persisted || !memory.canRemember} onClick={() => void memory.remember()}>
          <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />记住
        </button>
        <button type="button" className={buttonClass} disabled={!persisted} onClick={toggleStar} aria-pressed={starred}>
          {starred ? <BookmarkCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> : <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />}
          {starred ? '已收藏' : '收藏'}
        </button>
        {role === 'assistant' ? (
          <DropdownMenu>
            <DropdownMenuTrigger className={buttonClass} aria-label="更多"><MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" /></DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <ActionBarPrimitive.Reload asChild>
                <DropdownMenuItem><RotateCcw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />重新回答</DropdownMenuItem>
              </ActionBarPrimitive.Reload>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </ActionBarPrimitive.Root>
      <RememberStrip status={memory.status} onUndo={() => void memory.undo()} onRetry={() => void memory.remember()} />
      {starred ? <span className="sr-only">已收藏</span> : null}
    </>
  )
}
