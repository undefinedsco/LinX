import { ComposerPrimitive } from '@assistant-ui/react'

/** Inline edit of a sent message: 发送 creates a new version next to the old one. */
export function EditComposer() {
  return (
    <ComposerPrimitive.Root className="flex w-full min-w-[260px] max-w-[440px] flex-col gap-2 rounded-lg border border-border bg-background p-2">
      <ComposerPrimitive.Input
        aria-label="编辑消息"
        autoFocus
        rows={2}
        className="min-h-[56px] w-full resize-none bg-transparent text-sm outline-none"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">发送后会生成新的版本，原来的内容还在。</p>
        <div className="flex shrink-0 items-center gap-2">
          <ComposerPrimitive.Cancel className="h-7 rounded px-2 text-xs text-muted-foreground hover:bg-muted">取消</ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send className="h-7 rounded bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50">发送</ComposerPrimitive.Send>
        </div>
      </div>
    </ComposerPrimitive.Root>
  )
}
