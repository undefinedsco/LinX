import { useMemo, useState } from 'react'
import type { Session } from '@inrupt/solid-client-authn-browser'
import { ChatKit as ChatKitComponent } from '@openai/chatkit-react'
import { Square, WifiOff } from 'lucide-react'
import { threadRepository } from '@undefineds.co/models'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { projectChatArtifactVersions } from '@/modules/files/domain/list/chat-files-projection'
import { useChatStore } from '../../store'
import { useMessageIndex, useMessageList } from '../../collections'
import { projectChatAssets } from '../../domain/chat-asset-library'
import type { PendingComposerDraft } from '../../domain/conversation-workbench'
import { ArtifactWorkspace } from '../../components/ArtifactWorkspace'
import { ConversationShareDialog } from '../../components/ConversationShareDialog'
import { ProjectContextDialog } from '../../components/ProjectContextDialog'
import { MultimodalCaptureDialog } from '../../components/MultimodalCaptureDialog'
import { VoiceConversationDialog } from '../../components/VoiceConversationDialog'
import { ChatAssetLibraryDialog } from '../../components/ChatAssetLibraryDialog'
import { MessageActionDock } from '../../ui/MessageActionDock'
import { MessageEditDialog } from '../../ui/MessageEditDialog'
import { useLocalChatKitRuntime } from './useLocalChatKitRuntime'
import { useChatConnectivity } from './useChatConnectivity'
import { useMessageActionsController } from '../messages/useMessageActionsController'
import { useAttachmentActions } from '../attachments/useAttachmentActions'
import { AttachmentWorkspaceDialogs } from '../../ui/AttachmentWorkspaceDialogs'
import { ChatWorkbenchToolbar } from '../../ui/ChatWorkbenchToolbar'
import { useChatKitSurface } from './useChatKitSurface'
import { useAnswerReadAloud } from './useAnswerReadAloud'

type WorkbenchDialog =
  | 'artifacts'
  | 'share'
  | 'project-context'
  | 'capture'
  | 'voice'
  | 'assets'
  | null

