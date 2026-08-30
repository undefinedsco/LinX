import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@inrupt/solid-client-authn-browser'
import { ChatKit as ChatKitComponent, type Command } from '@openai/chatkit-react'
import { ShieldCheck, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { findLatestBranchNavigation, groupMessageSiblings, selectSiblingIndex } from '../../domain/message-tree'
import type { PendingComposerDraft } from '../../domain/conversation-workbench'
import { ProjectContextDialog } from '../../components/ProjectContextDialog'
import { MultimodalCaptureDialog } from '../../components/MultimodalCaptureDialog'
import { VoiceConversationDialog } from '../../components/VoiceConversationDialog'
import { useLocalChatKitRuntime } from './useLocalChatKitRuntime'
import { useChatConnectivity } from './useChatConnectivity'
import { useAttachmentActions } from '../attachments/useAttachmentActions'
import { AttachmentWorkspaceDialogs } from '../../ui/AttachmentWorkspaceDialogs'
import { ChatGenerationControl } from '../../ui/ChatGenerationControl'
import { MessageEditDialog } from '../../ui/MessageEditDialog'
import { useChatKitSurface } from './useChatKitSurface'
import { useAnswerReadAloud } from './useAnswerReadAloud'
import { ChatMessageDataDialogs } from './ChatMessageDataDialogs'
import { createChatWorkbenchCommands } from './chat-workbench-commands'

type WorkbenchDialog =
  | 'artifacts'
  | 'share'
  | 'project-context'
  | 'capture'
  | 'voice'
  | 'assets'
  | null

export function ChatKitPanel({
  theme,
  session,
  selectedThreadId,
  selectedChatId,
  selectedThreadTitle,
  selectedWorkspaceUri,
  persistedActiveBranchByParent,
  pendingComposerDraft,
  onComposerDraftApplied,
  onComposerDraftError,
  sendDisabled,
}: {
  theme: 'light' | 'dark'
  session: Session
  selectedThreadId: string
  selectedChatId: string
  selectedThreadTitle?: string
  selectedWorkspaceUri?: string | null
  persistedActiveBranchByParent?: Record<string, string>
  pendingComposerDraft: PendingComposerDraft | null
  onComposerDraftApplied: (draft: PendingComposerDraft) => void
  onComposerDraftError: (draft: PendingComposerDraft, error: unknown) => void
  sendDisabled: boolean
}) {
  const sessionFetch = session.fetch
  const sessionWebId = session.info.webId
  const runtime = useLocalChatKitRuntime({
    session,
    selectedThreadId,
    selectedChatId,
    selectedThreadTitle,
    persistedActiveBranchByParent,
    sendDisabled,
  })
  const {
    db,
    localFetch,
    authFetch: authFetchWithRecovery,
    threadAttachments,
    setThreadAttachments,
    threadItems: branchThreadItems,
    isGenerating,
    queuedGenerationCount,
    setQueuedGenerationCount,
    outboxRevision,
    reconnectStatus,
    setReconnectStatus,
    serviceAccessRequired,
    serviceAccessError,
    isGrantingServiceAccess,
    grantServiceAccess,
  } = runtime
  const [activeDialog, setActiveDialog] = useState<WorkbenchDialog>(null)
  const [editingMessage, setEditingMessage] = useState<{ id: string; text: string } | null>(null)
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [localActiveBranchByParent, setLocalActiveBranchByParent] = useState<Record<string, string>>({})
  const seenMessageBranchRef = useRef<{ key: string; ids: Set<string> }>({ key: '', ids: new Set() })
  const seenAnswerBranchRef = useRef<{ key: string; ids: Set<string> }>({ key: '', ids: new Set() })
  const podBaseUrl = useMemo(() => db ? resolveCurrentPodBaseUrl(db) : null, [db])
  const userMessages = useMemo(
    () => branchThreadItems.filter((item) => item.type === 'user_message'),
    [branchThreadItems],
  )
  const latestUserMessage = userMessages[userMessages.length - 1]
  const latestUserMessageText = useMemo(() => latestUserMessage?.type === 'user_message'
    ? latestUserMessage.content.flatMap((part) => part.type === 'input_text' ? [part.text] : []).join('\n').trim()
    : '', [latestUserMessage])
  const readAloud = useAnswerReadAloud(branchThreadItems)
  const workbenchCommandsRef = useRef<Command[]>([])
  const commandHandlerRef = useRef<(command: Command) => Promise<void>>(async () => undefined)
  const searchWorkbenchCommands = useCallback(async (query: string) => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const workbenchCommands = workbenchCommandsRef.current
    if (!normalizedQuery) return workbenchCommands
    return workbenchCommands.filter((command) => [command.label, command.description, command.group]
      .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)))
  }, [])
  const selectWorkbenchCommand = useCallback(
    (command: Command) => commandHandlerRef.current(command),
    [],
  )
  const attachmentActions = useAttachmentActions({
    localFetch,
    threadId: selectedThreadId,
    attachments: threadAttachments,
    setAttachments: setThreadAttachments,
  })
  const setAttachmentWorkspaceOpen = attachmentActions.setIsOpen
  const chatKitSurface = useChatKitSurface({
    theme,
    localFetch,
    selectedThreadId,
    selectedChatId,
    pendingComposerDraft,
    onComposerDraftApplied,
    onComposerDraftError,
    interrupt: runtime.interrupt,
    onCommandSearch: searchWorkbenchCommands,
    onCommandSelect: selectWorkbenchCommand,
  })
  const { surface, commands } = chatKitSurface
  const setComposerValue = surface.setDraft
  const fetchUpdates = surface.refresh
  const { isOnline, synchronize: synchronizeAfterReconnect } = useChatConnectivity({
    podBaseUrl,
    sessionFetch,
    localFetch,
    selectedThreadId,
    queuedGenerationCount,
    outboxRevision,
    setQueuedGenerationCount,
    setReconnectStatus,
    refreshSurface: fetchUpdates,
  })
  useEffect(() => setLocalActiveBranchByParent({}), [selectedThreadId])
  const activeBranchByParent = useMemo(() => ({
    ...(persistedActiveBranchByParent ?? {}),
    ...localActiveBranchByParent,
  }), [localActiveBranchByParent, persistedActiveBranchByParent])
  const userMessageGroups = useMemo(() => groupMessageSiblings(userMessages
    .map((item) => ({
      id: item.id,
      parentItemId: typeof (item as typeof item & { parent_item_id?: unknown }).parent_item_id === 'string'
        ? (item as typeof item & { parent_item_id: string }).parent_item_id
        : undefined,
      createdAt: new Date(item.created_at * 1000),
    }))), [userMessages])
  const assistantMessageGroups = useMemo(() => groupMessageSiblings(branchThreadItems
    .filter((item) => item.type === 'assistant_message')
    .map((item) => ({
      id: item.id,
      parentItemId: typeof (item as typeof item & { parent_item_id?: unknown }).parent_item_id === 'string'
        ? (item as typeof item & { parent_item_id: string }).parent_item_id
        : undefined,
      createdAt: new Date(item.created_at * 1000),
    }))), [branchThreadItems])
  const branchSelection = useMemo(() => findLatestBranchNavigation(
    userMessages.map((item) => item.id),
    userMessageGroups,
    assistantMessageGroups,
    activeBranchByParent,
  ), [activeBranchByParent, assistantMessageGroups, userMessageGroups, userMessages])
  const branchUserMessage = userMessages.find((item) => item.id === branchSelection?.userId)
  const messageBranchGroup = branchSelection?.messageGroup
  const activeUserMessageId = messageBranchGroup?.parentItemId
    ? activeBranchByParent[messageBranchGroup.parentItemId] ?? branchUserMessage?.id
    : branchUserMessage?.id
  const answerBranchGroup = branchSelection?.answerGroup
  const activeAnswerId = branchUserMessage ? activeBranchByParent[branchUserMessage.id] : undefined
  const messageBranch = useMemo(() => messageBranchGroup && messageBranchGroup.items.length > 1 ? {
    index: selectSiblingIndex(messageBranchGroup, activeUserMessageId),
    count: messageBranchGroup.items.length,
  } : undefined, [activeUserMessageId, messageBranchGroup])
  const answerBranch = useMemo(() => answerBranchGroup && answerBranchGroup.items.length > 1 ? {
    index: selectSiblingIndex(answerBranchGroup, activeAnswerId),
    count: answerBranchGroup.items.length,
  } : undefined, [activeAnswerId, answerBranchGroup])
  const workbenchCommands = useMemo(() => createChatWorkbenchCommands({
    hasEditableMessage: Boolean(latestUserMessage && latestUserMessageText),
    hasReadableAnswer: Boolean(readAloud.latestText),
    isReading: readAloud.isReading,
    canOpenProjectContext: Boolean(podBaseUrl && selectedWorkspaceUri),
    attachmentCount: attachmentActions.attachments.length,
    canOpenResources: Boolean(podBaseUrl),
    canShare: Boolean(podBaseUrl && sessionWebId),
    messageBranch,
    answerBranch,
  }), [
    answerBranch,
    attachmentActions.attachments.length,
    latestUserMessage,
    latestUserMessageText,
    messageBranch,
    podBaseUrl,
    readAloud.isReading,
    readAloud.latestText,
    selectedWorkspaceUri,
    sessionWebId,
  ])
  useEffect(() => {
    workbenchCommandsRef.current = workbenchCommands
  }, [workbenchCommands])
  useEffect(() => {
    selectNewSibling(messageBranchGroup, selectedThreadId, seenMessageBranchRef, setLocalActiveBranchByParent)
  }, [messageBranchGroup, selectedThreadId])
  useEffect(() => {
    selectNewSibling(answerBranchGroup, selectedThreadId, seenAnswerBranchRef, setLocalActiveBranchByParent)
  }, [answerBranchGroup, selectedThreadId])

  const selectBranch = useCallback(async (kind: 'message' | 'answer', direction: -1 | 1) => {
    if (!branchUserMessage) return
    const group = kind === 'message' ? messageBranchGroup : answerBranchGroup
    if (!group?.parentItemId) return
    const currentId = kind === 'message' ? activeUserMessageId : activeAnswerId
    const currentIndex = selectSiblingIndex(group, currentId)
    const nextId = group.items[currentIndex + direction]?.id
    if (!nextId) return
    setLocalActiveBranchByParent((current) => ({ ...current, [group.parentItemId!]: nextId }))
    await commands.selectBranch(nextId, group.parentItemId)
    await Promise.allSettled([
      surface.refresh(),
      localFetch.refreshThreadItems(selectedThreadId),
    ])
  }, [
    activeAnswerId,
    activeUserMessageId,
    answerBranchGroup,
    branchUserMessage,
    commands,
    localFetch,
    messageBranchGroup,
    selectedThreadId,
    surface,
  ])

  const submitEdit = async () => {
    if (!editingMessage?.text.trim()) return
    setIsSubmittingEdit(true)
    setEditError(null)
    try {
      await commands.editMessage(editingMessage.id, editingMessage.text)
      setEditingMessage(null)
      await Promise.allSettled([
        surface.refresh(),
        localFetch.refreshThreadItems(selectedThreadId),
      ])
    } catch (error) {
      setEditError(error instanceof Error ? error.message : '消息编辑失败，请重试。')
    } finally {
      setIsSubmittingEdit(false)
    }
  }

  useEffect(() => {
    commandHandlerRef.current = async (command) => {
      if (command.id === 'linx.edit-latest-message') {
        if (!latestUserMessage || !latestUserMessageText) return
        setEditError(null)
        setEditingMessage({ id: latestUserMessage.id, text: latestUserMessageText })
        return
      }
      if (command.id === 'linx.read-latest-answer') {
        readAloud.toggle()
        return
      }
      if (command.id === 'linx.previous-message-branch') return selectBranch('message', -1)
      if (command.id === 'linx.next-message-branch') return selectBranch('message', 1)
      if (command.id === 'linx.previous-answer-branch') return selectBranch('answer', -1)
      if (command.id === 'linx.next-answer-branch') return selectBranch('answer', 1)
      if (command.id === 'linx.open-project-context') setActiveDialog('project-context')
      if (command.id === 'linx.open-attachments') setAttachmentWorkspaceOpen(true)
      if (command.id === 'linx.open-capture') setActiveDialog('capture')
      if (command.id === 'linx.open-voice') setActiveDialog('voice')
      if (command.id === 'linx.open-artifacts') setActiveDialog('artifacts')
      if (command.id === 'linx.open-assets') setActiveDialog('assets')
      if (command.id === 'linx.open-share') setActiveDialog('share')
    }
    return () => {
      commandHandlerRef.current = async () => undefined
    }
  }, [
    latestUserMessage,
    latestUserMessageText,
    readAloud,
    selectBranch,
    setAttachmentWorkspaceOpen,
  ])

  return (
    <div
      data-testid="chatkit-send-boundary"
      className="relative h-full flex-1 overflow-hidden"
      aria-disabled={sendDisabled}
    >
      <ChatKitComponent
        ref={chatKitSurface.bindHost}
        control={chatKitSurface.control}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
      {chatKitSurface.loadFailed ? (
        <div role="alert" className="absolute inset-0 z-40 flex items-center justify-center bg-background/95 p-6">
          <div className="max-w-sm space-y-3 text-center">
            <p className="text-sm font-medium">聊天界面加载失败</p>
            <p className="text-sm text-muted-foreground">请检查网络后重新加载。已保存的会话和附件不会丢失。</p>
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>重新加载</Button>
          </div>
        </div>
      ) : null}
      <ChatGenerationControl active={isGenerating} onStop={() => commands.interrupt()} />
      {serviceAccessRequired ? (
        <div role="alert" className="absolute inset-x-3 top-3 z-30 flex items-center justify-between gap-4 rounded-xl border bg-background/95 px-4 py-3 shadow-md backdrop-blur">
          <div className="flex min-w-0 items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-medium">允许 Xpod AI 服务读取模型配置</p>
              <p className="text-xs text-muted-foreground">
                仅授权当前空间中的模型供应商、密钥、网关和配额配置。不会把你的身份信息发送给模型供应商；授权后会自动继续刚才的消息。
              </p>
              {serviceAccessError ? <p className="mt-1 text-xs text-destructive">{serviceAccessError}</p> : null}
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            disabled={isGrantingServiceAccess}
            onClick={() => {
              void grantServiceAccess()
                .then(() => synchronizeAfterReconnect(true))
                .catch(() => undefined)
            }}
          >
            {isGrantingServiceAccess ? '正在授权…' : '允许并继续'}
          </Button>
        </div>
      ) : null}
      {!isOnline ? (
        <div role="alert" className="absolute inset-x-3 top-3 z-20 flex items-center gap-2 rounded-lg border border-warning/25 bg-background/95 px-3 py-2 text-sm shadow-sm backdrop-blur">
          <WifiOff className="size-4 text-warning" />
          <span>
            网络已断开。仍可发送，消息会保存在本地空间并在连接恢复后自动生成。
            {queuedGenerationCount > 0 ? ` 当前有 ${queuedGenerationCount} 条等待生成。` : ''}
          </span>
        </div>
      ) : reconnectStatus !== 'idle' ? (
        <div
          role={reconnectStatus === 'error' ? 'alert' : 'status'}
          className="absolute inset-x-3 top-3 z-20 flex items-center justify-between gap-3 rounded-lg border bg-background/95 px-3 py-2 text-sm shadow-sm backdrop-blur"
        >
          <span>
            {reconnectStatus === 'syncing'
              ? queuedGenerationCount > 0
                ? `连接已恢复，正在重试 ${queuedGenerationCount} 条待生成消息…`
                : '连接已恢复，正在同步最新消息…'
              : queuedGenerationCount > 0
                ? `仍有 ${queuedGenerationCount} 条消息等待生成。`
                : '连接已恢复，但消息同步失败。'}
          </span>
          {reconnectStatus === 'error' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => {
                void synchronizeAfterReconnect(true)
              }}
            >
              重试同步
            </Button>
          ) : null}
        </div>
      ) : null}
      {readAloud.error ? <div role="alert" className="absolute right-3 top-14 z-20 rounded-lg border border-destructive/30 bg-background/95 px-3 py-2 text-xs text-destructive shadow-sm">{readAloud.error}</div> : null}
      <AttachmentWorkspaceDialogs
        open={attachmentActions.isOpen}
        onOpenChange={attachmentActions.setIsOpen}
        attachments={attachmentActions.attachments}
        error={attachmentActions.error}
        loadingAttachmentId={attachmentActions.loadingAttachmentId}
        previewAttachment={attachmentActions.previewAttachment}
        onPreview={(attachment) => void attachmentActions.preview(attachment)}
        onDownload={(attachment) => void attachmentActions.download(attachment)}
        onClosePreview={attachmentActions.closePreview}
      />
      <MessageEditDialog
        open={Boolean(editingMessage)}
        value={editingMessage?.text ?? ''}
        busy={isSubmittingEdit}
        error={editError}
        onValueChange={(text) => setEditingMessage((current) => current ? { ...current, text } : current)}
        onOpenChange={(open) => {
          if (!open && !isSubmittingEdit) setEditingMessage(null)
        }}
        onSubmit={() => { void submitEdit() }}
      />
      {db && podBaseUrl && (activeDialog === 'artifacts' || activeDialog === 'assets' || activeDialog === 'share') ? (
        <ChatMessageDataDialogs
          activeDialog={activeDialog}
          onActiveDialogChange={setActiveDialog}
          db={db}
          podBaseUrl={podBaseUrl}
          sessionWebId={sessionWebId}
          selectedChatId={selectedChatId}
          selectedThreadId={selectedThreadId}
          selectedThreadTitle={selectedThreadTitle}
          authFetch={authFetchWithRecovery}
          localFetch={localFetch}
          surface={surface}
        />
      ) : null}
      {db && podBaseUrl && selectedWorkspaceUri ? (
        <ProjectContextDialog
          open={activeDialog === 'project-context'}
          onOpenChange={(open) => setActiveDialog(open ? 'project-context' : null)}
          workspaceUri={selectedWorkspaceUri}
          db={db}
        />
      ) : null}
      <MultimodalCaptureDialog
        open={activeDialog === 'capture'}
        onOpenChange={(open) => setActiveDialog(open ? 'capture' : null)}
        onCapture={async (file) => {
          await setComposerValue({ files: [file] })
          await surface.focusComposer()
        }}
      />
      <VoiceConversationDialog
        open={activeDialog === 'voice'}
        canSend={chatKitSurface.isThreadReady && !sendDisabled}
        onOpenChange={(open) => setActiveDialog(open ? 'voice' : null)}
        assistantText={readAloud.latestText}
        isGenerating={isGenerating}
        onSend={(text) => commands.send({ text })}
      />
      {sendDisabled ? (
        <div className="absolute inset-x-0 bottom-0 z-10 flex min-h-24 items-center justify-center border-t border-warning/20 bg-background/95 px-4 text-sm text-muted-foreground">
          空间连接恢复后可继续发送
        </div>
      ) : null}
    </div>
  )
}

function selectNewSibling(
  group: ReturnType<typeof groupMessageSiblings>[number] | undefined,
  threadId: string,
  seenRef: React.MutableRefObject<{ key: string; ids: Set<string> }>,
  setActive: React.Dispatch<React.SetStateAction<Record<string, string>>>,
) {
  if (!group?.parentItemId) return
  const key = `${threadId}:${group.parentItemId}`
  const nextIds = new Set(group.items.map((item) => item.id))
  const previous = seenRef.current
  if (previous.key === key) {
    const newest = [...group.items].reverse().find((item) => !previous.ids.has(item.id))
    if (newest) {
      setActive((current) => current[group.parentItemId!] === newest.id
        ? current
        : { ...current, [group.parentItemId!]: newest.id })
    }
  }
  seenRef.current = { key, ids: nextIds }
}
