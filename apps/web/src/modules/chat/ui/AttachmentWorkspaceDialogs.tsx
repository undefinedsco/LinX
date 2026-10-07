import { Download, ExternalLink, Paperclip } from 'lucide-react'
import type { Attachment } from '@/lib/vendor/xpod-chatkit'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface AttachmentWorkspaceDialogsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  attachments: readonly Attachment[]
  error: string | null
  loadingAttachmentId: string | null
  previewAttachment: Attachment | null
  onPreview: (attachment: Attachment) => void
  onDownload: (attachment: Attachment) => void
  onClosePreview: () => void
}

export function AttachmentWorkspaceDialogs({
  open,
  onOpenChange,
  attachments,
  error,
  loadingAttachmentId,
  previewAttachment,
  onPreview,
  onDownload,
  onClosePreview,
}: AttachmentWorkspaceDialogsProps) {
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>会话附件</DialogTitle><DialogDescription>附件保存在当前空间，可以预览、打开或下载。</DialogDescription></DialogHeader>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div className="grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="overflow-hidden rounded-xl border bg-muted/20">
                {attachment.type === 'image' && attachment.preview_url ? (
                  <button type="button" className="block aspect-video w-full overflow-hidden bg-muted text-left" onClick={() => onPreview(attachment)} aria-label={`打开图片 ${attachment.name}`}>
                    <img src={attachment.preview_url} alt={attachment.name} className="size-full object-cover" />
                  </button>
                ) : <div className="flex aspect-video items-center justify-center bg-muted text-muted-foreground"><Paperclip className="size-8" /></div>}
                <div className="flex items-center gap-2 p-3">
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{attachment.name}</p><p className="truncate text-xs text-muted-foreground">{attachment.mime_type}</p></div>
                  {attachment.type === 'image' ? <Button type="button" variant="ghost" size="icon" disabled={loadingAttachmentId === attachment.id} onClick={() => onPreview(attachment)} aria-label={`打开 ${attachment.name}`}><ExternalLink className="size-4" /></Button> : null}
                  <Button type="button" variant="ghost" size="icon" disabled={loadingAttachmentId === attachment.id} onClick={() => onDownload(attachment)} aria-label={`下载 ${attachment.name}`}><Download className="size-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(previewAttachment)} onOpenChange={(nextOpen) => { if (!nextOpen) onClosePreview() }}>
        <DialogContent className="max-w-5xl">
          <DialogHeader><DialogTitle>{previewAttachment?.name}</DialogTitle><DialogDescription>图片保存在当前空间。</DialogDescription></DialogHeader>
          {previewAttachment?.preview_url ? <div className="flex max-h-[75vh] items-center justify-center overflow-auto rounded-xl bg-muted/40 p-2"><img src={previewAttachment.preview_url} alt={previewAttachment.name} className="max-h-[72vh] max-w-full object-contain" /></div> : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
