import { Bot, SendHorizontal } from 'lucide-react'
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
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-4 py-8 sm:px-6">
        <div className="w-full max-w-3xl">
          <div className="text-center">
            <span className="inline-flex items-center justify-center text-muted-foreground">
              <Bot className="size-6" aria-hidden="true" />
            </span>
            <h1 id="secretary-welcome-title" className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
              你好，我是 LinX 主理人
            </h1>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              我可以帮你整理信息、规划工作，并在当前空间中推进任务。
            </p>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {starterActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="inline-flex min-h-10 items-center rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={() => onStarterAction(action)}
              >
                {action.label}
              </button>
            ))}
          </div>

          <form
            className="mt-6"
            onSubmit={(event) => {
              event.preventDefault()
              if (canSubmit) onSubmit()
            }}
          >
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-shadow focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
              <textarea
                aria-label="给主理人发消息"
                value={composerValue}
                onChange={(event) => onComposerValueChange(event.target.value)}
                placeholder="告诉主理人你想推进什么"
                rows={3}
                className="block min-h-24 w-full resize-none bg-transparent px-5 pb-2 pt-4 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
              />
              <div className="flex h-11 items-center justify-end px-3 pb-2">
                <Button
                  type="submit"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  disabled={!canSubmit}
                  aria-label="开始对话"
                  title="开始对话"
                >
                  <SendHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
            <div className="mt-2 flex min-h-7 items-center justify-between gap-3 px-2">
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
        </div>
      </div>
    </section>
  )
}
