import { createContext, useContext, type ComponentType, type ReactNode } from 'react'
import { Bookmark, BookmarkCheck, Copy, Pencil, RotateCcw, ThumbsDown, ThumbsUp, Volume2, VolumeX } from 'lucide-react'
import { ActionBarPrimitive, useAuiState } from '@assistant-ui/react'
import { favoriteHooks, useFavoriteList } from '@/modules/favorites/collections'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { useOptionalConversationIdentity } from '../ConversationContext'
import { useChatList } from '../../../collections'
import { useSpeakerName } from './speaker'
import { useReadAloud } from './message-actions/read-aloud'

export type MessageRole = 'user' | 'assistant'

export function isPodMessage(id: string): boolean {
  return /^https?:\/\//u.test(id)
}

export function messageTextOf(content: ReadonlyArray<{ type: string; text?: string }>): string {
  return content.flatMap((part) => (part.type === 'text' && part.text ? [part.text] : [])).join('\n')
}

type ActionKind = 'copy' | 'edit' | 'reload' | 'feedback-positive' | 'feedback-negative' | 'select'

/** One entry of the shared action list; the 更多 menu and the right-click menu both render it. */
export interface MessageAction {
  key: string
  kind: ActionKind
  label: string
  icon: ReactNode
  onSelect?: () => void
  /** Set for the 有用 / 没用 toggles. */
  checked?: boolean
  disabled?: boolean
  title?: string
}

export interface MessageActionsState {
  actions: MessageAction[]
  starred: boolean
  /** Favoriting needs a message saved in the Pod (its id is the Pod URI). */
  persisted: boolean
  toggleStar: () => void
}

const iconClass = 'mr-2 h-3.5 w-3.5'

export function useMessageActions(role: MessageRole): MessageActionsState {
  const id = useAuiState((state) => state.message.id)
  const content = useAuiState((state) => state.message.content)
  const feedback = useAuiState((state) => state.message.metadata?.submittedFeedback?.type)
  const identity = useOptionalConversationIdentity()
  const { toast } = useToast()
  const text = messageTextOf(content as ReadonlyArray<{ type: string; text?: string }>)
  const persisted = isPodMessage(id)
  const speaker = useSpeakerName(role)
  const { data: chats } = useChatList()
  const chatTitle = chats?.find((chat) => chat.id === identity?.chatId)?.title ?? undefined
  const { data: favorites = [] } = useFavoriteList({ sourceModule: 'messages' })
  const starred = favorites.some((row) => row.sourceId === id)
  const speech = useReadAloud(id, text, (description) => toast({ variant: 'destructive', description }))

  const toggleStar = () => {
    const next = !starred
    void favoriteHooks.onStarredChange('messages', id, next, {
      title: text.replace(/\s+/gu, ' ').trim().slice(0, 40) || '消息',
      searchText: text,
      snapshotContent: text,
      snapshotAuthor: speaker ?? (role === 'user' ? identity?.selfName : identity?.agentName),
      // K7: lets 收藏 jump back to the message ("在会话中查看"); messageId is the Pod message URI.
      snapshotMeta: JSON.stringify({ chatId: identity?.chatId, chatTitle, threadId: identity?.threadId, messageId: id }),
      // Top-level copies for the favorites module (R2-C); fields it does not know yet are ignored.
      chatId: identity?.chatId, chatTitle, threadId: identity?.threadId,
    }).then(
      () => toast({ description: next ? '已收藏，可在「收藏」里查看。' : '已取消收藏。' }),
      () => toast({ variant: 'destructive', description: next ? '没收藏成功，请重试。' : '没取消成功，请重试。' }),
    )
  }

  const actions: MessageAction[] = [
    { key: 'copy', kind: 'copy', label: '复制', icon: <Copy className={iconClass} aria-hidden="true" /> },
    {
      key: 'star',
      kind: 'select',
      label: starred ? '取消收藏' : '收藏',
      icon: starred ? <BookmarkCheck className={cn(iconClass, 'text-primary')} aria-hidden="true" /> : <Bookmark className={iconClass} aria-hidden="true" />,
      onSelect: toggleStar,
      disabled: !persisted,
      title: persisted ? undefined : '消息保存后才能收藏',
    },
  ]
  if (role === 'user') {
    actions.push({ key: 'edit', kind: 'edit', label: '编辑', icon: <Pencil className={iconClass} aria-hidden="true" /> })
  } else {
    actions.push({ key: 'reload', kind: 'reload', label: '重新回答', icon: <RotateCcw className={iconClass} aria-hidden="true" /> })
    if (speech.supported && text) {
      actions.push({
        key: 'speech',
        kind: 'select',
        label: speech.reading ? '停止朗读' : '朗读',
        icon: speech.reading ? <VolumeX className={iconClass} aria-hidden="true" /> : <Volume2 className={iconClass} aria-hidden="true" />,
        onSelect: speech.toggle,
      })
    }
    if (persisted) {
      actions.push(
        {
          key: 'useful', kind: 'feedback-positive', label: feedback === 'positive' ? '已点有用' : '有用', checked: feedback === 'positive',
          icon: <ThumbsUp className={cn(iconClass, feedback === 'positive' && 'text-primary')} aria-hidden="true" />,
        },
        {
          key: 'useless', kind: 'feedback-negative', label: feedback === 'negative' ? '已点没用' : '没用', checked: feedback === 'negative',
          icon: <ThumbsDown className={cn(iconClass, feedback === 'negative' && 'text-primary')} aria-hidden="true" />,
        },
      )
    }
  }
  return { actions, starred, persisted, toggleStar }
}

