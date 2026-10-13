import { AttachmentPrimitive, ComposerPrimitive, useAuiState } from '@assistant-ui/react'
import { FileText, Paperclip, Send, Square, X } from 'lucide-react'
import { cn } from '@/lib/utils'

function AttachmentChip() {
  const name = useAuiState((state) => state.attachment.name)
  const status = useAuiState((state) => state.attachment.status)
  const failed = status.type === 'incomplete'
  return (
    <AttachmentPrimitive.Root className={cn('inline-flex h-7 items-center gap-1.5 rounded-md bg-muted px-2 text-xs', failed && 'text-destructive')}>
      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="max-w-[200px] truncate">{name}</span>
      {status.type === 'running' ? <span className="text-muted-foreground">读取中</span> : null}
      {failed ? <span>打不开</span> : null}
      <AttachmentPrimitive.Remove className="rounded p-0.5 hover:bg-background" aria-label={`移除 ${name}`}>
        <X className="h-3 w-3" aria-hidden="true" />
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  )
}

/** 消息 · 发送 · 停止 — the WeChat-style input row. Attachments never block sending. */
export function Composer({ disabled, disabledReason }: { disabled?: boolean; disabledReason?: string }) {
  const running = useAuiState((state) => state.thread.isRunning)
  return (
    <ComposerPrimitive.Root className="border-t border-border bg-background px-4 py-3">
      <div className="mx-auto max-w-3xl">
        <div className="mb-2 flex flex-wrap gap-1.5 empty:hidden">
          <ComposerPrimitive.Attachments components={{ Attachment: AttachmentChip }} />
        </div>
        <div className="flex items-end gap-2 rounded-lg border border-border bg-card px-2 py-1.5 focus-within:border-primary/60">
          <ComposerPrimitive.AddAttachment
            aria-label="添加附件"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <Paperclip className="h-4 w-4" aria-hidden="true" />
          </ComposerPrimitive.AddAttachment>
          <ComposerPrimitive.Input
            rows={1}
            maxRows={6}
            aria-label="消息"
            placeholder={disabled ? disabledReason ?? '暂时不能发送' : '消息'}
            disabled={disabled}
            className="min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          {running ? (
            <ComposerPrimitive.Cancel
              aria-label="停止"
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-muted"
            >
              <Square className="h-3 w-3" aria-hidden="true" />停止
            </ComposerPrimitive.Cancel>
          ) : (
            <ComposerPrimitive.Send
              aria-label="发送"
              disabled={disabled}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />发送
            </ComposerPrimitive.Send>
          )}
        </div>
      </div>
    </ComposerPrimitive.Root>
  )
}
