import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { Attachment } from '@/lib/vendor/xpod-chatkit'
import type { LocalChatKitFetch } from '../../services/chatkit-local/fetch-handler'

/**
 * Fills the 附件 dialog with the files of the whole chat (it is one timeline
 * over several threads). Reads when the dialog opens and again whenever a send
 * (and so an upload) has finished while it is open.
 */
export function useChatAttachmentList(input: {
  enabled: boolean
  /** A send is in flight; its files are not stored yet. */
  busy: boolean
  localFetch: LocalChatKitFetch
  chatId: string
  threadId: string
  setAttachments: Dispatch<SetStateAction<Attachment[]>>
}): void {
  const { enabled, busy, localFetch, chatId, threadId, setAttachments } = input
  useEffect(() => {
    const list = localFetch.conversation.listAttachments
    if (!enabled || busy || !list) return undefined
    let cancelled = false
    list(chatId, threadId).then((listed) => {
      if (cancelled) return
      // Keep the readable links of files that were already opened.
      setAttachments((current) => listed.map((entry) => current.find((known) => known.id === entry.id && known.download_url) ?? entry))
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [enabled, busy, localFetch, chatId, threadId, setAttachments])
}