type MenuItemComponent = ComponentType<{
  children?: ReactNode
  onSelect?: () => void
  disabled?: boolean
  title?: string
  role?: string
  'aria-checked'?: boolean
}>

/** Renders the shared action list into a menu: `Item` is DropdownMenuItem or ContextMenuItem. */
export function MessageActionItems({ actions, Item }: { actions: MessageAction[]; Item: MenuItemComponent }) {
  return (
    <>
      {actions.map((action) => {
        const body = <>{action.icon}{action.label}</>
        switch (action.kind) {
          case 'copy':
            return <ActionBarPrimitive.Copy key={action.key} asChild><Item>{body}</Item></ActionBarPrimitive.Copy>
          case 'edit':
            return <ActionBarPrimitive.Edit key={action.key} asChild><Item>{body}</Item></ActionBarPrimitive.Edit>
          case 'reload':
            return <ActionBarPrimitive.Reload key={action.key} asChild><Item>{body}</Item></ActionBarPrimitive.Reload>
          case 'feedback-positive':
            return <ActionBarPrimitive.FeedbackPositive key={action.key} asChild><Item role="menuitemcheckbox" aria-checked={action.checked}>{body}</Item></ActionBarPrimitive.FeedbackPositive>
          case 'feedback-negative':
            return <ActionBarPrimitive.FeedbackNegative key={action.key} asChild><Item role="menuitemcheckbox" aria-checked={action.checked}>{body}</Item></ActionBarPrimitive.FeedbackNegative>
          default:
            return <Item key={action.key} onSelect={action.onSelect} disabled={action.disabled} title={action.title}>{body}</Item>
        }
      })}
    </>
  )
}

const MessageActionsContext = createContext<MessageActionsState | null>(null)

export function useMessageActionsContext(): MessageActionsState | null {
  return useContext(MessageActionsContext)
}

/**
 * Wraps a message so a right-click opens the same actions as 更多. The action
 * list is computed once here and shared with the hover toolbar.
 */
export function MessageActionsBoundary({ role, disabled, children }: { role: MessageRole; disabled?: boolean; children: ReactNode }) {
  const state = useMessageActions(role)
  return (
    <MessageActionsContext.Provider value={state}>
      <ContextMenu>
        <ContextMenuTrigger asChild disabled={disabled}>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <MessageActionItems actions={state.actions} Item={ContextMenuItem as MenuItemComponent} />
        </ContextMenuContent>
      </ContextMenu>
    </MessageActionsContext.Provider>
  )
}
