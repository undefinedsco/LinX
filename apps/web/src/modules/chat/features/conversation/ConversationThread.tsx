import { useEffect } from 'react'
import { ThreadPrimitive, useAui } from '@assistant-ui/react'
import { useChatStore } from '../../store'
import type { PendingComposerDraft } from '../../domain/conversation-workbench'
import { TailDecisions } from './cards/TailDecisions'
import { Composer } from './ui/Composer'
import { AssistantMessage, UserMessage } from './ui/Messages'

/** Scrolls to a message the person jumped to from search, then lets go of the anchor. */
function useMessageAnchor() {
  const anchor = useChatStore((state) => state.messageAnchorId)
  const clear = useChatStore((state) => state.clearMessageAnchor)
  useEffect(() => {
    if (!anchor) return
    const timer = window.setTimeout(() => {
      const target = Array.from(document.querySelectorAll<HTMLElement>('[data-message-id]'))
        .find((element) => element.dataset.messageId === anchor || element.dataset.messageId?.endsWith(`#${anchor}`))
      target?.scrollIntoView({ block: 'center' })
      clear()
    }, 300)
    return () => window.clearTimeout(timer)
  }, [anchor, clear])
}

export function ConversationThread({
  chatId,
  threadId,
  sendDisabled,
  pendingComposerDraft,
  onComposerDraftApplied,
}: {
  chatId: string
  threadId: string
  sendDisabled: boolean
  pendingComposerDraft: PendingComposerDraft | null
  onComposerDraftApplied: (draft: PendingComposerDraft) => void
}) {
  const aui = useAui()
  useMessageAnchor()
  useEffect(() => {
    if (!pendingComposerDraft) return
    aui.composer().setText(pendingComposerDraft.text)
    onComposerDraftApplied(pendingComposerDraft)
  }, [aui, onComposerDraftApplied, pendingComposerDraft])

  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col bg-background" data-testid="conversation-surface">
      <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-5">
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
          <TailDecisions chatId={chatId} threadId={threadId} />
        </div>
      </ThreadPrimitive.Viewport>
      <Composer disabled={sendDisabled} disabledReason="空间连接恢复后可继续发送" />
    </ThreadPrimitive.Root>
  )
}
