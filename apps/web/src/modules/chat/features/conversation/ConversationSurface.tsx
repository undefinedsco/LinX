/**
 * The AG-UI + assistant-ui conversation (spec §3.1), behind the
 * `linx.conversation.surface` switch next to ChatKit.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@inrupt/solid-client-authn-browser'
import { AssistantRuntimeProvider, ExportedMessageRepository, type ThreadHistoryAdapter } from '@assistant-ui/react'
import { fromAgUiMessages, useAgUiRuntime, type UseAgUiRuntimeOptions } from '@assistant-ui/react-ag-ui'
import { ShieldCheck, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import type { PendingComposerDraft } from '../../domain/conversation-workbench'
import { useLocalChatKitRuntime } from '../chatkit/useLocalChatKitRuntime'
import { LinxConversationAgent } from './ag-ui/agent'
import { ConversationProvider, useResolveConversationIdentity } from './ConversationContext'
import { ConversationThread } from './ConversationThread'
import { localAttachmentAdapter } from './local-attachments'
import { StopStateContext } from './ui/run-state'

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  return online
}

export interface ConversationSurfaceProps {
  session: Session
  selectedThreadId: string
  selectedChatId: string
  selectedThreadTitle?: string
  persistedActiveBranchByParent?: Record<string, string>
  pendingComposerDraft: PendingComposerDraft | null
  onComposerDraftApplied: (draft: PendingComposerDraft) => void
  sendDisabled: boolean
}

export function ConversationSurface(props: ConversationSurfaceProps) {
  const { toast } = useToast()
  const runtime = useLocalChatKitRuntime({
    session: props.session,
    selectedThreadId: props.selectedThreadId,
    selectedChatId: props.selectedChatId,
    selectedThreadTitle: props.selectedThreadTitle,
    persistedActiveBranchByParent: props.persistedActiveBranchByParent,
    sendDisabled: props.sendDisabled,
    onRequestError: useCallback((message: string) => toast({ variant: 'destructive', description: message }), [toast]),
  })
  const online = useOnline()
  const { localFetch } = runtime
  const agent = useMemo(
    () => new LinxConversationAgent({
      localThreadId: props.selectedThreadId,
      threadUri: props.selectedThreadId,
      chatId: props.selectedChatId,
      backend: localFetch.conversation,
    }),
    [localFetch, props.selectedThreadId, props.selectedChatId],
  )
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [threadUri, setThreadUri] = useState<string | null>(null)
  const [stopState, setStopState] = useState<'idle' | 'stopping'>('idle')
  useEffect(() => agent.onStopRequested(setStopState), [agent])

  const history = useMemo<ThreadHistoryAdapter>(() => ({
    load: async () => {
      try {
        void reloadKey
        const loaded = await agent.loadSettled()
        setThreadUri(agent.threadId)
        setLoadError(false)
        // W8: remember who wrote each message so group chats can show the speaker.
        const withAuthors = fromAgUiMessages(loaded.messages).map((message) => {
          const maker = message.id ? loaded.makerByUri.get(message.id) : undefined
          return maker ? { ...message, metadata: { ...message.metadata, custom: { ...message.metadata?.custom, senderRef: maker } } } : message
        })
        return ExportedMessageRepository.fromArray(withAuthors)
      } catch {
        setLoadError(true)
        return { messages: [] }
      }
    },
    append: async () => undefined,
  }), [agent, reloadKey]) // reloadKey: "重试" builds a fresh adapter, which loads again

  const assistantRuntime = useAgUiRuntime({
    // assistant-ui resolves a second copy of @ag-ui/core's types; the class is the same.
    agent: agent as unknown as UseAgUiRuntimeOptions['agent'],
    adapters: { history, attachments: localAttachmentAdapter },
    onError: (error) => toast({ variant: 'destructive', description: error.message || '这次没有完成，可以重试。' }),
  })
  const identity = useResolveConversationIdentity({
    chatId: props.selectedChatId,
    threadId: props.selectedThreadId,
    threadUri,
  })

  return (
    <div data-testid="conversation-surface-host" className="relative h-full flex-1 overflow-hidden">
      <ConversationProvider value={identity}>
        <StopStateContext.Provider value={stopState}>
          <AssistantRuntimeProvider runtime={assistantRuntime}>
            <ConversationThread
              chatId={props.selectedChatId}
              threadId={props.selectedThreadId}
              sendDisabled={props.sendDisabled}
              pendingComposerDraft={props.pendingComposerDraft}
              onComposerDraftApplied={props.onComposerDraftApplied}
            />
          </AssistantRuntimeProvider>
        </StopStateContext.Provider>
      </ConversationProvider>
      {loadError ? (
        <div role="alert" className="absolute inset-x-3 top-3 z-20 flex items-center justify-between gap-3 rounded-lg border bg-background/95 px-3 py-2 text-sm shadow-sm">
          <span>读不到这个聊天的消息。</span>
          <Button size="sm" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>重试</Button>
        </div>
      ) : null}
      {runtime.serviceAccessRequired ? (
        <div role="alert" className="absolute inset-x-3 top-3 z-30 flex items-center justify-between gap-4 rounded-xl border bg-background/95 px-4 py-3 shadow-md">
          <div className="flex min-w-0 items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-medium">允许 AI 服务读取模型配置</p>
              <p className="text-xs text-muted-foreground">仅授权当前空间中的模型配置。授权后请重新发送刚才的消息。</p>
              {runtime.serviceAccessError ? <p className="mt-1 text-xs text-destructive">{runtime.serviceAccessError}</p> : null}
            </div>
          </div>
          <Button size="sm" disabled={runtime.isGrantingServiceAccess} onClick={() => void runtime.grantServiceAccess().catch(() => undefined)}>
            {runtime.isGrantingServiceAccess ? '正在授权…' : '允许并继续'}
          </Button>
        </div>
      ) : null}
      {!online ? (
        <div role="alert" className="absolute inset-x-3 top-3 z-20 flex items-center gap-2 rounded-lg border bg-background/95 px-3 py-2 text-sm shadow-sm">
          <WifiOff className="size-4" />网络已断开。现在发送会失败，连上后请重新发送。
        </div>
      ) : null}
    </div>
  )
}
