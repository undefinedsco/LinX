import { useEffect, useRef, useState } from 'react'
import type { InlineWelcome } from './welcome/WelcomeConversation'
import { welcomeClockSeconds } from './welcome/pending-welcome'
import { ThreadPrimitive, useAui, useAuiState } from '@assistant-ui/react'
import { ArrowDown } from 'lucide-react'
import { useChatStore } from '../../store'
import type { PendingComposerDraft } from '../../domain/conversation-workbench'
import { TailDecisions } from './cards/TailDecisions'
import { Composer } from './ui/Composer'
import { AssistantMessage, UserMessage } from './ui/Messages'
import { useAskLinxIntoComposer } from './useAskLinxIntoComposer'

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
  welcome,
  onPersistWelcome,
}: {
  chatId: string
  threadId: string
  sendDisabled: boolean
  pendingComposerDraft: PendingComposerDraft | null
  onComposerDraftApplied: (draft: PendingComposerDraft) => void
  welcome?: InlineWelcome
  /** Saves the welcome into the thread as assistant messages and shows them in the timeline. */
  onPersistWelcome?: (texts: string[], before?: number) => Promise<void>
}) {
  const aui = useAui()
  const userStarted = useAuiState((state) => state.thread.messages.some((message) => message.role === 'user'))
  const [persistFailed, setPersistFailed] = useState(false)
  const persistingRef = useRef(false)
  // When the welcome first showed: everything the person sends comes after it,
  // so the saved welcome is placed before this even if their first message is
  // still being written when the welcome is saved.
  const welcomeShownAt = useRef<number | null>(null)
  if (welcome && welcomeShownAt.current === null) welcomeShownAt.current = welcomeClockSeconds()
  // The welcome becomes real messages as soon as it has something to keep: the
  // person named the assistant, or sent a first message. Until then (and while
  // saving) the UI version stays on screen, so nothing blinks out.
  useEffect(() => {
    if (!welcome || welcome.persisted || persistingRef.current || !onPersistWelcome) return
    if (welcome.named === null && !userStarted) return
    persistingRef.current = true
    void onPersistWelcome(welcome.texts(), welcomeShownAt.current ?? undefined)
      .then(() => welcome.onPersisted())
      .catch(() => setPersistFailed(true))
  }, [welcome, userStarted, onPersistWelcome])
  const welcomeStarted = welcome?.onStarted
  const welcomeSettled = Boolean(welcome?.persisted) || persistFailed || !onPersistWelcome
  useEffect(() => {
    if (welcomeStarted && userStarted && welcomeSettled) welcomeStarted()
  }, [welcomeStarted, userStarted, welcomeSettled])
  useMessageAnchor()
  const citation = useAskLinxIntoComposer(chatId)
  const handledDraft = useRef<PendingComposerDraft | null>(null)
  useEffect(() => {
    if (!pendingComposerDraft || handledDraft.current === pendingComposerDraft) return
    handledDraft.current = pendingComposerDraft
    aui.composer().setText(pendingComposerDraft.text)
    // W0: the welcome composer already asked to send, so one press is enough.
    if (pendingComposerDraft.autoSend && !sendDisabled) aui.composer().send()
    onComposerDraftApplied(pendingComposerDraft)
  }, [aui, onComposerDraftApplied, pendingComposerDraft, sendDisabled])

  const startWith = (prompt: string) => {
    if (sendDisabled) return
    aui.composer().setText(prompt)
    aui.composer().send()
  }

  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col bg-background" data-testid="conversation-surface">
      <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-5">
          {welcome && !welcome.persisted ? welcome.content(startWith) : null}
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
          {welcome?.persisted && !userStarted ? welcome.suggestions(startWith) : null}
          <TailDecisions chatId={chatId} threadId={threadId} />
        </div>
      </ThreadPrimitive.Viewport>
      <div className="relative">
        <ThreadPrimitive.ScrollToBottom
          aria-label="回到最新消息"
          className="absolute -top-12 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs shadow-sm hover:bg-muted disabled:hidden"
        >
          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />新消息
        </ThreadPrimitive.ScrollToBottom>
      </div>
      <Composer disabled={sendDisabled} disabledReason="空间连接恢复后可继续发送" citation={citation} />
    </ThreadPrimitive.Root>
  )
}
