import { Bookmark, BookmarkCheck, BookmarkPlus, Copy, MoreHorizontal } from 'lucide-react'
import { ActionBarPrimitive, useAuiState } from '@assistant-ui/react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { RememberStrip } from './RememberStrip'
import { MessageActionItems, messageTextOf, useMessageActions, useMessageActionsContext, type MessageActionsState, type MessageRole } from './MessageActions'
import { useRememberMessage } from './useRememberMessage'

export { messageTextOf }

const buttonClass = 'inline-flex h-7 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50'

/** Hover toolbar of a message: 复制 · 记住 · 收藏 · ⋯ (W3). The ⋯ menu and the right-click menu share one action list. */
export function MessageToolbar({ role }: { role: MessageRole }) {
  const shared = useMessageActionsContext()
  return shared ? <ToolbarBody role={role} state={shared} /> : <StandaloneToolbar role={role} />
}

function StandaloneToolbar({ role }: { role: MessageRole }) {
  const state = useMessageActions(role)
  return <ToolbarBody role={role} state={state} />
}

function ToolbarBody({ role, state }: { role: MessageRole; state: MessageActionsState }) {
  const id = useAuiState((message) => message.message.id)
  const content = useAuiState((message) => message.message.content)
  const text = messageTextOf(content as ReadonlyArray<{ type: string; text?: string }>)
  const memory = useRememberMessage(id, text)
  const { actions, starred, persisted, toggleStar } = state

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
        <button
          type="button"
          className={buttonClass}
          disabled={!persisted}
          title={persisted ? undefined : '消息保存后才能收藏'}
          onClick={toggleStar}
          aria-pressed={starred}
        >
          {starred ? <BookmarkCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> : <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />}
          {starred ? '取消收藏' : '收藏'}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger className={buttonClass} aria-label="更多"><MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" /></DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <MessageActionItems actions={actions} Item={DropdownMenuItem} />
          </DropdownMenuContent>
        </DropdownMenu>
      </ActionBarPrimitive.Root>
      <RememberStrip status={memory.status} onUndo={() => void memory.undo()} onRetry={() => void memory.remember()} />
    </>
  )
}
