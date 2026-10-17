import { useEffect, useMemo, useState } from 'react'
import { useAui, useAuiState } from '@assistant-ui/react'
import { useInboxItems } from '@/modules/inbox/collections'
import type { InboxItem } from '@/modules/inbox/domain/inbox-item'
import { decisionKind } from '@/modules/inbox/domain/decision-card'
import { isActionableInboxItem } from '@/modules/inbox/utils'
import { resourceMatches } from './card-model'
import { ApprovalBody, InputBody, LoginBody } from './DecisionCards'

// The chat is one timeline over its internal threads, so a request raised in
// any of them (a scheduled run, a successor thread) is waiting in this chat.
function sameTopic(item: InboxItem, chatId: string): boolean {
  return item.chatId === chatId && decisionKind(item) !== null
}

function shownInMessages(item: InboxItem, shownUris: readonly string[]): boolean {
  return shownUris.some((uri) => (
    (item.approval && resourceMatches(item.approval.id, uri))
    || (item.inputRequest && resourceMatches(item.inputRequest.id, uri))
  ))
}

/**
 * Requests this topic raised that no message card shows (the local runtime
 * writes them to the Pod without a card event). Same cards, same resources,
 * so answering here, in a message or in the inbox is one and the same act.
 */
const NO_ITEMS: never[] = []

export function TailDecisions({ chatId }: { chatId: string; threadId?: string }) {
  const { data: items = NO_ITEMS } = useInboxItems('all')
  const aui = useAui()
  // Select a string, not a fresh array: a new array every snapshot makes the
  // store look changed on each render and loops forever.
  const shownKey = useAuiState((state) => state.thread.messages.flatMap((message) => (
    message.content.flatMap((part) => (
      part.type === 'tool-call' && part.toolCallId.startsWith('a2ui:') ? [part.toolCallId.slice('a2ui:'.length)] : []
    ))
  )).join('\n'))
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set())

  const topicItems = useMemo(
    () => items.filter((item) => sameTopic(item, chatId)),
    [chatId, items],
  )
  useEffect(() => {
    const pending = topicItems.filter(isActionableInboxItem).map((item) => item.id)
    if (pending.every((id) => seen.has(id))) return
    setSeen((current) => new Set([...current, ...pending]))
  }, [seen, topicItems])
  useEffect(() => setSeen(new Set()), [chatId])

  const visible = useMemo(
    () => topicItems.filter((item) => !shownInMessages(item, shownKey ? shownKey.split('\n') : [])
      && (isActionableInboxItem(item) || seen.has(item.id))),
    [seen, shownKey, topicItems],
  )
  if (visible.length === 0) return null
  const reask = (title: string) => aui.thread().append(`请重新问我：${title}`)
  const interject = (text: string) => aui.thread().append(text)

  return (
    <section aria-label="等你处理" className="flex flex-col gap-3">
      {visible.map((item) => {
        const kind = decisionKind(item)
        const props = { uri: item.id, item, onReask: reask }
        return (
          <div key={item.id} className="flex items-start gap-2.5">
            <span aria-hidden="true" className="h-9 w-9 shrink-0" />
            {kind === 'input'
              ? <InputBody {...props} onInterject={interject} />
              : kind === 'login' ? <LoginBody {...props} /> : <ApprovalBody {...props} />}
          </div>
        )
      })}
    </section>
  )
}