export function ChatKitPanel({
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
  const setActiveBranch = useChatStore((state) => state.setActiveBranch)
  const localActiveBranchByParent = useChatStore((state) => state.activeBranchByParent)
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
  } = runtime
  const [activeDialog, setActiveDialog] = useState<WorkbenchDialog>(null)
  const attachmentActions = useAttachmentActions({
    localFetch,
    threadId: selectedThreadId,
    attachments: threadAttachments,
    setAttachments: setThreadAttachments,
  })
  const chatKitSurface = useChatKitSurface({
    localFetch,
    selectedThreadId,
    selectedChatId,
    pendingComposerDraft,
    onComposerDraftApplied,
    onComposerDraftError,
    interrupt: runtime.interrupt,
  })
  const { surface, commands } = chatKitSurface
  const setComposerValue = surface.setDraft
  const fetchUpdates = surface.refresh
  const { data: messageRows = [], refetch: refetchMessages } = useMessageList(selectedChatId, selectedThreadId)
  const { data: allMessageRows = [] } = useMessageIndex({ enabled: Boolean(db) })
  const messageActions = useMessageActionsController({
    messageRows,
    threadItems: branchThreadItems,
    persistedActiveBranchByParent,
    localActiveBranchByParent,
    setActiveBranch,
    commands,
    surface,
    refreshMessages: refetchMessages,
    refreshThreadItems: () => localFetch.refreshThreadItems(selectedThreadId),
  })
  const podBaseUrl = useMemo(() => db ? resolveCurrentPodBaseUrl(db) : null, [db])
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
    refreshMessages: refetchMessages,
  })
  const chatAssets = useMemo(() => {
    return podBaseUrl ? projectChatAssets(allMessageRows, podBaseUrl) : []
  }, [allMessageRows, podBaseUrl])
  const selectedThreadUri = useMemo(() => {
    return podBaseUrl
      ? threadRepository.iriForChat(podBaseUrl, selectedChatId, selectedThreadId)
      : null
  }, [podBaseUrl, selectedChatId, selectedThreadId])
  const artifactVersions = useMemo(() => {
    return podBaseUrl
      ? projectChatArtifactVersions(messageRows, `${podBaseUrl}/`)
      : []
  }, [messageRows, podBaseUrl])
  const readAloud = useAnswerReadAloud(branchThreadItems)

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
      {isGenerating ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="absolute bottom-20 left-1/2 z-30 h-9 -translate-x-1/2 gap-2 rounded-full bg-background/95 px-4 shadow-md backdrop-blur"
          aria-label="停止生成"
          onClick={() => commands.interrupt()}
        >
          <Square className="size-3 fill-current" />
          停止生成
        </Button>
      ) : null}
      {messageActions.selectedItem && !isGenerating ? (
        <MessageActionDock
          items={messageActions.items}
          selectedItem={messageActions.selectedItem}
          messageBranch={messageActions.messageBranch}
          answerBranch={messageActions.answerBranch}
          onSelect={messageActions.selectMessage}
          onPreviousMessageBranch={messageActions.previousMessageBranch}
          onNextMessageBranch={messageActions.nextMessageBranch}
          onPreviousAnswerBranch={messageActions.previousAnswerBranch}
          onNextAnswerBranch={messageActions.nextAnswerBranch}
          onEdit={messageActions.startEditing}
          onRegenerate={() => void messageActions.regenerate()}
          onQuote={() => void messageActions.quoteSelected()}
          onDelete={() => void messageActions.deleteSelected()}
        />
      ) : null}
      <MessageEditDialog
        open={messageActions.editingMessage !== null}
        value={messageActions.editingMessage?.text ?? ''}
        onValueChange={messageActions.setEditingText}
        onOpenChange={(open) => { if (!open) messageActions.closeEditor() }}
        onSubmit={() => void messageActions.submitEdit()}
      />
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
      <ChatWorkbenchToolbar
        showProjectContext={Boolean(podBaseUrl && selectedWorkspaceUri)}
        attachmentCount={attachmentActions.attachments.length}
        artifactCount={artifactVersions.length}
        assetCount={chatAssets.length}
        canOpenAssets={Boolean(podBaseUrl)}
        canShare={Boolean(podBaseUrl && sessionWebId)}
        canReadAnswer={Boolean(readAloud.latestText)}
        isReading={readAloud.isReading}
        onOpenProjectContext={() => setActiveDialog('project-context')}
        onOpenAttachments={() => attachmentActions.setIsOpen(true)}
        onOpenCapture={() => setActiveDialog('capture')}
        onOpenVoice={() => setActiveDialog('voice')}
        onToggleReadAloud={readAloud.toggle}
        onOpenArtifacts={() => setActiveDialog('artifacts')}
        onOpenAssets={() => setActiveDialog('assets')}
        onOpenShare={() => setActiveDialog('share')}
      />
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
      <Dialog
        open={activeDialog === 'artifacts'}
        onOpenChange={(open) => setActiveDialog(open ? 'artifacts' : null)}
      >
        <DialogContent className="flex h-[min(88vh,860px)] max-w-[min(96vw,1200px)] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>产物工作区</DialogTitle>
            <DialogDescription>预览运行产物、切换历史版本，或把选中版本带回对话继续修改。</DialogDescription>
          </DialogHeader>
          <ArtifactWorkspace
            versions={artifactVersions}
            authFetch={authFetchWithRecovery}
            onSaveVersion={async (version, content) => {
              await localFetch.saveArtifactVersion({
                threadId: selectedThreadId,
                uri: version.uri,
                name: version.name,
                mimeType: version.mimeType,
                content,
              })
              await Promise.allSettled([
                fetchUpdates(),
                refetchMessages(),
                localFetch.refreshThreadItems(selectedThreadId),
              ])
            }}
            onContinue={async (version) => {
              await setComposerValue({
                text: `请继续修改产物「${version.name}」。当前版本位于 ${version.uri}，请保留原文件并生成一个新版本。`,
              })
              await surface.focusComposer()
              setActiveDialog(null)
            }}
          />
        </DialogContent>
      </Dialog>
      {db && podBaseUrl && sessionWebId && selectedThreadUri ? (
        <ConversationShareDialog
          open={activeDialog === 'share'}
          onOpenChange={(open) => setActiveDialog(open ? 'share' : null)}
          title={selectedThreadTitle || 'LinX 会话'}
          threadUri={selectedThreadUri}
          db={db}
          ownerWebId={sessionWebId}
          podBaseUrl={podBaseUrl}
          authFetch={authFetchWithRecovery}
          messages={messageRows}
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
      {podBaseUrl ? (
        <ChatAssetLibraryDialog
          open={activeDialog === 'assets'}
          onOpenChange={(open) => setActiveDialog(open ? 'assets' : null)}
          assets={chatAssets}
          authFetch={authFetchWithRecovery}
          onReuse={async (asset) => {
            const attachment = await localFetch.prepareAttachmentForReuse(asset)
            if (attachment.type === 'image' && !attachment.preview_url) {
              throw new Error('图片预览尚未就绪，请重试。')
            }
            const composerAttachment = attachment.type === 'image'
              ? {
                  type: 'image' as const,
                  id: attachment.id,
                  name: attachment.name,
                  mime_type: attachment.mime_type,
                  preview_url: attachment.preview_url!,
                }
              : {
                  type: 'file' as const,
                  id: attachment.id,
                  name: attachment.name,
                  mime_type: attachment.mime_type,
                }
            await setComposerValue({ attachments: [composerAttachment] })
            await surface.focusComposer()
          }}
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
