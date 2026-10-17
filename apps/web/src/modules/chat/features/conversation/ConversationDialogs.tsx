/**
 * Hosts the chat's dialogs (项目记忆 / 附件 / 产物 / 素材 / 分享 / 截图记录 / 语音对话).
 * They open from 聊天信息 and the composer through `useWorkbenchDialogs`, and always
 * work against the thread this conversation sends to.
 */
import { useCallback, useEffect, useMemo } from 'react'
import { useAui, useAuiState } from '@assistant-ui/react'
import type { Session } from '@inrupt/solid-client-authn-browser'
import { threadRepository, type SolidDatabase } from '@undefineds.co/models'
import type { Dispatch, SetStateAction } from 'react'
import type { Attachment } from '@/lib/vendor/xpod-chatkit'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { projectChatArtifactVersions } from '@/modules/files/domain/list/chat-files-projection'
import { ArtifactWorkspace } from '../../components/ArtifactWorkspace'
import { ChatAssetLibraryDialog } from '../../components/ChatAssetLibraryDialog'
import { ConversationShareDialog } from '../../components/ConversationShareDialog'
import { MultimodalCaptureDialog } from '../../components/MultimodalCaptureDialog'
import { ProjectContextDialog } from '../../components/ProjectContextDialog'
import { VoiceConversationDialog } from '../../components/VoiceConversationDialog'
import { useMessageIndex, useMessageList, useThreadList } from '../../collections'
import { projectChatAssets } from '../../domain/chat-asset-library'
import type { LocalChatKitFetch } from '../../services/chatkit-local/fetch-handler'
import { AttachmentWorkspaceDialogs } from '../../ui/AttachmentWorkspaceDialogs'
import { useAttachmentActions } from '../attachments/useAttachmentActions'
import { useChatAttachmentList } from '../attachments/useChatAttachmentList'
import { useWorkbenchDialogs } from './workbench-dialogs'

export interface ConversationDialogsProps {
  session: Session
  db: SolidDatabase | null | undefined
  podBaseUrl: string | null
  localFetch: LocalChatKitFetch
  authFetch: Session['fetch']
  chatId: string
  threadId: string
  threadTitle?: string
  sendDisabled: boolean
  threadAttachments: Attachment[]
  setThreadAttachments: Dispatch<SetStateAction<Attachment[]>>
  refresh: () => void
}

