import { AlertCircle } from 'lucide-react'
import { LoginCardShell } from './LoginCardShell'
import { SWITCH_ACCOUNT_EVENT } from './login-utils'
import { clearAssistantSetupFailure, useAssistantSetupStore } from './assistant-setup'

/** S6b: signed in, space fine, the assistant is not ready. One screen, one main action. */
export function AssistantNotReadyCard() {
  const failure = useAssistantSetupStore((state) => state.failure)
  if (!failure) return null

  const retry = () => {
    clearAssistantSetupFailure()
    failure.retry?.()
  }
  const switchSpace = () => {
    clearAssistantSetupFailure()
    window.dispatchEvent(new Event(SWITCH_ACCOUNT_EVENT))
  }

  return (
    <LoginCardShell cardSize="auto" cardClassName="min-h-[320px]">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 pt-8 text-center">
        <AlertCircle className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-base font-semibold text-foreground">LinX 助手没能准备好</p>
        <p className="max-w-[19rem] text-sm leading-6 text-muted-foreground">
          账号和空间都正常，只是助手的存放位置没建成。你的数据没有受影响。
        </p>
        {failure.detail ? (
          <details className="w-full text-center">
            <summary className="inline-flex h-7 cursor-pointer list-none items-center rounded-md px-2 text-xs text-muted-foreground hover:text-foreground">
              详情
            </summary>
            <p className="mt-1 rounded-lg border border-border/60 bg-muted/25 p-3 text-left font-mono text-[11px] leading-5 text-foreground">
              {failure.detail}
            </p>
          </details>
        ) : null}
      </div>
      <div className="space-y-2 px-4 pb-4 pt-5">
        <button
          type="button"
          onClick={retry}
          className="h-9 w-full cursor-pointer rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          重试
        </button>
        <button
          type="button"
          onClick={switchSpace}
          className="h-9 w-full cursor-pointer rounded-md text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          换个空间
        </button>
      </div>
    </LoginCardShell>
  )
}
