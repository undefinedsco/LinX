import { useMemo } from 'react'
import type { Session } from '@inrupt/solid-client-authn-browser'
import { threadRepository, type SolidDatabase } from '@undefineds.co/models'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { projectChatArtifactVersions } from '@/modules/files/domain/list/chat-files-projection'
import { ArtifactWorkspace } from '../../components/ArtifactWorkspace'
import { ChatAssetLibraryDialog } from '../../components/ChatAssetLibraryDialog'
import { ConversationShareDialog } from '../../components/ConversationShareDialog'
import { useMessageIndex, useMessageList } from '../../collections'
import { projectChatAssets } from '../../domain/chat-asset-library'
import type { ConversationSurfacePort } from '../../domain/conversation-workbench'
import type { LocalChatKitFetch } from '../../services/chatkit-local/fetch-handler'

export type ChatMessageDataDialog = 'artifacts' | 'assets' | 'share'

export function ChatMessageDataDialogs({
  activeDialog,
  onActiveDialogChange,
  db,
  podBaseUrl,
  sessionWebId,
  selectedChatId,
  selectedThreadId,
  selectedThreadTitle,
  authFetch,
  localFetch,
  surface,
}: {
  activeDialog: ChatMessageDataDialog
  onActiveDialogChange: (dialog: ChatMessageDataDialog | null) => void
  db: SolidDatabase
  podBaseUrl: string
  sessionWebId?: string
  selectedChatId: string
  selectedThreadId: string
  selectedThreadTitle?: string
  authFetch: Session['fetch']
  localFetch: LocalChatKitFetch
  surface: ConversationSurfacePort
}) {
  const { data: messageRows = [], refetch: refetchMessages } = useMessageList(selectedChatId, selectedThreadId)
  const { data: allMessageRows = [] } = useMessageIndex()
  const artifactVersions = useMemo(
    () => projectChatArtifactVersions(messageRows, `${podBaseUrl}/`),
    [messageRows, podBaseUrl],
  )
  const chatAssets = useMemo(
    () => projectChatAssets(allMessageRows, podBaseUrl),
    [allMessageRows, podBaseUrl],
  )
  const selectedThreadUri = useMemo(
    () => threadRepository.iriForChat(podBaseUrl, selectedChatId, selectedThreadId),
    [podBaseUrl, selectedChatId, selectedThreadId],
  )

  return (
    <>
      <Dialog
        open={activeDialog === 'artifacts'}
        onOpenChange={(open) => onActiveDialogChange(open ? 'artifacts' : null)}
      >
        <DialogContent className="flex h-[min(88vh,860px)] max-w-[min(96vw,1200px)] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>产物工作区</DialogTitle>
            <DialogDescription>预览运行产物、切换历史版本，或把选中版本带回对话继续修改。</DialogDescription>
          </DialogHeader>
          <ArtifactWorkspace
            versions={artifactVersions}
            authFetch={authFetch}
            onSaveVersion={async (version, content) => {
              await localFetch.saveArtifactVersion({
                threadId: selectedThreadId,
                uri: version.uri,
                name: version.name,
                mimeType: version.mimeType,
                content,
              })
              await Promise.allSettled([
                surface.refresh(),
                refetchMessages(),
                localFetch.refreshThreadItems(selectedThreadId),
              ])
            }}
            onContinue={async (version) => {
              await surface.setDraft({
                text: `请继续修改产物「${version.name}」。当前版本位于 ${version.uri}，请保留原文件并生成一个新版本。`,
              })
              await surface.focusComposer()
              onActiveDialogChange(null)
            }}
          />
        </DialogContent>
      </Dialog>
      {sessionWebId ? (
        <ConversationShareDialog
          open={activeDialog === 'share'}
          onOpenChange={(open) => onActiveDialogChange(open ? 'share' : null)}
          title={selectedThreadTitle || 'LinX 会话'}
          threadUri={selectedThreadUri}
          db={db}
          ownerWebId={sessionWebId}
          podBaseUrl={podBaseUrl}
          authFetch={authFetch}
          messages={messageRows}
        />
      ) : null}
      <ChatAssetLibraryDialog
        open={activeDialog === 'assets'}
        onOpenChange={(open) => onActiveDialogChange(open ? 'assets' : null)}
        assets={chatAssets}
        authFetch={authFetch}
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
          await surface.setDraft({ attachments: [composerAttachment] })
          await surface.focusComposer()
        }}
      />
    </>
  )
}
