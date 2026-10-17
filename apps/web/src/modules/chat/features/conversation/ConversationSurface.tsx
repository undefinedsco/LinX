/**
 * The AG-UI + assistant-ui conversation (spec §3.1): the chat UI.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@inrupt/solid-client-authn-browser'
import { AssistantRuntimeProvider, ExportedMessageRepository, WebSpeechDictationAdapter, type ThreadHistoryAdapter } from '@assistant-ui/react'
import { fromAgUiMessages, useAgUiRuntime, type UseAgUiRuntimeOptions } from '@assistant-ui/react-ag-ui'
import { ShieldCheck, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import type { PendingComposerDraft } from '../../domain/conversation-workbench'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { useLocalChatRuntime } from './useLocalChatRuntime'
import { useChatConnectivity } from './useChatConnectivity'
import { LinxConversationAgent } from './ag-ui/agent'
import { ConversationProvider, useResolveConversationIdentity } from './ConversationContext'
import { ConversationThread } from './ConversationThread'
import { localAttachmentAdapter } from './local-attachments'
import { createFeedbackAdapter, withSavedFeedback } from './ui/message-actions/feedback'
import type { InlineWelcome } from './welcome/WelcomeConversation'
import { ConversationDialogs } from './ConversationDialogs'
import { usePersistVersionChoice } from './usePersistVersionChoice'
import { useWorkbenchDialogs } from './workbench-dialogs'
import { ComposerToolsContext } from './ui/composer-tools'
import { StopStateContext } from './ui/run-state'

export interface ConversationSurfaceProps {
  session: Session
  selectedThreadId: string
  selectedChatId: string
  selectedThreadTitle?: string
  persistedActiveBranchByParent?: Record<string, string>
  pendingComposerDraft: PendingComposerDraft | null
  onComposerDraftApplied: (draft: PendingComposerDraft) => void
  sendDisabled: boolean
  welcome?: InlineWelcome
}

export function ConversationSurface(props: ConversationSurfaceProps) {
  const { toast } = useToast()
  const runtime = useLocalChatRuntime({
    session: props.session,
    selectedThreadId: props.selectedThreadId,
    selectedChatId: props.selectedChatId,
    selectedThreadTitle: props.selectedThreadTitle,
    persistedActiveBranchByParent: props.persistedActiveBranchByParent,
    sendDisabled: props.sendDisabled,
    onRequestError: useCallback((message: string) => toast({ variant: 'destructive', description: message }), [toast]),
  })
  const { localFetch } = runtime
  const sessionFetch = props.session.fetch
  const podBaseUrl = useMemo(() => runtime.db ? resolveCurrentPodBaseUrl(runtime.db) : null, [runtime.db])
  const [tool, setTool] = useState<'web_search' | 'image_generation' | null>(null)
  const toolRef = useRef(tool)
  toolRef.current = tool
  const takeInferenceOptions = useCallback(() => {
    if (!toolRef.current) return undefined
    const id = toolRef.current
    setTool(null) // 联网搜索 / 生成图片 apply to one message
    return { tool_choice: { id } }
  }, [])
  const composerTools = useMemo(() => ({
    webSearch: tool === 'web_search',
    setWebSearch: (on: boolean) => setTool(on ? 'web_search' : null),
    imageGeneration: tool === 'image_generation',
    setImageGeneration: (on: boolean) => setTool(on ? 'image_generation' : null),
  }), [tool])
  useEffect(() => () => useWorkbenchDialogs.getState().close(), [])
  const agent = useMemo(
    () => new LinxConversationAgent({
      localThreadId: props.selectedThreadId,
      threadUri: props.selectedThreadId,
      chatId: props.selectedChatId,
      backend: localFetch.conversation,
      takeInferenceOptions,
    }),
    [localFetch, props.selectedThreadId, props.selectedChatId, takeInferenceOptions],
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
        const decorate = (messages: typeof loaded.messages) => fromAgUiMessages(messages).map((message) => {
          const maker = message.id ? loaded.makerByUri.get(message.id) : undefined
          const withMaker = maker ? { ...message, metadata: { ...message.metadata, custom: { ...message.metadata?.custom, senderRef: maker } } } : message
          // A reply that failed (as opposed to being stopped) keeps offering 重试 after reload.
          const failure = message.id ? loaded.failedByUri.get(message.id) : undefined
          const saved = withSavedFeedback(withMaker, loaded.feedbackByUri)
          return failure !== undefined && message.role === 'assistant'
            ? { ...saved, status: { type: 'incomplete' as const, reason: 'error' as const, error: failure || '这次没有完成，可以重试。' } }
            : saved
        })
        const shown = decorate(loaded.messages)
        if (loaded.alternates.length === 0) return ExportedMessageRepository.fromArray(shown)
        // Other versions of a message (edits, regenerated answers) hang beside the shown ones.
        const parentById = new Map(loaded.alternates.map(({ message, parentId }) => [message.id, parentId]))
        const hidden = decorate(loaded.alternates.map(({ message }) => message)).flatMap((message) => {
          const parentId = message.id ? parentById.get(message.id) : undefined
          return message.id && parentId !== undefined ? [{ message, parentId }] : []
        })
        const versions = [
          ...shown.map((message, index) => ({ message, parentId: index > 0 ? shown[index - 1].id ?? null : null })),
          ...hidden,
        ]
        // The picker numbers versions in the order they are added: oldest first.
        const writtenAt = (id: string | undefined) => (id ? loaded.createdAtByUri.get(id) ?? 0 : 0)
        versions.sort((left, right) => writtenAt(left.message.id) - writtenAt(right.message.id))
        return ExportedMessageRepository.fromBranchableArray(versions, { headId: shown[shown.length - 1]?.id ?? null })
      } catch {
        setLoadError(true)
        return { messages: [] }
      }
    },
    append: async () => undefined,
  }), [agent, reloadKey]) // reloadKey: "重试" builds a fresh adapter, which loads again

  const { isOnline: online, synchronize } = useChatConnectivity({
    podBaseUrl,
    sessionFetch,
    localFetch,
    selectedThreadId: props.selectedThreadId,
    setReconnectStatus: runtime.setReconnectStatus,
    refreshSurface: async () => { setReloadKey((key) => key + 1) },
  })
  const dictation = useMemo(
    () => (WebSpeechDictationAdapter.isSupported() ? new WebSpeechDictationAdapter({ language: 'zh-CN', continuous: true, interimResults: true }) : undefined),
    [],
  )
  const assistantRuntime = useAgUiRuntime({
    // assistant-ui resolves a second copy of @ag-ui/core's types; the class is the same.
    agent: agent as unknown as UseAgUiRuntimeOptions['agent'],
    adapters: { history, attachments: localAttachmentAdapter, dictation, feedback: createFeedbackAdapter(agent) },
    onError: (error) => toast({ variant: 'destructive', description: error.message || '这次没有完成，可以重试。' }),
  })
  usePersistVersionChoice(
    assistantRuntime,
    agent,
    useCallback(() => toast({ variant: 'destructive', description: '没能保存所选的版本，刷新后可能会回到之前的版本。' }), [toast]),
  )
  const identity = useResolveConversationIdentity({
    chatId: props.selectedChatId,
    threadId: props.selectedThreadId,
    threadUri,
  })

  return (
    <div data-testid="conversation-surface-host" className="relative h-full flex-1 overflow-hidden">
      <ConversationProvider value={identity}>
        <StopStateContext.Provider value={stopState}>
          <ComposerToolsContext.Provider value={composerTools}>
          <AssistantRuntimeProvider runtime={assistantRuntime}>
            <ConversationThread
              chatId={props.selectedChatId}
              threadId={props.selectedThreadId}
              sendDisabled={props.sendDisabled}
              welcome={props.welcome}
              pendingComposerDraft={props.pendingComposerDraft}
              onComposerDraftApplied={props.onComposerDraftApplied}
            />
            <ConversationDialogs
              session={props.session}
              db={runtime.db}
              podBaseUrl={podBaseUrl}
              localFetch={localFetch}
              authFetch={runtime.authFetch}
              chatId={props.selectedChatId}
              threadId={props.selectedThreadId}
              threadTitle={props.selectedThreadTitle}
              sendDisabled={props.sendDisabled}
              threadAttachments={runtime.threadAttachments}
              setThreadAttachments={runtime.setThreadAttachments}
              refresh={() => setReloadKey((key) => key + 1)}
            />
          </AssistantRuntimeProvider>
          </ComposerToolsContext.Provider>
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
          <Button size="sm" disabled={runtime.isGrantingServiceAccess} onClick={() => void runtime.grantServiceAccess().then(() => synchronize(true)).catch(() => undefined)}>
            {runtime.isGrantingServiceAccess ? '正在授权…' : '允许并继续'}
          </Button>
        </div>
      ) : null}
      {!online ? (
        <div role="alert" className="absolute inset-x-3 top-3 z-20 flex items-center gap-2 rounded-lg border bg-background/95 px-3 py-2 text-sm shadow-sm">
          <WifiOff className="size-4" />网络已断开。现在发送会失败，连上后请重新发送。
        </div>
      ) : runtime.reconnectStatus !== 'idle' ? (
        <div
          role={runtime.reconnectStatus === 'error' ? 'alert' : 'status'}
          className="absolute inset-x-3 top-3 z-20 flex items-center justify-between gap-3 rounded-lg border bg-background/95 px-3 py-2 text-sm shadow-sm"
        >
          <span>{runtime.reconnectStatus === 'syncing' ? '连接已恢复，正在同步最新消息…' : '连接已恢复，但消息同步失败。'}</span>
          {runtime.reconnectStatus === 'error' ? (
            <Button size="sm" variant="outline" onClick={() => void synchronize(true)}>重试同步</Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
