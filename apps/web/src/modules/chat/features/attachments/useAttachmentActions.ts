import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { Attachment } from '@/lib/vendor/xpod-chatkit'
import type { LocalChatKitFetch } from '../../services/chatkit-local/fetch-handler'

interface UseAttachmentActionsOptions {
  localFetch: LocalChatKitFetch
  threadId: string
  attachments: readonly Attachment[]
  setAttachments: Dispatch<SetStateAction<Attachment[]>>
}

export function useAttachmentActions({ localFetch, threadId, attachments, setAttachments }: UseAttachmentActionsOptions) {
  const [isOpen, setIsOpen] = useState(false)
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)
  const [loadingAttachmentId, setLoadingAttachmentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (attachment: Attachment): Promise<Attachment | null> => {
    setLoadingAttachmentId(attachment.id)
    setError(null)
    try {
      const objectUrl = await localFetch.loadAttachmentObjectUrl(attachment.id)
      const loaded = {
        ...attachment,
        ...(attachment.type === 'image' ? { preview_url: objectUrl } : {}),
        download_url: objectUrl,
      }
      setAttachments((current) => current.map((entry) => entry.id === loaded.id ? loaded : entry))
      return loaded
    } catch (loadError) {
      console.error('[ChatKit] Failed to load attachment:', loadError)
      setError('附件读取失败，请重试。')
      return null
    } finally {
      setLoadingAttachmentId(null)
    }
  }, [localFetch, setAttachments])

  const preview = useCallback(async (attachment: Attachment) => {
    const loaded = attachment.preview_url ? attachment : await load(attachment)
    if (loaded) setPreviewAttachment(loaded)
  }, [load])
  const download = useCallback(async (attachment: Attachment) => {
    const loaded = attachment.download_url ? attachment : await load(attachment)
    if (!loaded?.download_url) return
    const anchor = document.createElement('a')
    anchor.href = loaded.download_url
    anchor.download = loaded.name
    anchor.click()
  }, [load])

  useEffect(() => {
    setAttachments([])
    setPreviewAttachment(null)
    setIsOpen(false)
  }, [setAttachments, threadId])

  return {
    attachments,
    isOpen,
    setIsOpen,
    previewAttachment,
    closePreview: () => setPreviewAttachment(null),
    loadingAttachmentId,
    error,
    preview,
    download,
  }
}
