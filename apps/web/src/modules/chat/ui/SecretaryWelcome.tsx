import {
  Bot,
  CalendarCheck2,
  Compass,
  FolderSearch,
  SendHorizontal,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
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

const STARTER_ICONS: Record<string, LucideIcon> = {
  organize: CalendarCheck2,
  find: FolderSearch,
  plan: Compass,
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
      className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background"
      aria-labelledby="secretary-welcome-title"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_-5%,hsl(var(--primary)/0.10),transparent_70%),radial-gradient(40%_35%_at_85%_100%,hsl(var(--primary)/0.06),transparent_70%)]"
      />
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto px-4 py-10 sm:px-6">
        <div className="w-full max-w-2xl">
          <div className="text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/25">
              <Bot className="size-7" aria-hidden="true" />
            </span>
            <h1 id="secretary-welcome-title" className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
              你好，我是 LinX 主理人
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              我可以帮你整理信息、规划工作，并在当前空间中推进任务。
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {starterActions.map((action) => {
              const Icon = STARTER_ICONS[action.id] ?? Sparkles
              return (
                <button
                  key={action.id}
                  type="button"
                  className="group flex flex-col items-start gap-3 rounded-xl border border-border/70 bg-card/80 px-4 py-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5 hover:shadow-md hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() => onStarterAction(action)}
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-medium text-foreground">{action.label}</span>
                </button>
              )
            })}
          </div>

          <form
            className="mt-8"
            onSubmit={(event) => {
              event.preventDefault()
              if (canSubmit) onSubmit()
            }}
          >
            <div className="relative rounded-2xl border border-border/70 bg-card shadow-sm transition-[border-color,box-shadow] focus-within:border-primary/50 focus-within:shadow-md focus-within:shadow-primary/5 focus-within:ring-4 focus-within:ring-primary/10">
              <textarea
                aria-label="给主理人发消息"
                value={composerValue}
                onChange={(event) => onComposerValueChange(event.target.value)}
                placeholder="告诉主理人你想推进什么"
                rows={3}
                className="block min-h-24 w-full resize-none rounded-2xl bg-transparent px-4 pb-14 pt-4 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/80"
              />
              <Button
                type="submit"
                size="icon"
                className="absolute bottom-3.5 right-3.5 h-9 w-9 rounded-full shadow-sm transition-transform enabled:hover:scale-105"
                disabled={!canSubmit}
                aria-label="开始对话"
                title="开始对话"
              >
                <SendHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="mt-2 flex min-h-7 items-center justify-between gap-3 px-1">
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