export function ConversationDialogs(props: ConversationDialogsProps) {
  const { session, db, podBaseUrl, localFetch, authFetch, chatId, threadId, sendDisabled } = props
  const active = useWorkbenchDialogs((state) => state.active)
  const open = useWorkbenchDialogs((state) => state.open)
  const close = useWorkbenchDialogs((state) => state.close)
  const aui = useAui()
  const running = useAuiState((state) => state.thread.isRunning)
  const latestAnswer = useAuiState((state) => {
    for (let index = state.thread.messages.length - 1; index >= 0; index -= 1) {
      const message = state.thread.messages[index]
      if (message.role !== 'assistant') continue
      return message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n').trim()
    }
    return ''
  })
  const setOpen = useCallback((dialog: Exclude<typeof active, null>) => (next: boolean) => {
    if (next) open(dialog)
    else close()
  }, [close, open])
  // A dialog never outlives the chat it was opened for.
  useEffect(() => () => close(), [chatId, threadId, close])

  const { data: threads = [] } = useThreadList(chatId, { enabled: Boolean(chatId) })
  const workspaceUri = useMemo(() => {
    const row = (threads as Array<{ id?: string | null; workspace?: string | null }>).find((thread) => thread.id === threadId)
    return row?.workspace ?? null
  }, [threads, threadId])

  const attachmentActions = useAttachmentActions({
    localFetch,
    threadId,
    attachments: props.threadAttachments,
    setAttachments: props.setThreadAttachments,
  })
  useChatAttachmentList({
    enabled: active === 'attachments',
    busy: running,
    localFetch,
    chatId,
    threadId,
    setAttachments: props.setThreadAttachments,
  })

  const sessionWebId = session.info.webId
  const dataReady = Boolean(db && podBaseUrl)
  const { data: messageRows = [], refetch: refetchMessages } = useMessageList(chatId, threadId)
  const { data: allMessageRows = [] } = useMessageIndex({ enabled: dataReady && (active === 'assets') })
  const artifactVersions = useMemo(
    () => (podBaseUrl && active === 'artifacts' ? projectChatArtifactVersions(messageRows, `${podBaseUrl}/`) : []),
    [active, messageRows, podBaseUrl],
  )
  const chatAssets = useMemo(
    () => (podBaseUrl && active === 'assets' ? projectChatAssets(allMessageRows, podBaseUrl) : []),
    [active, allMessageRows, podBaseUrl],
  )
  const threadUri = useMemo(
    () => (podBaseUrl ? threadRepository.iriForChat(podBaseUrl, chatId, threadId) : ''),
    [podBaseUrl, chatId, threadId],
  )

  return (
    <>
      <AttachmentWorkspaceDialogs
        open={active === 'attachments'}
        onOpenChange={(next) => { if (!next) close() }}
        attachments={attachmentActions.attachments}
        error={attachmentActions.error}
        loadingAttachmentId={attachmentActions.loadingAttachmentId}
        previewAttachment={attachmentActions.previewAttachment}
        onPreview={(attachment) => void attachmentActions.preview(attachment)}
        onDownload={(attachment) => void attachmentActions.download(attachment)}
        onClosePreview={attachmentActions.closePreview}
      />
      {db && podBaseUrl ? (
        <>
          <Dialog open={active === 'artifacts'} onOpenChange={setOpen('artifacts')}>
            <DialogContent className="flex h-[min(88vh,860px)] max-w-[min(96vw,1200px)] flex-col gap-0 overflow-hidden p-0">
              <DialogHeader className="border-b px-5 py-4">
                <DialogTitle>产物</DialogTitle>
                <DialogDescription>预览生成的文件、切换历史版本，或把选中的版本带回聊天继续修改。</DialogDescription>
              </DialogHeader>
              <ArtifactWorkspace
                versions={artifactVersions}
                authFetch={authFetch}
                onSaveVersion={async (version, content) => {
                  await localFetch.saveArtifactVersion({
                    threadId,
                    uri: version.uri,
                    name: version.name,
                    mimeType: version.mimeType,
                    content,
                  })
                  await Promise.allSettled([refetchMessages(), localFetch.refreshThreadItems(threadId)])
                  props.refresh()
                }}
                onContinue={async (version) => {
                  aui.composer().setText(`请继续修改产物「${version.name}」。当前版本位于 ${version.uri}，请保留原文件并生成一个新版本。`)
                  close()
                }}
              />
            </DialogContent>
          </Dialog>
          {sessionWebId && active === 'share' ? (
            <ConversationShareDialog
              open
              onOpenChange={setOpen('share')}
              title={props.threadTitle || 'LinX 聊天'}
              threadUri={threadUri}
              db={db}
              ownerWebId={sessionWebId}
              podBaseUrl={podBaseUrl}
              authFetch={authFetch}
              messages={messageRows}
            />
          ) : null}
          <ChatAssetLibraryDialog
            open={active === 'assets'}
            onOpenChange={setOpen('assets')}
            assets={chatAssets}
            authFetch={authFetch}
            onReuse={async (asset) => {
              const attachment = await localFetch.prepareAttachmentForReuse(asset)
              const url = attachment.preview_url ?? attachment.download_url
              if (!url) throw new Error('文件还没准备好，请重试。')
              const response = await fetch(url)
              const blob = await response.blob()
              await aui.composer().addAttachment(new File([blob], attachment.name, { type: attachment.mime_type }))
              close()
            }}
          />
          {workspaceUri ? (
            <ProjectContextDialog
              open={active === 'project-context'}
              onOpenChange={setOpen('project-context')}
              workspaceUri={workspaceUri}
              db={db}
            />
          ) : null}
        </>
      ) : null}
      <MultimodalCaptureDialog
        open={active === 'capture'}
        onOpenChange={setOpen('capture')}
        onCapture={async (file) => { await aui.composer().addAttachment(file) }}
      />
      <VoiceConversationDialog
        open={active === 'voice'}
        canSend={!sendDisabled}
        onOpenChange={setOpen('voice')}
        assistantText={latestAnswer}
        isGenerating={running}
        onSend={async (text) => {
          aui.composer().setText(text)
          aui.composer().send()
        }}
      />
    </>
  )
}
