import { ArrowRight, Bot, SendHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface SecretaryStarterAction {
  id: string
  label: string
  prompt: string
}

export interface SecretaryWelcomeProps {
  starterActions: readonly SecretaryStarterAction[]
  composerValue: string
  composerStatus: string
  onStarterAction: (action: SecretaryStarterAction) => void
  onComposerValueChange: (value: string) => void
  onSubmit: () => void
  isSubmitting?: boolean
  retryLabel?: string
  onRetry?: () => void
}

export function SecretaryWelcome({
  starterActions,
  composerValue,
  composerStatus,
  onStarterAction,
  onComposerValueChange,
  onSubmit,
  isSubmitting = false,
  retryLabel,
  onRetry,
}: SecretaryWelcomeProps) {
  const canSubmit = composerValue.trim().length > 0 && !isSubmitting

  return (
    <section
      data-testid="secretary-welcome"
      className="flex h-full min-h-0 flex-1 flex-col bg-background"
      aria-labelledby="secretary-welcome-title"
    >
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-6 py-10">
        <div className="w-full max-w-xl">
          <Bot className="mb-5 h-8 w-8 text-primary" aria-hidden="true" />
          <h1 id="secretary-welcome-title" className="text-xl font-semibold text-foreground">
            你好，我是 LinX 主理人
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            我可以帮你整理信息、规划工作，并在当前空间中推进任务。
          </p>

          <div className="mt-8 border-y border-border/70 divide-y divide-border/70">
            {starterActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="group flex min-h-12 w-full items-center justify-between gap-4 px-1 py-3 text-left text-sm text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={() => onStarterAction(action)}
              >
                <span>{action.label}</span>
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      <form
        className="bg-background px-6 pb-4 pt-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (canSubmit) onSubmit()
        }}
      >
        <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-card focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
          <textarea
            aria-label="给主理人发消息"
            value={composerValue}
            onChange={(event) => onComposerValueChange(event.target.value)}
            placeholder="告诉主理人你想推进什么"
            rows={5}
            className="block min-h-36 w-full resize-none bg-transparent px-4 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
          />
          <div className="flex h-11 items-center justify-end border-t border-border/70 px-2">
            <Button
              type="submit"
              size="icon"
              className="h-8 w-8"
              disabled={!canSubmit}
              aria-label="开始对话"
              title="开始对话"
            >
              <SendHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div className="mx-auto mt-2 flex w-full max-w-3xl items-center justify-between gap-3">
          <p role="status" className="text-xs text-muted-foreground">
            {composerStatus}
          </p>
          {retryLabel && onRetry ? (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
        </div>
      </form>
    </section>
  )
}
